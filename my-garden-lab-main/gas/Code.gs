/**
 * My Garden Lab - LINE Webhook
 *
 * LINEで届いたテキストメッセージをスプレッドシートへ記録する。
 * LINEで届いた画像をGoogle Driveへ保存する。
 *
 * 画像は、最新の園芸記録を参照して次の階層へ保存する。
 *
 * images
 * └─ 年
 *    └─ 月
 *       └─ 場所
 *          └─ 詳細場所
 *
 * テキスト入力形式：
 * 作業日_場所_詳細場所_植物名_作業内容
 *
 * 例：
 * 2026/04/11_北側_中央_つつじ_剪定
 */

var SHEET_NAME = "garden_log";

var HEADER = [
  "記録日時",
  "作業日",
  "場所",
  "詳細場所",
  "植物名",
  "作業内容",
  "メモ",
  "画像URL",
  "DriveフォルダURL",
];

/**
 * LINEプラットフォームからのPOSTを受け取る
 */
function doPost(e) {
  try {
    debugLog("doPost 開始");

    if (!e || !e.postData || !e.postData.contents) {
      debugLog("エラー: postData がありません");

      return createJsonResponse({
        status: "no postData",
      });
    }

    var body = JSON.parse(e.postData.contents);

    debugLog("受信body: " + JSON.stringify(body));

    var events = body.events || [];

    debugLog("events数: " + events.length);

    events.forEach(function (event) {
      try {
        debugLog("event: " + JSON.stringify(event));

        if (event.type !== "message" || !event.message) {
          debugLog("対象外イベント: " + event.type);

          return;
        }

        if (event.message.type === "text") {
          handleTextMessage(event);

          return;
        }

        if (event.message.type === "image") {
          handleImageMessage(event);

          return;
        }

        debugLog("対象外メッセージタイプ: " + event.message.type);
      } catch (eventError) {
        debugLog("イベント処理エラー: " + eventError);
      }
    });
  } catch (err) {
    debugLog("doPost error: " + err);
  }

  return createJsonResponse({
    status: "ok",
  });
}

/**
 * ブラウザからURLを開いたときの確認用
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "My Garden Lab Webhook is running.",
  );
}

/**
 * テキストメッセージを処理する
 */
function handleTextMessage(event) {
  var text = event.message.text;
  var replyToken = event.replyToken;

  debugLog("handleTextMessage 開始");
  debugLog("受信テキスト: " + text);

  var parsed = parseText(text);
  var sheet = getSheet();

  if (!parsed) {
    debugLog("入力形式エラー");

    replyMessage(
      replyToken,
      "形式が正しく読み取れませんでした。\n" +
        "次の形式で送ってください:\n" +
        "作業日_場所_詳細場所_植物名_作業内容\n" +
        "例: 2026/04/11_北側_中央_つつじ_剪定",
    );

    return;
  }

  sheet.appendRow([
    new Date(),
    parsed.workDate,
    parsed.place,
    parsed.detailPlace,
    parsed.plant,
    parsed.task,
    "",
    "",
    "",
  ]);

  debugLog("スプレッドシートへの記録完了");

  replyMessage(
    replyToken,
    "記録しました:\n" +
      "作業日: " +
      parsed.workDate +
      "\n" +
      "場所: " +
      parsed.place +
      "\n" +
      "詳細場所: " +
      parsed.detailPlace +
      "\n" +
      "植物名: " +
      parsed.plant +
      "\n" +
      "作業内容: " +
      parsed.task +
      "\n\n" +
      "続けて画像を送ると、この記録に追加されます。",
  );
}

/**
 * 画像メッセージを処理する
 */
