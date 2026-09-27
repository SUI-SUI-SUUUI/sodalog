/*
 * STEP 4-4a: アルバム(場所ごとの振り返り)のデータ。
 *
 * - 対象は新しい保存先の「記録」タブだけ(旧 garden_log は扱わない)
 * - 年は写真フォルダ(写真/<年>/)ではなく、記録の作業日の年から作る
 * - 1回の応答は「場所×年」。写真あり・写真なしそれぞれ最大 ALBUM_LIMIT 件
 * - 並び順: 写真ありは古い順(画面では左が過去・右が最新)、写真なしは新しい順(表の上が最新)
 *   上限を超えた場合は古い記録を省き、truncated で知らせる
 */
import { isDeletedRow, rowToRecord, type SavedRecord } from "./records";

export const ALBUM_LIMIT = 300;

export type AlbumRecord = Pick<
  SavedRecord,
  "recordId" | "workDate" | "recordedAt" | "workTypes" | "plantTags" | "memo" | "photoFileId"
>;

export type Album = {
  total: number;
  years: { year: number; count: number }[];
  year: number | null;
  photoRecords: AlbumRecord[];
  textRecords: AlbumRecord[];
  truncated: { photo: boolean; text: boolean };
};

// 年の指定は西暦4桁。省略(undefined)なら最新の年
export function parseYear(value: unknown): { ok: true; year: number | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, year: undefined };
  }
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    return { ok: false };
  }
  return { ok: true, year: Number(value) };
}

function yearOf(record: SavedRecord): number | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(record.workDate) ? Number(record.workDate.slice(0, 4)) : null;
}

// 作業日 → 記録日時 の順で比べる(どちらもISO形式の文字列なので、文字列の比較で日時順になる)
function compareOldestFirst(a: SavedRecord, b: SavedRecord): number {
  if (a.workDate !== b.workDate) {
    return a.workDate < b.workDate ? -1 : 1;
  }
  return a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0;
}

function toAlbumRecord(record: SavedRecord): AlbumRecord {
  return {
    recordId: record.recordId,
    workDate: record.workDate,
    recordedAt: record.recordedAt,
    workTypes: record.workTypes,
    plantTags: record.plantTags,
    memo: record.memo,
    photoFileId: record.photoFileId,
  };
}

/**
 * 「記録」タブの行から、ある場所のアルバムを作る。
 * year を省略すると、その場所で記録がある最新の年になる(記録が0件なら year は null)。
 */
export function buildAlbum(rows: unknown[][], locationId: string, year?: number, limit = ALBUM_LIMIT): Album {
  const records = rows
    .filter((row) => !isDeletedRow(row))
    .map(rowToRecord)
    .filter((record) => record.recordId !== "" && record.locationId === locationId && yearOf(record) !== null);

  const counts = new Map<number, number>();
  for (const record of records) {
    const y = yearOf(record)!;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  const years = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([y, count]) => ({ year: y, count }));
  const selected = year ?? (years.length ? years[years.length - 1].year : null);

  const inYear = records.filter((record) => yearOf(record) === selected).sort(compareOldestFirst);
  const withPhoto = inYear.filter((record) => record.photoFileId);
  const withoutPhoto = inYear.filter((record) => !record.photoFileId).reverse();

  return {
    total: records.length,
    years,
    year: selected,
    // 写真ありは古い順のまま、新しい側の limit 件を残す
    photoRecords: withPhoto.slice(Math.max(0, withPhoto.length - limit)).map(toAlbumRecord),
    // 写真なしは新しい順の先頭 limit 件
    textRecords: withoutPhoto.slice(0, limit).map(toAlbumRecord),
    truncated: { photo: withPhoto.length > limit, text: withoutPhoto.length > limit },
  };
}
