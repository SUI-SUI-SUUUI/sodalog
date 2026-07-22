/**
 * 画像メッセージを処理する
 */
function handleImageMessage(event) {
  var messageId = event.message.id;
  var replyToken = event.replyToken;

  var userId = event.source && event.source.userId ? event.source.userId : "";

  if (!userId) {
    debugLog("画像送信者のLINEユーザーIDを取得できませんでした");

    replyMessage(
      replyToken,
      "ユーザー情報を取得できませんでした。\n" + "もう一度お試しください。",
    );
    return;
  }

  if (!messageId) {
    replyMessage(
      replyToken,
      "画像を読み取れませんでした。\n" + "もう一度送ってください。",
    );
    return;
  }

  var lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(10000)) {
      replyMessage(
        replyToken,
        "画像の保存処理が混み合っています。\n少し待ってから、もう一度送ってください。",
      );
      return;
    }

    var latestRecord = getLatestRecordWithoutImage(userId);

    if (!latestRecord) {
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

    var file = saveLineImageToDrive(
      messageId,
      folder,
      latestRecord.workDate,
      latestRecord.plant,
      latestRecord.task,
    );

    updateRecordImageInformation(
      latestRecord.row,
      file.getUrl(),
      folder.getUrl(),
    );

    replyMessage(
      replyToken,
      "画像を保存し、園芸記録に追加しました。\n" +
        "保存先: " +
        formatWorkDateForDisplay(latestRecord.workDate) +
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

    replyMessage(
      replyToken,
      "画像を保存できませんでした。\n" +
        "時間をおいて、もう一度送ってください。",
    );
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

/**
 * 指定ユーザーの記録から、
 * 画像URLが空欄の最新記録を取得する
 */
function getLatestRecordWithoutImage(userId) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  var imageUrlColumn = 8;
  var userIdColumn = 10;
  var createdAtColumn = 1;
  var imageAttachLimitMilliseconds = 30 * 60 * 1000;
  var now = new Date().getTime();

  for (var row = lastRow; row >= 2; row--) {
    var recordUserId = sheet.getRange(row, userIdColumn).getDisplayValue();

    if (String(recordUserId) !== String(userId)) {
      continue;
    }

    var imageUrl = sheet.getRange(row, imageUrlColumn).getValue();

    if (imageUrl) {
      continue;
    }

    var createdAt = sheet.getRange(row, createdAtColumn).getValue();

    if (!(createdAt instanceof Date)) {
      continue;
    }

    if (now - createdAt.getTime() > imageAttachLimitMilliseconds) {
      continue;
    }

    var workDate = sheet.getRange(row, 2).getDisplayValue();

    var place = sheet.getRange(row, 3).getDisplayValue();

    var detailPlace = sheet.getRange(row, 4).getDisplayValue();

    var plant = sheet.getRange(row, 5).getDisplayValue();

    var task = sheet.getRange(row, 6).getDisplayValue();

    if (!workDate || !place || !detailPlace || !plant || !task) {
      continue;
    }

    return {
      row: row,
      workDate: workDate,
      place: place,
      detailPlace: detailPlace,
      plant: plant,
      task: task,
    };
  }

  return null;
}

/**
 * 保存先フォルダを取得する
 */
function getOrCreateRecordFolder(workDate, place, detailPlace) {
  var folderId =
    PropertiesService.getScriptProperties().getProperty("IMAGE_FOLDER_ID");

  if (!folderId) {
    throw new Error("IMAGE_FOLDER_ID が設定されていません");
  }

  var year = getYearFromWorkDate(workDate);

  if (!year) {
    throw new Error("作業日から年を取得できませんでした");
  }

  var rootFolder = DriveApp.getFolderById(folderId);

  var placeFolder = getOrCreateChildFolder(
    rootFolder,
    sanitizeFolderName(place),
  );

  var detailPlaceFolder = getOrCreateChildFolder(
    placeFolder,
    sanitizeFolderName(detailPlace),
  );

  return getOrCreateChildFolder(detailPlaceFolder, year);
}

/**
 * 年を取得する
 */
function getYearFromWorkDate(workDate) {
  var match = String(workDate)
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * 子フォルダを取得または作成する
 */
function getOrCreateChildFolder(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(folderName);
}

/**
 * フォルダ名を安全な文字列へ変換する
 */
function sanitizeFolderName(folderName) {
  if (!folderName) {
    return "未設定";
  }

  return (
    String(folderName)
      .trim()
      .replace(/[\/\\:*?"<>|]/g, "＿") || "未設定"
  );
}

/**
 * LINE画像をDriveへ保存する
 */
function saveLineImageToDrive(
  messageId,
  destinationFolder,
  workDate,
  plant,
  task,
) {
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

  var contentUrl =
    "https://api-data.line.me/v2/bot/message/" + messageId + "/content";

  var response = UrlFetchApp.fetch(contentUrl, {
    method: "get",
    headers: {
      Authorization: "Bearer " + token,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("LINEからの画像取得に失敗しました");
  }

  var blob = response.getBlob();

  var extension = getImageExtension(blob.getContentType());

  blob.setName(
    createImageFileName(destinationFolder, workDate, plant, task, extension),
  );

  return destinationFolder.createFile(blob);
}

/**
 * 画像URLを記録する
 */
function updateRecordImageInformation(row, imageUrl, folderUrl) {
  var sheet = getSheet();

  sheet.getRange(row, 8).setValue(imageUrl);

  sheet.getRange(row, 9).setValue(folderUrl);
}

/**
 * 画像拡張子を取得する
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
 * ファイル名の一部を安全な文字列へ変換する
 */
function sanitizeFileNamePart(value, fallback) {
  var safeValue = String(value || "")
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "＿")
    .replace(/[\r\n\t]/g, " ");

  return safeValue || fallback;
}

/**
 * 作業日をファイル名用のYYYYMMDD形式へ変換する
 */
function formatWorkDateForFileName(workDate) {
  var normalizedDate = normalizeDateText(workDate);
  var match = String(normalizedDate)
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})$/);

  if (!match) {
    throw new Error("作業日から画像ファイル名を作成できませんでした");
  }

  return match[1] + match[2] + match[3];
}

/**
 * 画像ファイル名を作る
 */
function createImageFileName(
  destinationFolder,
  workDate,
  plant,
  task,
  extension,
) {
  var baseName =
    formatWorkDateForFileName(workDate) +
    "_" +
    sanitizeFileNamePart(plant, "植物名未設定") +
    "_" +
    sanitizeFileNamePart(task, "作業内容未設定");

  var sequence = 1;
  var fileName;

  do {
    fileName = baseName + "_" + ("0" + sequence).slice(-2) + "." + extension;
    sequence++;
  } while (destinationFolder.getFilesByName(fileName).hasNext());

  return fileName;
}