function handleImageMessage(event) {
  var messageId = event.message.id;
  var replyToken = event.replyToken;

  debugLog("handleImageMessage 開始");
  debugLog("messageId: " + messageId);

  if (!messageId) {
    debugLog("エラー: messageId がありません");

    replyMessage(
      replyToken,
      "画像を読み取れませんでした。\nもう一度送ってください。",
    );

    return;
  }

  try {
    var latestRecord = getLatestRecordWithoutImage();

    if (!latestRecord) {
      debugLog("画像を追加できる園芸記録がありません");

      replyMessage(
        replyToken,
        "画像を追加できる園芸記録が見つかりませんでした。\n" +
          "先に作業内容を送信してください。",
      );

      return;
    }

    var folder = getOrCreateRecordFolder(
      latestRecord.workDate,
      latestRecord.place,
      latestRecord.detailPlace,
    );

    var file = saveLineImageToDrive(messageId, folder);

    var imageUrl = file.getUrl();
    var folderUrl = folder.getUrl();

    updateRecordImageInformation(
      latestRecord.row,
      imageUrl,
      folderUrl,
    );

    debugLog("画像保存完了");
    debugLog("対象行: " + latestRecord.row);
    debugLog("ファイル名: " + file.getName());
    debugLog("ファイルURL: " + imageUrl);
    debugLog("保存先フォルダURL: " + folderUrl);

    replyMessage(
      replyToken,
      "画像を保存し、園芸記録に追加しました。\n" +
        "保存先: " +
        latestRecord.workDate +
        " / " +
        latestRecord.place +
        " / " +
        latestRecord.detailPlace +
        "\n" +
        "ファイル名: " +
        file.getName(),
    );
  } catch (err) {
    debugLog("画像保存エラー: " + err);
    debugLog(
      "画像保存エラースタック: " +
        (err && err.stack ? err.stack : "stackなし"),
    );

    replyMessage(
      replyToken,
      "画像を保存できませんでした。\n" +
        "時間をおいて、もう一度送ってください。",
    );
  }
}

/**
 * 画像URLが空欄の最新記録を取得する
 */
function getLatestRecordWithoutImage() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    debugLog("garden_logに記録行がありません");

    return null;
  }

  var workDateColumn = 2;
  var placeColumn = 3;
  var detailPlaceColumn = 4;
  var imageUrlColumn = 8;

  for (var row = lastRow; row >= 2; row--) {
    var imageUrl = sheet
      .getRange(row, imageUrlColumn)
      .getValue();

    if (imageUrl) {
      continue;
    }

    var workDate = sheet
      .getRange(row, workDateColumn)
      .getDisplayValue();

    var place = sheet
      .getRange(row, placeColumn)
      .getDisplayValue();

    var detailPlace = sheet
      .getRange(row, detailPlaceColumn)
      .getDisplayValue();

    if (!workDate || !place || !detailPlace) {
      debugLog(
        "画像保存先に必要な情報が不足しています。行番号: " +
          row,
      );

      continue;
    }

    return {
      row: row,
      workDate: workDate,
      place: place,
      detailPlace: detailPlace,
    };
  }

  return null;
}

/**
 * 作業記録に対応する保存先フォルダを取得する
 *
 * images
 * └─ 年
 *    └─ 月
 *       └─ 場所
 *          └─ 詳細場所
 */
function getOrCreateRecordFolder(
  workDate,
  place,
  detailPlace,
) {
  var folderId =
    PropertiesService.getScriptProperties().getProperty(
      "IMAGE_FOLDER_ID",
    );

  if (!folderId) {
    throw new Error(
      "IMAGE_FOLDER_ID が設定されていません",
    );
  }

  var dateParts = getYearAndMonth(workDate);

  if (!dateParts) {
    throw new Error(
      "作業日から年と月を取得できませんでした: " +
        workDate,
    );
  }

  var rootFolder = DriveApp.getFolderById(folderId);

  var yearFolder = getOrCreateChildFolder(
    rootFolder,
    dateParts.year,
  );

  var monthFolder = getOrCreateChildFolder(
    yearFolder,
    dateParts.month,
  );

  var placeFolder = getOrCreateChildFolder(
    monthFolder,
    sanitizeFolderName(place),
  );

  var detailPlaceFolder = getOrCreateChildFolder(
    placeFolder,
    sanitizeFolderName(detailPlace),
  );

  debugLog(
    "画像保存先フォルダ: " +
      dateParts.year +
      "/" +
      dateParts.month +
      "/" +
      place +
      "/" +
      detailPlace,
  );

  return detailPlaceFolder;
}

/**
 * 作業日から年と月を取得する
 *
 * 対応例：
 * 2026/07/11
 * 2026-07-11
 * 2026.07.11
 */
function getYearAndMonth(workDate) {
  if (!workDate) {
    return null;
  }

  var normalizedDate = String(workDate)
    .trim()
    .replace(/[年月.]/g, "/")
    .replace(/日/g, "")
    .replace(/-/g, "/");

  var match = normalizedDate.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  );

  if (!match) {
    return null;
  }

  var year = match[1];
  var month = ("0" + match[2]).slice(-2);

  return {
    year: year,
    month: month,
  };
}

