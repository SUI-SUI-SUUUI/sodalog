/*
 * STEP 4-2: 場所(「場所」タブ)の一覧取得と登録。
 *
 * - 場所名だけで登録できる(写真・方角・詳細場所は持たない)
 * - 並び順は登録順で固定(最近使った順は採用しない)
 * - 同じ名前が既にあれば新規作成せず、既存の場所を返す
 */
import { randomBytes } from "node:crypto";
import type { OAuth2Client } from "google-auth-library";
import { sheets } from "@googleapis/sheets";
import { createSerialQueue } from "./queue";
import { LOCATIONS_TAB } from "./storage";
import { toJstIso } from "./time";

export const LOCATION_NAME_MAX_LENGTH = 20;

export type Location = { id: string; name: string; createdAt: string };

const LOCATION_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const DATA_RANGE = `'${LOCATIONS_TAB.title}'!A2:E`;
const APPEND_RANGE = `'${LOCATIONS_TAB.title}'!A:E`;

// 列の位置(場所ID/場所名/登録日時/更新日時/削除日時)
const COL = { id: 0, name: 1, createdAt: 2, deletedAt: 4 } as const;

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; error: "not_a_string" | "empty" | "too_long" | "invalid_characters" };

/**
 * 場所名を正規化して検証する。
 * NFKC正規化(全角英数・半角カナなどの表記ゆれを揃える)と前後の空白の除去を行い、
 * 1〜20文字(サロゲートペアの絵文字も1文字と数える)であることを確かめる。
 */
export function normalizeLocationName(input: unknown): NameValidation {
  if (typeof input !== "string") {
    return { ok: false, error: "not_a_string" };
  }
  const name = input.normalize("NFKC").trim();
  if (name === "") {
    return { ok: false, error: "empty" };
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "invalid_characters" };
  }
  if ([...name].length > LOCATION_NAME_MAX_LENGTH) {
    return { ok: false, error: "too_long" };
  }
  return { ok: true, name };
}

// 紛らわしい文字(l, o, 0, 1)を除いた小文字英数字10桁
export function newLocationId(): string {
  const bytes = randomBytes(10);
  let suffix = "";
  for (const byte of bytes) {
    suffix += LOCATION_ID_ALPHABET[byte % LOCATION_ID_ALPHABET.length];
  }
  return `loc_${suffix}`;
}

/**
 * 「場所」タブの行(2行目以降)を場所の一覧にする。
 * 場所ID・場所名が無い行と、削除日時が入っている行は除く。
 * 登録日時の古い順(同じなら行の順)に並べる。
 */
export function parseLocationRows(rows: unknown[][]): Location[] {
  const locations = rows
    .map((row) => ({
      id: String(row[COL.id] ?? "").trim(),
      name: String(row[COL.name] ?? "").trim(),
      createdAt: String(row[COL.createdAt] ?? "").trim(),
      deletedAt: String(row[COL.deletedAt] ?? "").trim(),
    }))
    .filter((row) => row.id !== "" && row.name !== "" && row.deletedAt === "");

  // Array.prototype.sortは安定ソートなので、登録日時が同じなら行の順が保たれる
  locations.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return locations.map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

export function findLocationByName(locations: Location[], name: string): Location | undefined {
  return locations.find((location) => location.name.normalize("NFKC").trim() === name);
}

export async function listLocations(auth: OAuth2Client, spreadsheetId: string): Promise<Location[]> {
  const { data } = await sheets({ version: "v4", auth }).spreadsheets.values.get({
    spreadsheetId,
    range: DATA_RANGE,
  });
  return parseLocationRows((data.values ?? []) as unknown[][]);
}

// 同じ名前の場所が2行できないよう、登録は1件ずつ行う
const serialized = createSerialQueue();

export function createLocation(
  auth: OAuth2Client,
  spreadsheetId: string,
  name: string
): Promise<{ location: Location; created: boolean }> {
  return serialized(async () => {
    const existing = findLocationByName(await listLocations(auth, spreadsheetId), name);
    if (existing) {
      return { location: existing, created: false };
    }

    const location: Location = { id: newLocationId(), name, createdAt: toJstIso(new Date()) };
    await sheets({ version: "v4", auth }).spreadsheets.values.append({
      spreadsheetId,
      range: APPEND_RANGE,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      // 場所ID / 場所名 / 登録日時 / 更新日時 / 削除日時
      requestBody: { values: [[location.id, location.name, location.createdAt, "", ""]] },
    });
    return { location, created: true };
  });
}
