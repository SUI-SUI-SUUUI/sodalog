/*
 * STEP 4-1: 新しい保存先(アプリがdrive.fileで作るフォルダ・スプレッドシート)の初回セットアップ。
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

export const SCHEMA_VERSION = "1";
export const RECORDS_TAB = "記録";
export const RECORD_HEADER = [
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
];

const STORAGE_NAMES = {
  test: { folder: "そだログ（テスト）", spreadsheet: "そだログ記録（テスト）" },
} as const;

type StorageEnv = keyof typeof STORAGE_NAMES;

type EnsuredFile = { id: string; created: boolean };

// A1:L1 のようなヘッダー範囲("L"は列数から求める)
const HEADER_RANGE = `'${RECORDS_TAB}'!A1:${String.fromCharCode(64 + RECORD_HEADER.length)}1`;

class StorageSetupError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * appPropertiesがすべて一致するファイルを探し、無ければ作る。
 * 2件以上見つかった場合は、どれが正しいか決められないためエラーにする。
 */
async function ensureFile(
  driveApi: drive_v3.Drive,
  appProperties: Record<string, string>,
  requestBody: drive_v3.Schema$File
): Promise<EnsuredFile> {
  const conditions = Object.entries(appProperties).map(
    ([key, value]) => `appProperties has { key='${key}' and value='${value}' }`
  );
  const { data } = await driveApi.files.list({
    q: [...conditions, `mimeType='${requestBody.mimeType}'`, "trashed=false"].join(" and "),
    fields: "files(id)",
    pageSize: 2,
  });
  const found = data.files ?? [];
  if (found.length > 1) {
    throw new StorageSetupError(
      "duplicate_storage",
      `Multiple files match ${JSON.stringify(appProperties)}`
    );
  }
  if (found[0]?.id) {
    return { id: found[0].id, created: false };
  }

  const created = await driveApi.files.create({
    requestBody: { ...requestBody, appProperties },
    fields: "id",
  });
  if (!created.data.id) {
    throw new StorageSetupError("create_failed", "Drive did not return a file id");
  }
  return { id: created.data.id, created: true };
}

/**
 * 「記録」タブと見出し行を用意する。
 *
 * - 新規作成直後(タブが既定の1枚だけで空): そのタブを「記録」に改名し、見出しを書いて1行目を固定する
 * - 「記録」タブがあり見出しが空: 前回の途中失敗とみなし、見出しを書く
 * - 見出しが想定と違う: 手作業の編集でずれた可能性があるため、自動で直さずエラーにする
 */
async function ensureRecordsTab(
  sheetsApi: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<{ initialized: boolean }> {
  const { data } = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const tabs = data.sheets ?? [];
  const recordsTab = tabs.find((tab) => tab.properties?.title === RECORDS_TAB);

  if (!recordsTab) {
    const onlyTab = tabs.length === 1 ? tabs[0].properties : undefined;
    if (!onlyTab || onlyTab.sheetId == null) {
      throw new StorageSetupError(
        "unexpected_tabs",
        `「${RECORDS_TAB}」タブが無く、既定のタブ1枚だけの状態でもありません`
      );
    }
    const { data: firstRow } = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `'${onlyTab.title}'!A1:Z1`,
    });
    if ((firstRow.values?.[0] ?? []).some((cell) => String(cell).trim() !== "")) {
      throw new StorageSetupError(
        "unexpected_tabs",
        `「${RECORDS_TAB}」タブが無く、既存のタブにデータがあります`
      );
    }
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: onlyTab.sheetId,
                title: RECORDS_TAB,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: "title,gridProperties.frozenRowCount",
            },
          },
        ],
      },
    });
  }

  const { data: header } = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: HEADER_RANGE,
  });
  const current = (header.values?.[0] ?? []).map((cell) => String(cell));

  if (current.every((cell) => cell.trim() === "")) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: HEADER_RANGE,
      valueInputOption: "RAW",
      requestBody: { values: [RECORD_HEADER] },
    });
    return { initialized: true };
  }

  const matches =
    current.length === RECORD_HEADER.length &&
    current.every((cell, index) => cell === RECORD_HEADER[index]);
  if (!matches) {
    throw new StorageSetupError(
      "header_mismatch",
      `「${RECORDS_TAB}」タブの見出し行が想定と異なります: ${JSON.stringify(current)}`
    );
  }
  return { initialized: false };
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
  const spreadsheet = await ensureFile(
    driveApi,
    { sodalogStorage: env, sodalogKind: "records", schemaVersion: SCHEMA_VERSION },
    { name: names.spreadsheet, mimeType: SPREADSHEET_MIME, parents: [folder.id] }
  );
  const recordsTab = await ensureRecordsTab(sheetsApi, spreadsheet.id);

  return { env, schemaVersion: SCHEMA_VERSION, folder, spreadsheet, recordsTab };
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
      if (env !== "test") {
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
        if (err instanceof StorageSetupError) {
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
