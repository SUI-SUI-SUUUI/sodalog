/*
 * STEP 4-3a: 記録(「記録」タブ)の保存。
 *
 * - 記録の成立条件: 場所 + (写真・作業内容・植物タグ・メモのどれか1つ以上)
 * - 記録IDはLIFFが作る。同じ記録IDが既にあれば新しく作らず、既存の記録を返す(再送・二重タップ対策)
 * - 写真は1記録1枚(JPEGのみ)。写真/<作業日の年>/ に「作業日_場所名_記録ID.jpg」で保存する。
 *   ファイル名は表示用で、記録との結びつきは写真ファイルID列と、写真に付けた記録ID(appProperties)で行う
 * - 場所名はクライアントの値を使わず、「場所」タブから引く
 */
import { Readable } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import { drive } from "@googleapis/drive";
import { sheets } from "@googleapis/sheets";
import { listLocations } from "./locations";
import { createSerialQueue } from "./queue";
import { ensurePhotoYearFolder, findFile, RECORDS_TAB, type StorageEnv } from "./storage";
import { toJstIso } from "./time";

// 新しい記録画面の作業内容(この順で表示・保存する)。「その他」は使わない
export const WORK_TYPES = [
  "水やり",
  "草取り",
  "肥料",
  "剪定",
  "植え付け",
  "植え替え",
  "成長記録",
  "収穫",
  "撤去",
] as const;

export const PLANT_TAG_MAX_LENGTH = 20;
export const PLANT_TAG_MAX_COUNT = 10;
export const MEMO_MAX_LENGTH = 300;
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;

const RECORD_SOURCE = "liff";
const PHOTO_MIME = "image/jpeg";

const DATA_RANGE = `'${RECORDS_TAB.title}'!A2:L`;
const APPEND_RANGE = `'${RECORDS_TAB.title}'!A:L`;

// 列の位置(記録ID/記録日時/作業日/場所ID/場所名/植物タグ/作業内容/メモ/写真ファイルID/記録元/更新日時/削除日時)
const COL = {
  recordId: 0,
  recordedAt: 1,
  workDate: 2,
  locationId: 3,
  locationName: 4,
  plantTags: 5,
  workTypes: 6,
  memo: 7,
  photoFileId: 8,
  source: 9,
} as const;

// crypto.randomUUID() の形式(小文字)
const RECORD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCATION_ID_PATTERN = /^loc_[a-z0-9]{10}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export type RecordInput = {
  recordId: string;
  workDate: string;
  locationId: string;
  plantTags: string[];
  workTypes: string[];
  memo: string;
  photo: Buffer | null;
};

export type SavedRecord = {
  recordId: string;
  recordedAt: string;
  workDate: string;
  locationId: string;
  locationName: string;
  plantTags: string[];
  workTypes: string[];
  memo: string;
  photoFileId: string | null;
  source: string;
};

export type RecordValidation =
  | { ok: true; input: RecordInput }
  | { ok: false; error: "invalid_record"; field: string; reason: string }
  | { ok: false; error: "empty_record" }
  | { ok: false; error: "invalid_photo"; reason: string }
  | { ok: false; error: "photo_too_large" };

type FieldResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 実在する日付(YYYY-MM-DD)で、日本時間の今日以前であること
export function validateWorkDate(value: unknown, today: string): FieldResult<string> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, reason: "format" };
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, reason: "not_a_date" };
  }
  if (value > today) {
    return { ok: false, reason: "future" };
  }
  return { ok: true, value };
}

/**
 * 植物タグ: NFKC正規化・前後の空白除去をし、空と重複を除く。
 * 1つ20文字まで(絵文字も1文字)、最大10個。
 */
export function normalizePlantTags(value: unknown): FieldResult<string[]> {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, reason: "not_an_array" };
  }
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, reason: "not_a_string" };
    }
    const tag = item.normalize("NFKC").trim();
    if (/[\u0000-\u001f\u007f]/.test(tag)) {
      return { ok: false, reason: "invalid_characters" };
    }
    if ([...tag].length > PLANT_TAG_MAX_LENGTH) {
      return { ok: false, reason: "too_long" };
    }
    if (tag !== "" && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  if (tags.length > PLANT_TAG_MAX_COUNT) {
    return { ok: false, reason: "too_many" };
  }
  return { ok: true, value: tags };
}

