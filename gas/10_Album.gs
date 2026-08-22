/**
 * アルバム一覧取得リクエストを処理する
 *
 * クエリパラメータ：
 * idToken - LIFFで取得したLINEのIDトークン
 */
function handleAlbumListRequest(e) {
  try {
    var idToken = e && e.parameter ? String(e.parameter.idToken || "") : "";

    if (!idToken) {
      return createJsonResponse({
        success: false,
        message: "認証情報がありません",
      });
    }

    var verifiedUser = verifyLiffIdToken(idToken);
    var userId = verifiedUser.userId;

    if (!isAllowedLiffUser(userId)) {
      debugLog("未許可ユーザーからのアルバム取得を拒否しました");

      return createJsonResponse({
        success: false,
        message: "このアカウントでは利用できません",
      });
    }

    var records = getAlbumRecordsForUser(userId, 50);

    return createJsonResponse({
      success: true,
      records: records,
    });
  } catch (error) {
    debugLog("アルバム一覧取得エラー: " + error);

    return createJsonResponse({
      success: false,
      message: "記録を取得できませんでした",
    });
  }
}

/**
 * 指定ユーザーの記録一覧を、記録日時の新しい順に取得する
 *
 * @param {string} userId 検証済みLINEユーザーID
 * @param {number} limit 取得件数の上限
 * @return {Array<Object>} 記録一覧
 */
function getAlbumRecordsForUser(userId, limit) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getValues();

  var records = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    if (String(row[9] || "") !== String(userId)) {
      continue;
    }

    var recordedAt = row[0];
    var imageUrl = String(row[7] || "");

    records.push({
      recordedAtMs: recordedAt instanceof Date ? recordedAt.getTime() : 0,
      workDate: String(row[1] || ""),
      place: String(row[2] || ""),
      detailPlace: String(row[3] || ""),
      plant: String(row[4] || ""),
      task: String(row[5] || ""),
      memo: String(row[6] || ""),
      hasImage: Boolean(imageUrl),
      imageFileId: extractDriveFileId(imageUrl),
    });
  }

  records.sort(function (a, b) {
    return b.recordedAtMs - a.recordedAtMs;
  });

  return records.slice(0, limit).map(function (record) {
    return {
      workDate: record.workDate,
      place: record.place,
      detailPlace: record.detailPlace,
      plant: record.plant,
      task: record.task,
      memo: record.memo,
      hasImage: record.hasImage,
      imageFileId: record.imageFileId,
    };
  });
}

/**
 * DriveのファイルURLからファイルIDを取り出す
 *
 * @param {string} url file.getUrl() 形式のURL
 * @return {string} ファイルID。取り出せない場合は空文字
 */
function extractDriveFileId(url) {
  if (!url) {
    return "";
  }

  var match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);

  return match ? match[1] : "";
}

/**
 * アルバム画像取得リクエストを処理する
 *
 * Apps ScriptのdoGetはHTML/テキストしか返せないため、
 * 画像本体はBase64にエンコードしてJSONで返す。
 *
 * クエリパラメータ：
 * idToken - LIFFで取得したLINEのIDトークン
 * fileId - DriveのファイルID
 */
function handleAlbumImageRequest(e) {
  try {
    var idToken = e && e.parameter ? String(e.parameter.idToken || "") : "";
    var fileId = e && e.parameter ? String(e.parameter.fileId || "") : "";

    if (!idToken || !fileId) {
      return createJsonResponse({
        success: false,
        message: "パラメータが不足しています",
      });
    }

    var verifiedUser = verifyLiffIdToken(idToken);
    var userId = verifiedUser.userId;

    if (!isAllowedLiffUser(userId)) {
      debugLog("未許可ユーザーからのアルバム画像取得を拒否しました");

      return createJsonResponse({
        success: false,
        message: "このアカウントでは利用できません",
      });
    }

    if (!isFileOwnedByUser(userId, fileId)) {
      debugLog("本人の記録に紐づかない画像取得を拒否しました");

      return createJsonResponse({
        success: false,
        message: "この画像を表示できません",
      });
    }

    var blob = DriveApp.getFileById(fileId).getBlob();

    return createJsonResponse({
      success: true,
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
    });
  } catch (error) {
    debugLog("アルバム画像取得エラー: " + error);

    return createJsonResponse({
      success: false,
      message: "画像を取得できませんでした",
    });
  }
}

/**
 * 指定のDriveファイルIDが、本人の記録に紐づくものか確認する
 *
 * @param {string} userId 検証済みLINEユーザーID
 * @param {string} fileId 確認対象のDriveファイルID
 * @return {boolean} 本人の記録に紐づく場合はtrue
 */
function isFileOwnedByUser(userId, fileId) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];

    if (String(row[9] || "") !== String(userId)) {
      continue;
    }

    if (extractDriveFileId(String(row[7] || "")) === fileId) {
      return true;
    }
  }

  return false;
}
