/**
 * LINEへ返信する
 */
function replyMessage(replyToken, text) {
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

  if (!token || !replyToken) {
    return;
  }

  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: text,
      },
    ],
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  debugLog("LINE reply status: " + response.getResponseCode());

  debugLog("LINE reply body: " + response.getContentText());
}

/**
 * JSONレスポンスを返す
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * デバッグログを書き出す
 */
function debugLog(message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var sheet = ss.getSheetByName("debug_log");

    if (!sheet) {
      sheet = ss.insertSheet("debug_log");

      sheet.appendRow(["日時", "内容"]);
    }

    sheet.appendRow([new Date(), message]);
  } catch (err) {
    // ログエラーで本処理を止めない
  }
}
