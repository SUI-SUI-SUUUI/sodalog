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

    var session = getUserSession(userId);

    if (
      !session ||
      session.step !== "WAITING_PHOTO_CHOICE" ||
      !session.savedRow
    ) {
      replyMessage(
        replyToken,
        "この画像を追加できる園芸記録はありません。\n" +
          "先に「記録する」から園芸記録を保存してください。",
      );
      return;
    }

    var pendingRecord = getPendingImageRecord(userId, session.savedRow);

    if (!pendingRecord) {
      deleteUserSession(userId);

      replyMessage(
        replyToken,
        "画像を追加できる園芸記録を確認できませんでした。\n" +
          "もう一度「記録する」から園芸記録を保存してください。",
      );
      return;
    }

    var folder = getOrCreateRecordFolder(
      pendingRecord.workDate,
      pendingRecord.place,
      pendingRecord.detailPlace,
    );

    var file = saveLineImageToDrive(
      messageId,
      folder,
      pendingRecord.workDate,
      pendingRecord.plant,
      pendingRecord.task,
    );

    updateRecordImageInformation(
      pendingRecord.row,
      file.getUrl(),
      folder.getUrl(),
    );

    deleteUserSession(userId);

    replyMessage(
      replyToken,
      "画像を保存し、園芸記録を完了しました。\n" +
        "保存先: " +
        formatWorkDateForDisplay(pendingRecord.workDate) +
        " / " +
        (pendingRecord.place || "未設定") +
        " / " +
        (pendingRecord.detailPlace || "未設定") +
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
 * 画像追加待ちセッションに保存された行番号から、
 * 画像を追加する対象レコードを取得する
 */
function getPendingImageRecord(userId, savedRow) {
  var targetRow = Number(savedRow);

  if (!targetRow || targetRow < 2) {
    return null;
  }

  var sheet = getSheet();

  if (targetRow > sheet.getLastRow()) {
    return null;
  }

  var recordUserId = sheet.getRange(targetRow, 10).getDisplayValue();
  var imageUrl = sheet.getRange(targetRow, 8).getValue();
  var createdAt = sheet.getRange(targetRow, 1).getValue();

  if (String(recordUserId) !== String(userId)) {
    return null;
  }

  if (imageUrl) {
    return null;
  }

  if (!(createdAt instanceof Date)) {
    return null;
  }

  var imageAttachLimitMilliseconds = 30 * 60 * 1000;
  var now = new Date().getTime();

  if (now - createdAt.getTime() > imageAttachLimitMilliseconds) {
    return null;
  }

  var workDate = sheet.getRange(targetRow, 2).getDisplayValue();
  var place = sheet.getRange(targetRow, 3).getDisplayValue();
  var detailPlace = sheet.getRange(targetRow, 4).getDisplayValue();
  var plant = sheet.getRange(targetRow, 5).getDisplayValue();
  var task = sheet.getRange(targetRow, 6).getDisplayValue();

  if (!workDate || !plant || !task) {
    return null;
  }

  return {
    row: targetRow,
    workDate: workDate,
    place: place,
    detailPlace: detailPlace,
    plant: plant,
    task: task,
  };
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
