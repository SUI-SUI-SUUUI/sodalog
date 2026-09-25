/*
 * 新しい保存先(アプリがdrive.fileで作るフォルダ・スプレッドシート)の管理。
 *
 * STEP 4-1: 初回セットアップ(フォルダ・スプレッドシート・「記録」タブ)
 * STEP 4-2: 「場所」タブの追加と、API用の保存先の参照(読み取りのみ)
 *
 * 作成したファイルはDriveのappPropertiesで見分けるため、IDをどこにも保存せずに毎回探せる。
 * 何度呼んでも1組だけになるよう、既存があればそれを返す。
 * 本番用の保存先は正式切替時に作る方針のため、現時点ではテスト用だけを許可する。
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import type { OAuth2Client } from "google-auth-library";
import { drive, type drive_v3 } from "@googleapis/drive";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { connectWithStoredToken, describeGoogleError, type GoogleConfig } from "./google";
import { asyncHandler, requireAdmin, requireGoogleConfig } from "./http";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

// スキーマ1 = 「記録」タブ + 「場所」タブ(テスト用保存先にまだデータが無いため、4-2で定義を広げた)
export const SCHEMA_VERSION = "1";

type TabSpec = { title: string; header: string[] };

export const RECORDS_TAB: TabSpec = {
  title: "記録",
  header: [
    "記録ID",
    "記録日時",
    "作業日",
    "場所ID",
    "場所名",
    "植物タグ",
    "作業内容",
    "メモ",
    "写真ファイルID",
    "記録元",
    "更新日時",
    "削除日時",
  ],
};

export const LOCATIONS_TAB: TabSpec = {
  title: "場所",
  header: ["場所ID", "場所名", "登録日時", "更新日時", "削除日時"],
};

// 先頭のタブが、新規スプレッドシートの既定タブ(シート1)の改名先になる
const REQUIRED_TABS = [RECORDS_TAB, LOCATIONS_TAB];

const STORAGE_NAMES = {
  test: { folder: "そだログ（テスト）", spreadsheet: "そだログ記録（テスト）" },
} as const;

export type StorageEnv = keyof typeof STORAGE_NAMES;

export function isStorageEnv(value: unknown): value is StorageEnv {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STORAGE_NAMES, value);
}

type EnsuredFile = { id: string; created: boolean };

type TabResult = { tabCreated: boolean; headerInitialized: boolean };

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// '記録'!A1:L1 のような見出し行の範囲
function headerRange(tab: TabSpec): string {
  return `'${tab.title}'!A1:${columnLetter(tab.header.length - 1)}1`;
}

function recordsAppProperties(env: StorageEnv): Record<string, string> {
  return { sodalogStorage: env, sodalogKind: "records", schemaVersion: SCHEMA_VERSION };
}

function appPropertiesQuery(appProperties: Record<string, string>, mimeType: string): string {
  const conditions = Object.entries(appProperties).map(
    ([key, value]) => `appProperties has { key='${key}' and value='${value}' }`
  );
  return [...conditions, `mimeType='${mimeType}'`, "trashed=false"].join(" and ");
}

/**
 * appPropertiesがすべて一致するファイルを探す。
 * 2件以上見つかった場合は、どれが正しいか決められないためエラーにする。
 */
async function findFile(
  driveApi: drive_v3.Drive,
  appProperties: Record<string, string>,
  mimeType: string
): Promise<string | null> {
  const { data } = await driveApi.files.list({
    q: appPropertiesQuery(appProperties, mimeType),
    fields: "files(id)",
    pageSize: 2,
  });
  const found = data.files ?? [];
  if (found.length > 1) {
    throw new StorageError(
      "duplicate_storage",
      `Multiple files match ${JSON.stringify(appProperties)}`
    );
  }
  return found[0]?.id ?? null;
}

