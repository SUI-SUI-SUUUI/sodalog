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

/**
 * ALLOWED_LINE_USER_ID の設定確認
 */
function testAllowedUserSetting() {
  var allowedUserId = PropertiesService.getScriptProperties().getProperty(
    "ALLOWED_LINE_USER_ID",
  );

  if (!allowedUserId) {
    debugLog("ALLOWED_LINE_USER_ID が設定されていません。");
    return;
  }

  debugLog("ALLOWED_LINE_USER_ID が設定されています。");
}

/**
 * 許可ユーザー判定テスト
 */
function testIsAllowedLineUser() {
  var allowedUserId = PropertiesService.getScriptProperties().getProperty(
    "ALLOWED_LINE_USER_ID",
  );

  if (!allowedUserId) {
    debugLog("ALLOWED_LINE_USER_ID が未設定です。");
    return;
  }

  var allowedEvent = {
    source: {
      userId: allowedUserId,
    },
  };

  var deniedEvent = {
    source: {
      userId: "U_TEST_DENIED_USER",
    },
  };

  debugLog("本人ユーザー判定: " + isAllowedLineUser(allowedEvent));

  debugLog("未許可ユーザー判定: " + isAllowedLineUser(deniedEvent));
}

/**
 * LIFFから送る7項目形式と、既存の5項目形式を確認する。
 */
function testValidateLiffGardenLogText() {
  var liffResult = validateAndParseText(
    "2026/07/29_自宅_庭__アジサイ_水やり_元気です",
  );

  if (
    !liffResult.isValid ||
    liffResult.data.base !== "自宅" ||
    liffResult.data.detailPlace !== "" ||
    liffResult.data.memo !== "元気です"
  ) {
    throw new Error("LIFFの7項目形式を正しく解析できませんでした");
  }

  var legacyResult = validateAndParseText(
    "2026/07/29_庭_北側_アジサイ_剪定",
  );

  if (
    !legacyResult.isValid ||
    legacyResult.data.base !== "" ||
    legacyResult.data.memo !== ""
  ) {
    throw new Error("既存の5項目形式を正しく解析できませんでした");
  }

  debugLog("LIFF形式・既存形式の解析テストに成功しました");
}