/**
 * 親フォルダ内から同名フォルダを探す。
 * なければ新しく作成する。
 */
function getOrCreateChildFolder(
  parentFolder,
  folderName,
) {
  var folders =
    parentFolder.getFoldersByName(folderName);

  if (folders.hasNext()) {
    var existingFolder = folders.next();

    debugLog(
      "既存フォルダを使用: " + folderName,
    );

    return existingFolder;
  }

  var newFolder =
    parentFolder.createFolder(folderName);

  debugLog(
    "フォルダを新規作成: " + folderName,
  );

  return newFolder;
}

/**
 * Driveフォルダ名として扱いやすい文字列へ変換する
 */
function sanitizeFolderName(folderName) {
  if (!folderName) {
    return "未設定";
  }

  var sanitized = String(folderName)
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "＿");

  if (!sanitized) {
    return "未設定";
  }

  return sanitized;
}

/**
 * LINEから画像データを取得し、
 * 指定されたGoogle Driveフォルダへ保存する
 */
function saveLineImageToDrive(
  messageId,
  destinationFolder,
) {
  var scriptProperties =
    PropertiesService.getScriptProperties();

  var token =
    scriptProperties.getProperty(
      "LINE_CHANNEL_ACCESS_TOKEN",
    );

  if (!token) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN が設定されていません",
    );
  }

  if (!destinationFolder) {
    throw new Error(
      "画像保存先フォルダが指定されていません",
    );
  }

  var contentUrl =
    "https://api-data.line.me/v2/bot/message/" +
    messageId +
    "/content";

  var options = {
    method: "get",
    headers: {
      Authorization: "Bearer " + token,
    },
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(
    contentUrl,
    options,
  );

  var statusCode = response.getResponseCode();

  debugLog("画像取得 status: " + statusCode);

  if (statusCode !== 200) {
    var responseBody =
      response.getContentText();

    debugLog(
      "画像取得 body: " + responseBody,
    );

    throw new Error(
      "LINEからの画像取得に失敗しました。status=" +
        statusCode,
    );
  }

  var blob = response.getBlob();
  var contentType = blob.getContentType();

  debugLog(
    "画像Content-Type: " + contentType,
  );

  var extension =
    getImageExtension(contentType);

  var fileName =
    createImageFileName(extension);

  blob.setName(fileName);

  return destinationFolder.createFile(blob);
}

/**
 * 指定した記録行へ画像URLと
 * DriveフォルダURLを追加する
 */
function updateRecordImageInformation(
  row,
  imageUrl,
  folderUrl,
) {
  var sheet = getSheet();

  var imageUrlColumn = 8;
  var folderUrlColumn = 9;

  sheet
    .getRange(row, imageUrlColumn)
    .setValue(imageUrl);

  sheet
    .getRange(row, folderUrlColumn)
    .setValue(folderUrl);

  debugLog(
    "画像情報を記録しました。行番号: " + row,
  );
}

/**
 * Content-Typeから拡張子を決める
 */
function getImageExtension(contentType) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/gif") {
    return "gif";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

/**
 * 保存する画像のファイル名を作る
 *
 * 例：
 * 20260711_114530_123.jpg
 */
function createImageFileName(extension) {
  var timeZone = Session.getScriptTimeZone();

  var dateText = Utilities.formatDate(
    new Date(),
    timeZone,
    "yyyyMMdd_HHmmss_SSS",
  );

  return dateText + "." + extension;
}

/**
 * テキストを5項目に分解する
 */
function parseText(text) {
  if (!text) {
    debugLog("parseText: text が空です");

    return null;
  }

  var parts = text.trim().split("_");

  if (parts.length !== 5) {
    debugLog(
      "parseText: 入力項目数エラー。項目数=" +
        parts.length,
    );

    return null;
  }

  return {
    workDate: parts[0].trim(),
    place: parts[1].trim(),
    detailPlace: parts[2].trim(),
    plant: parts[3].trim(),
    task: parts[4].trim(),
  };
}

/**
 * 記録用シートを取得する
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);

    sheet.appendRow(HEADER);

    debugLog(
      "記録用シートを新規作成しました: " +
        SHEET_NAME,
    );
  }

  return sheet;
}

/**
 * LINEへ返信メッセージを送る
 */
