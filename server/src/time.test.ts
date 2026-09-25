import { test } from "node:test";
import assert from "node:assert/strict";
import { toJstIso } from "./time";

test("日本時間のISO形式(+09:00)にする", () => {
  assert.equal(toJstIso(new Date("2026-09-25T07:31:05.123Z")), "2026-09-25T16:31:05+09:00");
});

test("UTCの日付をまたぐ場合も日本時間の日付になる", () => {
  assert.equal(toJstIso(new Date("2026-09-25T20:00:00Z")), "2026-09-26T05:00:00+09:00");
});
