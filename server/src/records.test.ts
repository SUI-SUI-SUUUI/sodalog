import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodePhoto,
  findRecordRow,
  MEMO_MAX_LENGTH,
  normalizeMemo,
  normalizePlantTags,
  normalizeWorkTypes,
  PHOTO_MAX_BYTES,
  photoFileName,
  recordToRow,
  validateRecordInput,
  validateWorkDate,
  WORK_TYPES,
  type SavedRecord,
} from "./records";
import { RECORDS_TAB } from "./storage";
import { todayJst } from "./time";

const TODAY = "2026-09-27";
const RECORD_ID = "3f9c2e1a-7b4d-4c8e-9a1f-0123456789ab";
const LOCATION_ID = "loc_ab23cd45ef";

// JPEGの先頭(FF D8 FF)で始まる小さなデータ
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");

function validBody(overrides: Record<string, unknown> = {}) {
  return { recordId: RECORD_ID, workDate: TODAY, locationId: LOCATION_ID, workTypes: ["剪定"], ...overrides };
}

test("作業日: 実在する日付で、日本時間の今日以前", () => {
  assert.deepEqual(validateWorkDate("2026-09-27", TODAY), { ok: true, value: "2026-09-27" });
  assert.deepEqual(validateWorkDate("2024-02-29", TODAY), { ok: true, value: "2024-02-29" });
  assert.deepEqual(validateWorkDate("2026-09-28", TODAY), { ok: false, reason: "future" });
  assert.deepEqual(validateWorkDate("2025-02-29", TODAY), { ok: false, reason: "not_a_date" });
  assert.deepEqual(validateWorkDate("2026-13-01", TODAY), { ok: false, reason: "not_a_date" });
  assert.deepEqual(validateWorkDate("2026/09/27", TODAY), { ok: false, reason: "format" });
  assert.deepEqual(validateWorkDate(undefined, TODAY), { ok: false, reason: "format" });
});

test("今日(日本時間): UTCではまだ前日でも日本時間の日付になる", () => {
  assert.equal(todayJst(new Date("2026-09-26T15:30:00Z")), "2026-09-27");
});

test("植物タグ: NFKC正規化・前後の空白除去、空と重複を除く", () => {
  assert.deepEqual(normalizePlantTags([" アジサイ ", "ﾎｽﾀ", "", "アジサイ"]), {
    ok: true,
    value: ["アジサイ", "ホスタ"],
  });
  assert.deepEqual(normalizePlantTags(undefined), { ok: true, value: [] });
});

test("植物タグ: 1つ20文字まで、最大10個", () => {
  assert.equal(normalizePlantTags(["あ".repeat(20)]).ok, true);
  assert.deepEqual(normalizePlantTags(["あ".repeat(21)]), { ok: false, reason: "too_long" });
  const ten = Array.from({ length: 10 }, (_, i) => `植物${i}`);
  assert.equal(normalizePlantTags(ten).ok, true);
  assert.deepEqual(normalizePlantTags([...ten, "植物10"]), { ok: false, reason: "too_many" });
  // 重複を除いた後で数える
  assert.equal(normalizePlantTags([...ten, "植物0"]).ok, true);
});

test("植物タグ: 配列以外・文字列以外・制御文字は不可", () => {
  assert.deepEqual(normalizePlantTags("アジサイ"), { ok: false, reason: "not_an_array" });
  assert.deepEqual(normalizePlantTags([1]), { ok: false, reason: "not_a_string" });
  assert.deepEqual(normalizePlantTags(["アジ\nサイ"]), { ok: false, reason: "invalid_characters" });
});

test("作業内容: 9項目だけ。重複は除き、決まった順に並べ替える", () => {
  assert.deepEqual(
    [...WORK_TYPES],
    ["水やり", "草取り", "肥料", "剪定", "植え付け", "植え替え", "成長記録", "収穫", "撤去"]
  );
  assert.deepEqual(normalizeWorkTypes(["撤去", "剪定", "水やり", "剪定"]), {
    ok: true,
    value: ["水やり", "剪定", "撤去"],
  });
  assert.deepEqual(normalizeWorkTypes(undefined), { ok: true, value: [] });
  assert.deepEqual(normalizeWorkTypes(["その他"]), { ok: false, reason: "unknown_work_type" });
  assert.deepEqual(normalizeWorkTypes(["植替え"]), { ok: false, reason: "unknown_work_type" });
  assert.deepEqual(normalizeWorkTypes("剪定"), { ok: false, reason: "not_an_array" });
});

test("メモ: 300文字まで。改行は残し(LFにそろえる)、前後の空白だけ除く。NFKCはかけない", () => {
  assert.deepEqual(normalizeMemo("  葉が黄色い\r\nＡ株だけ  "), { ok: true, value: "葉が黄色い\nＡ株だけ" });
  assert.equal(normalizeMemo("あ".repeat(MEMO_MAX_LENGTH)).ok, true);
  assert.deepEqual(normalizeMemo("あ".repeat(MEMO_MAX_LENGTH + 1)), { ok: false, reason: "too_long" });
  assert.deepEqual(normalizeMemo("a\u0007b"), { ok: false, reason: "invalid_characters" });
  assert.deepEqual(normalizeMemo(1), { ok: false, reason: "not_a_string" });
  assert.deepEqual(normalizeMemo("=1+1"), { ok: true, value: "=1+1" });
});

