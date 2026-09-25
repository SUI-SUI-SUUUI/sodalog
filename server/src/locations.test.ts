import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findLocationByName,
  newLocationId,
  normalizeLocationName,
  parseLocationRows,
} from "./locations";

test("場所名: 前後の空白を除き、NFKC正規化する", () => {
  assert.deepEqual(normalizeLocationName("  北側の花壇　"), { ok: true, name: "北側の花壇" });
  assert.deepEqual(normalizeLocationName("ＡＢＣ花壇"), { ok: true, name: "ABC花壇" });
  assert.deepEqual(normalizeLocationName("ﾍﾞﾗﾝﾀﾞ"), { ok: true, name: "ベランダ" });
});

test("場所名: 20文字まで(絵文字も1文字として数える)", () => {
  assert.equal(normalizeLocationName("あ".repeat(20)).ok, true);
  assert.deepEqual(normalizeLocationName("あ".repeat(21)), { ok: false, error: "too_long" });
  assert.equal(normalizeLocationName("🌱".repeat(20)).ok, true);
});

test("場所名: 空・文字列以外・制御文字は不可", () => {
  assert.deepEqual(normalizeLocationName("   "), { ok: false, error: "empty" });
  assert.deepEqual(normalizeLocationName(undefined), { ok: false, error: "not_a_string" });
  assert.deepEqual(normalizeLocationName(123), { ok: false, error: "not_a_string" });
  assert.deepEqual(normalizeLocationName("北側\n花壇"), { ok: false, error: "invalid_characters" });
});

test("場所名: 先頭が=でも文字列のまま扱う(書き込みはRAW)", () => {
  assert.deepEqual(normalizeLocationName("=1+1"), { ok: true, name: "=1+1" });
});

test("場所ID: loc_ + 紛らわしい文字を除いた小文字英数字10桁", () => {
  for (let i = 0; i < 50; i++) {
    assert.match(newLocationId(), /^loc_[a-km-np-z2-9]{10}$/);
  }
});

test("一覧: 登録日時の古い順。削除済み・不完全な行は除く", () => {
  const rows = [
    ["loc_b", "南側", "2026-09-25T10:00:00+09:00", "", ""],
    ["loc_a", "北側", "2026-09-25T09:00:00+09:00", "", ""],
    ["loc_c", "玄関", "2026-09-25T11:00:00+09:00", "", "2026-09-26T00:00:00+09:00"],
    ["", "IDなし", "2026-09-25T12:00:00+09:00"],
    ["loc_d", "", "2026-09-25T12:00:00+09:00"],
    ["loc_e", "室内", "2026-09-25T13:00:00+09:00"],
  ];
  assert.deepEqual(
    parseLocationRows(rows).map((location) => location.id),
    ["loc_a", "loc_b", "loc_e"]
  );
});

test("一覧: 登録日時が同じなら行の順を保つ", () => {
  const rows = [
    ["loc_1", "A", "2026-09-25T09:00:00+09:00"],
    ["loc_2", "B", "2026-09-25T09:00:00+09:00"],
    ["loc_3", "C", "2026-09-25T09:00:00+09:00"],
  ];
  assert.deepEqual(parseLocationRows(rows).map((l) => l.id), ["loc_1", "loc_2", "loc_3"]);
});

test("重複判定: 正規化後の名前で既存の場所を見つける", () => {
  const locations = parseLocationRows([["loc_a", "ベランダ", "2026-09-25T09:00:00+09:00"]]);
  const input = normalizeLocationName(" ﾍﾞﾗﾝﾀﾞ ");
  assert.ok(input.ok);
  assert.equal(findLocationByName(locations, input.name)?.id, "loc_a");
  assert.equal(findLocationByName(locations, "玄関"), undefined);
});