async function ensureFile(
  driveApi: drive_v3.Drive,
  appProperties: Record<string, string>,
  requestBody: drive_v3.Schema$File
): Promise<EnsuredFile> {
  const existing = await findFile(driveApi, appProperties, requestBody.mimeType ?? "");
  if (existing) {
    return { id: existing, created: false };
  }

  const created = await driveApi.files.create({
    requestBody: { ...requestBody, appProperties },
    fields: "id",
  });
  if (!created.data.id) {
    throw new StorageError("create_failed", "Drive did not return a file id");
  }
  return { id: created.data.id, created: true };
}

function isBlankRow(row: unknown[] | undefined): boolean {
  return (row ?? []).every((cell) => String(cell).trim() === "");
}

function sameHeader(current: unknown[] | undefined, expected: string[]): boolean {
  const cells = (current ?? []).map((cell) => String(cell));
  return cells.length === expected.length && cells.every((cell, i) => cell === expected[i]);
}

/**
 * 必要なタブと見出し行を用意する。
 *
 * - 新規作成直後(必要なタブが1枚も無く、既定のタブ1枚だけで空): 既定のタブを先頭の必要タブに改名する
 * - 足りないタブ: 追加して1行目を固定する(4-1で作った保存先に「場所」タブを足す場合など)
 * - 見出しが空: 前回の途中失敗とみなし、見出しを書く
 * - 見出しが想定と違う: 手作業の編集でずれた可能性があるため、自動で直さずエラーにする
 */
async function ensureTabs(
  sheetsApi: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<Record<string, TabResult>> {
  const { data } = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const tabs = (data.sheets ?? []).map((sheet) => sheet.properties ?? {});
  const titles = new Set(tabs.map((tab) => tab.title));
  const results: Record<string, TabResult> = {};
  const requests: sheets_v4.Schema$Request[] = [];

  const noRequiredTab = REQUIRED_TABS.every((tab) => !titles.has(tab.title));
  let missing = REQUIRED_TABS.filter((tab) => !titles.has(tab.title));

  if (noRequiredTab) {
    const onlyTab = tabs.length === 1 ? tabs[0] : undefined;
    if (!onlyTab || onlyTab.sheetId == null) {
      throw new StorageError("unexpected_tabs", "必要なタブが無く、既定のタブ1枚だけの状態でもありません");
    }
    const { data: firstRow } = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `'${onlyTab.title}'!A1:Z1`,
    });
    if (!isBlankRow(firstRow.values?.[0])) {
      throw new StorageError("unexpected_tabs", "必要なタブが無く、既存のタブにデータがあります");
    }
    const [first, ...rest] = REQUIRED_TABS;
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: onlyTab.sheetId,
          title: first.title,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: "title,gridProperties.frozenRowCount",
      },
    });
    results[first.title] = { tabCreated: true, headerInitialized: false };
    missing = rest;
  }

  for (const tab of missing) {
    requests.push({
      addSheet: { properties: { title: tab.title, gridProperties: { frozenRowCount: 1 } } },
    });
    results[tab.title] = { tabCreated: true, headerInitialized: false };
  }

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  const { data: headers } = await sheetsApi.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: REQUIRED_TABS.map(headerRange),
  });

  for (const [index, tab] of REQUIRED_TABS.entries()) {
    results[tab.title] ??= { tabCreated: false, headerInitialized: false };
    const current = headers.valueRanges?.[index]?.values?.[0];

    if (isBlankRow(current)) {
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange(tab),
        valueInputOption: "RAW",
        requestBody: { values: [tab.header] },
      });
      results[tab.title].headerInitialized = true;
      continue;
    }

    if (!sameHeader(current, tab.header)) {
      throw new StorageError(
        "header_mismatch",
        `「${tab.title}」タブの見出し行が想定と異なります: ${JSON.stringify(current)}`
      );
    }
  }

  return results;
}