// 作業内容: 9項目のどれか。重複は除き、WORK_TYPES の順に並べ替える
export function normalizeWorkTypes(value: unknown): FieldResult<string[]> {
  if (value === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, reason: "not_an_array" };
  }
  const workTypes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !(WORK_TYPES as readonly string[]).includes(item)) {
      return { ok: false, reason: "unknown_work_type" };
    }
    if (!workTypes.includes(item)) {
      workTypes.push(item);
    }
  }
  workTypes.sort(
    (a, b) => (WORK_TYPES as readonly string[]).indexOf(a) - (WORK_TYPES as readonly string[]).indexOf(b)
  );
  return { ok: true, value: workTypes };
}

/**
 * メモ: 本人の書いた文を変えないよう、NFKC正規化はしない。
 * 改行はLFにそろえて残し、前後の空白だけ除く。改行・タブ以外の制御文字は不可。300文字まで。
 */
export function normalizeMemo(value: unknown): FieldResult<string> {
  if (value === undefined) {
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: "not_a_string" };
  }
  const memo = value.replace(/\r\n?/g, "\n").trim();
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(memo)) {
    return { ok: false, reason: "invalid_characters" };
  }
  if ([...memo].length > MEMO_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value: memo };
}

/**
 * 写真: { mimeType: "image/jpeg", data: <base64> }。HEICなどはLIFF側でJPEGに変換してから送る。
 * 中身の先頭がJPEGの印(FF D8 FF)であることも確かめる。
 */
export function decodePhoto(
  value: unknown
): { ok: true; value: Buffer | null } | { ok: false; error: "invalid_photo"; reason: string } | { ok: false; error: "photo_too_large" } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (!isPlainObject(value)) {
    return { ok: false, error: "invalid_photo", reason: "not_an_object" };
  }
  if (value.mimeType !== PHOTO_MIME) {
    return { ok: false, error: "invalid_photo", reason: "unsupported_type" };
  }
  const data = value.data;
  if (typeof data !== "string" || data.length === 0 || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
    return { ok: false, error: "invalid_photo", reason: "invalid_base64" };
  }
  // 復号する前に、復号後の大きさで上限を確かめる
  if ((data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0) > PHOTO_MAX_BYTES) {
    return { ok: false, error: "photo_too_large" };
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, error: "invalid_photo", reason: "not_jpeg" };
  }
  return { ok: true, value: bytes };
}

/**
 * 記録APIの入力を確かめ、保存する形に整える。
 * today は日本時間の今日(YYYY-MM-DD)。
 */
export function validateRecordInput(body: unknown, today: string): RecordValidation {
  if (!isPlainObject(body)) {
    return { ok: false, error: "invalid_record", field: "body", reason: "not_an_object" };
  }

  const recordId = body.recordId;
  if (typeof recordId !== "string" || !RECORD_ID_PATTERN.test(recordId)) {
    return { ok: false, error: "invalid_record", field: "recordId", reason: "format" };
  }
  const workDate = validateWorkDate(body.workDate, today);
  if (!workDate.ok) {
    return { ok: false, error: "invalid_record", field: "workDate", reason: workDate.reason };
  }
  const locationId = body.locationId;
  if (typeof locationId !== "string" || !LOCATION_ID_PATTERN.test(locationId)) {
    return { ok: false, error: "invalid_record", field: "locationId", reason: "format" };
  }
  const plantTags = normalizePlantTags(body.plantTags);
  if (!plantTags.ok) {
    return { ok: false, error: "invalid_record", field: "plantTags", reason: plantTags.reason };
  }
  const workTypes = normalizeWorkTypes(body.workTypes);
  if (!workTypes.ok) {
    return { ok: false, error: "invalid_record", field: "workTypes", reason: workTypes.reason };
  }
  const memo = normalizeMemo(body.memo);
  if (!memo.ok) {
    return { ok: false, error: "invalid_record", field: "memo", reason: memo.reason };
  }
  const photo = decodePhoto(body.photo);
  if (!photo.ok) {
    return photo;
  }

  if (!photo.value && workTypes.value.length === 0 && plantTags.value.length === 0 && memo.value === "") {
    return { ok: false, error: "empty_record" };
  }

  return {
    ok: true,
    input: {
      recordId,
      workDate: workDate.value,
      locationId,
      plantTags: plantTags.value,
      workTypes: workTypes.value,
      memo: memo.value,
      photo: photo.value,
    },
  };
}

