/**
 * garden_logの追加見出し確認用
 */
function testEnsureGardenLogHeader() {
  var sheet = getSheet();

  debugLog(
    "garden_log見出し確認: " +
      sheet.getRange(1, 10, 1, 2).getDisplayValues()[0].join(" / "),
  );
}
