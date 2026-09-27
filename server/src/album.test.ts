import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlbum, countRecordsByLocation, parseYear } from "./album";

const LOC = "loc_ab23cd45ef";
const OTHER = "loc_zz23cd45ef";

// 記録ID / 記録日時 / 作業日 / 場所ID / 場所名 / 植物タグ / 作業内容 / メモ / 写真ファイルID / 記録元 / 更新日時 / 削除日時
function row(id: string, workDate: string, options: { loc?: string; photo?: string; recordedAt?: string; deletedAt?: string } = {}) {
  return [
    id,
    options.recordedAt ?? `${workDate}T12:00:00+09:00`,
    workDate,
    options.loc ?? LOC,
    "北側の花壇",
    '["アジサイ"]',
    '["水やり"]',
    "メモ",
    options.photo ?? "",
    "liff",
    "",
    options.deletedAt ?? "",
  ];
}

const rows = [
  row("a", "2024-05-01", { photo: "photoA" }),
  row("b", "2025-06-01"),
  row("c", "2026-03-02", { photo: "photoC" }),
  row("d", "2026-01-10", { photo: "photoD" }),
  row("e", "2026-09-20"),
  row("f", "2026-02-01"),
  row("g", "2026-09-20", { recordedAt: "2026-09-20T08:00:00+09:00" }),
  row("x", "2026-04-01", { loc: OTHER, photo: "photoX" }),
  row("z", "2026-05-01", { deletedAt: "2026-09-26T00:00:00+09:00" }),
];

test("年の指定: 西暦4桁のみ。省略は最新の年", () => {
  assert.deepEqual(parseYear(undefined), { ok: true, year: undefined });
  assert.deepEqual(parseYear("2026"), { ok: true, year: 2026 });
  assert.deepEqual(parseYear("26"), { ok: false });
  assert.deepEqual(parseYear(["2026"]), { ok: false });
});

test("総記録数と年の一覧: その場所の記録だけ。年は作業日から、古い順。削除済みは除く", () => {
  const album = buildAlbum(rows, LOC);
  assert.equal(album.total, 7);
  assert.deepEqual(album.years, [
    { year: 2024, count: 1 },
    { year: 2025, count: 1 },
    { year: 2026, count: 5 },
  ]);
});

test("年の省略: 最新の年を返す", () => {
  assert.equal(buildAlbum(rows, LOC).year, 2026);
});

test("写真あり: 古い順(画面の左が過去・右が最新)", () => {
  assert.deepEqual(buildAlbum(rows, LOC, 2026).photoRecords.map((r) => r.recordId), ["d", "c"]);
});

test("写真なし: 新しい順(表の上が最新)。作業日が同じなら記録日時の新しい順", () => {
  assert.deepEqual(buildAlbum(rows, LOC, 2026).textRecords.map((r) => r.recordId), ["e", "g", "f"]);
});

test("年を指定するとその年だけ。記録のない年は空", () => {
  const album2024 = buildAlbum(rows, LOC, 2024);
  assert.deepEqual(album2024.photoRecords.map((r) => r.recordId), ["a"]);
  assert.deepEqual(album2024.textRecords, []);
  const album2020 = buildAlbum(rows, LOC, 2020);
  assert.equal(album2020.year, 2020);
  assert.deepEqual([album2020.photoRecords, album2020.textRecords], [[], []]);
  assert.equal(album2020.total, 7);
});

test("記録が0件の場所: year は null、一覧は空", () => {
  const album = buildAlbum(rows, "loc_nothing000");
  assert.deepEqual(album, {
    total: 0,
    years: [],
    year: null,
    photoRecords: [],
    textRecords: [],
    truncated: { photo: false, text: false },
  });
});

test("返す項目: 作業内容・植物はJSON配列から戻し、写真なしは photoFileId が null", () => {
  const album = buildAlbum(rows, LOC, 2026);
  assert.deepEqual(album.photoRecords[0], {
    recordId: "d",
    workDate: "2026-01-10",
    recordedAt: "2026-01-10T12:00:00+09:00",
    workTypes: ["水やり"],
    plantTags: ["アジサイ"],
    memo: "メモ",
    photoFileId: "photoD",
  });
  assert.equal(album.textRecords[0].photoFileId, null);
});

test("上限: 超えたら古い記録を省き、truncated で知らせる", () => {
  const many = Array.from({ length: 5 }, (_, i) => row(`p${i}`, `2026-01-0${i + 1}`, { photo: `ph${i}` }))
    .concat(Array.from({ length: 5 }, (_, i) => row(`t${i}`, `2026-02-0${i + 1}`)));
  const album = buildAlbum(many, LOC, 2026, 3);
  // 写真ありは新しい側の3件(古い順のまま)
  assert.deepEqual(album.photoRecords.map((r) => r.recordId), ["p2", "p3", "p4"]);
  // 写真なしは新しい順の先頭3件
  assert.deepEqual(album.textRecords.map((r) => r.recordId), ["t4", "t3", "t2"]);
  assert.deepEqual(album.truncated, { photo: true, text: true });
  assert.deepEqual(buildAlbum(many, LOC, 2026, 5).truncated, { photo: false, text: false });
});

test("作業日が壊れた行・記録IDのない行は対象外", () => {
  const broken = [row("ok", "2026-01-01"), row("bad", "2026/01/01"), row("", "2026-01-02")];
  assert.equal(buildAlbum(broken, LOC).total, 1);
});

test("場所ごとの件数: 削除済み・壊れた行を除き、アルバムの total と一致する", () => {
  const counts = countRecordsByLocation(rows);
  assert.equal(counts.get(LOC), 7);
  assert.equal(counts.get(OTHER), 1);
  assert.equal(counts.get("loc_nothing000"), undefined);
  assert.equal(counts.get(LOC), buildAlbum(rows, LOC).total);
  assert.equal(counts.get(OTHER), buildAlbum(rows, OTHER).total);
});

test("場所ごとの件数: 作業日が壊れた行・記録IDのない行は数えない", () => {
  const broken = [row("ok", "2026-01-01"), row("bad", "2026/01/01"), row("", "2026-01-02")];
  assert.equal(countRecordsByLocation(broken).get(LOC), 1);
});