// ファイル名に使えない・紛らわしい文字(/ \ と制御文字)を _ に置き換える
export function photoFileName(workDate: string, locationName: string, recordId: string): string {
  const safeName = locationName.replace(/[\/\\\u0000-\u001f\u007f]/g, "_");
  return `${workDate}_${safeName}_${recordId}.jpg`;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// 「記録」タブの行(2行目以降)から、記録IDが一致する行を記録にする
export function findRecordRow(rows: unknown[][], recordId: string): SavedRecord | undefined {
  const row = rows.find((cells) => String(cells[COL.recordId] ?? "").trim() === recordId);
  if (!row) {
    return undefined;
  }
  const cell = (index: number) => String(row[index] ?? "");
  return {
    recordId,
    recordedAt: cell(COL.recordedAt),
    workDate: cell(COL.workDate),
    locationId: cell(COL.locationId),
    locationName: cell(COL.locationName),
    plantTags: parseJsonArray(cell(COL.plantTags)),
    workTypes: parseJsonArray(cell(COL.workTypes)),
    memo: cell(COL.memo),
    photoFileId: cell(COL.photoFileId) || null,
    source: cell(COL.source),
  };
}

export function recordToRow(record: SavedRecord): string[] {
  // 記録ID / 記録日時 / 作業日 / 場所ID / 場所名 / 植物タグ / 作業内容 / メモ / 写真ファイルID / 記録元 / 更新日時 / 削除日時
  return [
    record.recordId,
    record.recordedAt,
    record.workDate,
    record.locationId,
    record.locationName,
    JSON.stringify(record.plantTags),
    JSON.stringify(record.workTypes),
    record.memo,
    record.photoFileId ?? "",
    record.source,
    "",
    "",
  ];
}

export class UnknownLocationError extends Error {}

type SaveContext = {
  auth: OAuth2Client;
  env: StorageEnv;
  spreadsheetId: string;
  photosFolderId: string;
};

/**
 * 写真を保存してファイルIDを返す。
 * 同じ記録IDの写真が既にあれば(前回、写真の保存後に行の追記だけ失敗した場合など)それを使う。
 */
async function savePhoto(context: SaveContext, input: RecordInput, locationName: string, photo: Buffer) {
  const appProperties = { sodalogStorage: context.env, sodalogKind: "photo", recordId: input.recordId };
  const driveApi = drive({ version: "v3", auth: context.auth });

  const existing = await findFile(driveApi, appProperties, PHOTO_MIME);
  if (existing) {
    return existing;
  }

  const yearFolderId = await ensurePhotoYearFolder(
    context.auth,
    context.env,
    context.photosFolderId,
    input.workDate.slice(0, 4)
  );
  const { data } = await driveApi.files.create({
    requestBody: {
      name: photoFileName(input.workDate, locationName, input.recordId),
      mimeType: PHOTO_MIME,
      parents: [yearFolderId],
      appProperties,
    },
    media: { mimeType: PHOTO_MIME, body: Readable.from(photo) },
    fields: "id",
  });
  if (!data.id) {
    throw new Error("Drive did not return a photo file id");
  }
  return data.id;
}

// 同じ記録IDの行が2つできないよう、保存は1件ずつ行う
const serialized = createSerialQueue();

/**
 * 記録を保存する。同じ記録IDが既にあれば、何も書かずに既存の記録を返す。
 * 場所が見つからない(削除済みを含む)場合は UnknownLocationError。
 */
export function saveRecord(
  context: SaveContext,
  input: RecordInput
): Promise<{ record: SavedRecord; created: boolean }> {
  return serialized(async () => {
    const sheetsApi = sheets({ version: "v4", auth: context.auth });

    const { data } = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: context.spreadsheetId,
      range: DATA_RANGE,
    });
    const existing = findRecordRow((data.values ?? []) as unknown[][], input.recordId);
    if (existing) {
      return { record: existing, created: false };
    }

    const location = (await listLocations(context.auth, context.spreadsheetId)).find(
      (candidate) => candidate.id === input.locationId
    );
    if (!location) {
      throw new UnknownLocationError(input.locationId);
    }

    const photoFileId = input.photo ? await savePhoto(context, input, location.name, input.photo) : null;

    const record: SavedRecord = {
      recordId: input.recordId,
      recordedAt: toJstIso(new Date()),
      workDate: input.workDate,
      locationId: location.id,
      locationName: location.name,
      plantTags: input.plantTags,
      workTypes: input.workTypes,
      memo: input.memo,
      photoFileId,
      source: RECORD_SOURCE,
    };
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: context.spreadsheetId,
      range: APPEND_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [recordToRow(record)] },
    });
    return { record, created: true };
  });
}
