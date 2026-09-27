const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 日本時間のISO 8601文字列にする(例: 2026-09-25T16:31:05+09:00)。
 * 保存用の形式。画面表示は LIFF 側で 2026/09/25 形式に変換する。
 */
export function toJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

/**
 * 日本時間の今日の日付(例: 2026-09-25)。作業日の上限の判定に使う。
 */
export function todayJst(now: Date = new Date()): string {
  return toJstIso(now).slice(0, 10);
}