function replyMessage(replyToken, text) {
  debugLog("replyMessage 開始");

  var token =
    PropertiesService.getScriptProperties().getProperty(
      "LINE_CHANNEL_ACCESS_TOKEN",
    );

  if (!token) {
    debugLog(
      "エラー: LINE_CHANNEL_ACCESS_TOKEN が設定されていません",
    );

    return;
  }

  if (!replyToken) {
    debugLog(
      "エラー: replyToken がありません",
    );

    return;
  }

  var url =
    "https://api.line.me/v2/bot/message/reply";

  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: text,
      },
    ],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(
      url,
      options,
    );

    var statusCode =
      response.getResponseCode();

    var responseBody =
      response.getContentText();

    debugLog(
      "LINE reply status: " + statusCode,
    );

    debugLog(
      "LINE reply body: " + responseBody,
    );
  } catch (err) {
    debugLog(
      "replyMessage error: " + err,
    );
  }
}

/**
 * JSONレスポンスを返す
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(
      ContentService.MimeType.JSON,
    );
}

/**
 * デバッグログを書き出す
 */
function debugLog(message) {
  try {
    var ss =
      SpreadsheetApp.getActiveSpreadsheet();

    var sheet =
      ss.getSheetByName("debug_log");

    if (!sheet) {
      sheet =
        ss.insertSheet("debug_log");

      sheet.appendRow([
        "日時",
        "内容",
      ]);
    }

    sheet.appendRow([
      new Date(),
      message,
    ]);
  } catch (err) {
    // debugLogでエラーが発生しても
    // 本処理を止めない
  }
}

/**
 * スプレッドシート書き込みテスト
 */
function testAppendRow() {
  var sheet = getSheet();

  sheet.appendRow([
    new Date(),
    "2026/07/11",
    "北側",
    "中央",
    "つつじ",
    "剪定",
    "",
    "",
    "",
  ]);

  debugLog("testAppendRow 完了");
}

/**
 * スクリプトプロパティ確認用
 */
function testScriptProperties() {
  var properties =
    PropertiesService.getScriptProperties();

  var token =
    properties.getProperty(
      "LINE_CHANNEL_ACCESS_TOKEN",
    );

  var folderId =
    properties.getProperty(
      "IMAGE_FOLDER_ID",
    );

  if (token) {
    debugLog(
      "LINE_CHANNEL_ACCESS_TOKEN は設定されています",
    );
  } else {
    debugLog(
      "LINE_CHANNEL_ACCESS_TOKEN が設定されていません",
    );
  }

  if (folderId) {
    debugLog(
      "IMAGE_FOLDER_ID は設定されています",
    );
  } else {
    debugLog(
      "IMAGE_FOLDER_ID が設定されていません",
    );
  }
}

/**
 * Google Driveへの保存権限確認用
 */
function testImageFolderAccess() {
  var folderId =
    PropertiesService.getScriptProperties().getProperty(
      "IMAGE_FOLDER_ID",
    );

  if (!folderId) {
    debugLog(
      "IMAGE_FOLDER_ID が設定されていません",
    );

    return;
  }

  try {
    var folder =
      DriveApp.getFolderById(folderId);

    debugLog(
      "画像フォルダへアクセスできました: " +
        folder.getName(),
    );
  } catch (err) {
    debugLog(
      "画像フォルダへのアクセスエラー: " +
        err,
    );
  }
}

/**
 * フォルダ自動作成テスト
 *
 * 実際に次のフォルダを作成する。
 *
 * images
 * └─ 2026
 *    └─ 07
 *       └─ 北側
 *          └─ 中央
 */
function testCreateRecordFolder() {
  try {
    var folder =
      getOrCreateRecordFolder(
        "2026/07/11",
        "北側",
        "中央",
      );

    debugLog(
      "フォルダ自動作成テスト成功: " +
        folder.getUrl(),
    );
  } catch (err) {
    debugLog(
      "フォルダ自動作成テスト失敗: " +
        err,
    );
  }
}

/**
 * UrlFetchAppの外部通信権限確認用
 */
function authorizeUrlFetch() {
  debugLog("authorizeUrlFetch 開始");

  try {
    var response = UrlFetchApp.fetch(
      "https://www.google.com",
      {
        method: "get",
        muteHttpExceptions: true,
      },
    );

    debugLog(
      "authorizeUrlFetch status: " +
        response.getResponseCode(),
    );

    debugLog(
      "UrlFetchApp の外部通信権限テスト完了",
    );
  } catch (err) {
    debugLog(
      "authorizeUrlFetch error: " + err,
    );
  }
}