export async function setupStorage(auth: OAuth2Client, env: StorageEnv) {
  const driveApi = drive({ version: "v3", auth });
  const sheetsApi = sheets({ version: "v4", auth });
  const names = STORAGE_NAMES[env];

  const folder = await ensureFile(
    driveApi,
    { sodalogStorage: env, sodalogKind: "root" },
    { name: names.folder, mimeType: FOLDER_MIME }
  );
  const spreadsheet = await ensureFile(driveApi, recordsAppProperties(env), {
    name: names.spreadsheet,
    mimeType: SPREADSHEET_MIME,
    parents: [folder.id],
  });
  const tabs = await ensureTabs(sheetsApi, spreadsheet.id);

  // 同じインスタンスのAPIが古い参照を使わないよう、セットアップ後はキャッシュを捨てる
  resolvedStorage.delete(env);

  return { env, schemaVersion: SCHEMA_VERSION, folder, spreadsheet, tabs };
}

export type ResolvedStorage = { spreadsheetId: string };

const RESOLVE_CACHE_MS = 10 * 60 * 1000;
const resolvedStorage = new Map<StorageEnv, ResolvedStorage & { resolvedAt: number }>();

/**
 * API用に既存の保存先を探す(読み取りのみ)。作成や見出しの修復は行わない。
 * 見つからない・見出しが違う場合は、セットアップ(/admin/storage/setup)が必要というエラーにする。
 */
export async function resolveStorage(auth: OAuth2Client, env: StorageEnv): Promise<ResolvedStorage> {
  const cached = resolvedStorage.get(env);
  if (cached && Date.now() - cached.resolvedAt < RESOLVE_CACHE_MS) {
    return { spreadsheetId: cached.spreadsheetId };
  }

  const driveApi = drive({ version: "v3", auth });
  const sheetsApi = sheets({ version: "v4", auth });

  const spreadsheetId = await findFile(driveApi, recordsAppProperties(env), SPREADSHEET_MIME);
  if (!spreadsheetId) {
    throw new StorageError("storage_not_initialized", "保存先がまだセットアップされていません");
  }

  let headers;
  try {
    ({ data: headers } = await sheetsApi.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: REQUIRED_TABS.map(headerRange),
    }));
  } catch (err) {
    // タブが無いと範囲指定がエラー(400)になる
    if (describeGoogleError(err).status === 400) {
      throw new StorageError("storage_not_initialized", "必要なタブがありません。セットアップを実行してください");
    }
    throw err;
  }
  for (const [index, tab] of REQUIRED_TABS.entries()) {
    if (!sameHeader(headers.valueRanges?.[index]?.values?.[0], tab.header)) {
      throw new StorageError(
        "storage_not_initialized",
        `「${tab.title}」タブの見出し行が想定と異なります。セットアップを実行してください`
      );
    }
  }

  resolvedStorage.set(env, { spreadsheetId, resolvedAt: Date.now() });
  return { spreadsheetId };
}

export function createStorageRouter(config: GoogleConfig | null): Router {
  const router = Router();
  router.use(requireGoogleConfig(config), requireAdmin(config));

  router.post(
    "/setup",
    asyncHandler(async (req, res) => {
      const env = req.query.env;
      if (env === "production") {
        res.status(400).json({
          error: "production_setup_not_allowed",
          message: "本番用の保存先は正式切替時に作成します",
        });
        return;
      }
      if (!isStorageEnv(env)) {
        res.status(400).json({ error: "invalid_env", message: "env=test を指定してください" });
        return;
      }

      const connection = await connectWithStoredToken(config!);
      if (!connection.ok) {
        res.status(502).json(connection.body);
        return;
      }

      try {
        res.json(await setupStorage(connection.client, env));
      } catch (err) {
        if (err instanceof StorageError) {
          res.status(409).json({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    })
  );

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Storage route error:", describeGoogleError(err));
    res.status(500).json({ error: "internal_error", detail: describeGoogleError(err) });
  });

  return router;
}