test("写真: JPEGのbase64だけ受け付ける", () => {
  const ok = decodePhoto({ mimeType: "image/jpeg", data: JPEG_BASE64 });
  assert.ok(ok.ok && ok.value && ok.value[0] === 0xff);
  assert.deepEqual(decodePhoto(undefined), { ok: true, value: null });
  assert.deepEqual(decodePhoto({ mimeType: "image/heic", data: JPEG_BASE64 }), {
    ok: false,
    error: "invalid_photo",
    reason: "unsupported_type",
  });
  assert.deepEqual(decodePhoto({ mimeType: "image/jpeg", data: Buffer.from("PNGx").toString("base64") }), {
    ok: false,
    error: "invalid_photo",
    reason: "not_jpeg",
  });
  assert.deepEqual(decodePhoto({ mimeType: "image/jpeg", data: "not base64!" }), {
    ok: false,
    error: "invalid_photo",
    reason: "invalid_base64",
  });
});

test("写真: 復号後3MBまで", () => {
  const atLimit = Buffer.alloc(PHOTO_MAX_BYTES, 0);
  atLimit.set([0xff, 0xd8, 0xff]);
  assert.equal(decodePhoto({ mimeType: "image/jpeg", data: atLimit.toString("base64") }).ok, true);

  const overLimit = Buffer.alloc(PHOTO_MAX_BYTES + 1, 0);
  overLimit.set([0xff, 0xd8, 0xff]);
  assert.deepEqual(decodePhoto({ mimeType: "image/jpeg", data: overLimit.toString("base64") }), {
    ok: false,
    error: "photo_too_large",
  });
});

test("記録: 場所 + 写真・作業内容・植物タグ・メモのどれか1つ以上で成立", () => {
  const empty = { recordId: RECORD_ID, workDate: TODAY, locationId: LOCATION_ID };
  assert.deepEqual(validateRecordInput(empty, TODAY), { ok: false, error: "empty_record" });
  assert.deepEqual(validateRecordInput({ ...empty, memo: "   ", plantTags: [" "] }, TODAY), {
    ok: false,
    error: "empty_record",
  });
  assert.equal(validateRecordInput({ ...empty, workTypes: ["水やり"] }, TODAY).ok, true);
  assert.equal(validateRecordInput({ ...empty, plantTags: ["アジサイ"] }, TODAY).ok, true);
  assert.equal(validateRecordInput({ ...empty, memo: "つぼみ" }, TODAY).ok, true);
  assert.equal(
    validateRecordInput({ ...empty, photo: { mimeType: "image/jpeg", data: JPEG_BASE64 } }, TODAY).ok,
    true
  );
});

test("記録: 記録ID・場所IDの形式、項目ごとのエラー", () => {
  assert.deepEqual(validateRecordInput(validBody({ recordId: "abc" }), TODAY), {
    ok: false,
    error: "invalid_record",
    field: "recordId",
    reason: "format",
  });
  assert.deepEqual(validateRecordInput(validBody({ recordId: RECORD_ID.toUpperCase() }), TODAY), {
    ok: false,
    error: "invalid_record",
    field: "recordId",
    reason: "format",
  });
  assert.deepEqual(validateRecordInput(validBody({ locationId: "北側花壇" }), TODAY), {
    ok: false,
    error: "invalid_record",
    field: "locationId",
    reason: "format",
  });
  assert.deepEqual(validateRecordInput(validBody({ workDate: "2026-09-28" }), TODAY), {
    ok: false,
    error: "invalid_record",
    field: "workDate",
    reason: "future",
  });
  assert.deepEqual(validateRecordInput(validBody({ workTypes: ["散歩"] }), TODAY), {
    ok: false,
    error: "invalid_record",
    field: "workTypes",
    reason: "unknown_work_type",
  });
  assert.deepEqual(validateRecordInput([], TODAY), {
    ok: false,
    error: "invalid_record",
    field: "body",
    reason: "not_an_object",
  });
});

test("記録: クライアントが送った場所名などの余計な項目は使わない", () => {
  const result = validateRecordInput(validBody({ locationName: "偽の場所", source: "other" }), TODAY);
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.input).sort(), [
    "locationId",
    "memo",
    "photo",
    "plantTags",
    "recordId",
    "workDate",
    "workTypes",
  ]);
});

test("写真ファイル名: 作業日_場所名_記録ID.jpg。/ \\ と制御文字は _ にする", () => {
  assert.equal(
    photoFileName("2026-09-27", "北側花壇", RECORD_ID),
    `2026-09-27_北側花壇_${RECORD_ID}.jpg`
  );
  assert.equal(photoFileName("2026-09-27", "庭/北\\側", RECORD_ID), `2026-09-27_庭_北_側_${RECORD_ID}.jpg`);
});

test("行: 「記録」タブの12列に合わせて書き、同じ形で読み戻せる", () => {
  const record: SavedRecord = {
    recordId: RECORD_ID,
    recordedAt: "2026-09-27T10:00:00+09:00",
    workDate: TODAY,
    locationId: LOCATION_ID,
    locationName: "北側花壇",
    plantTags: [],
    workTypes: ["剪定"],
    memo: "",
    photoFileId: null,
    source: "liff",
  };
  const row = recordToRow(record);
  assert.equal(row.length, RECORDS_TAB.header.length);
  assert.equal(row[5], "[]");
  assert.equal(row[6], '["剪定"]');
  assert.equal(row[8], "");
  assert.deepEqual(findRecordRow([["other"], row], RECORD_ID), record);
  assert.equal(findRecordRow([row], "3f9c2e1a-7b4d-4c8e-9a1f-000000000000"), undefined);
});
