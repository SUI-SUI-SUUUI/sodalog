/**
 * LIFFから送信された園芸記録を保存する
 *
 * @param {Object} requestData LIFFから受け取ったデータ
 * @return {Object} 処理結果
 */
function saveGardenLogFromLiff(requestData) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!requestData || typeof requestData !== "object") {
      throw new Error("送信データがありません");
    }

    var idToken = String(requestData.idToken || "").trim();

    if (!idToken) {
      throw new Error("LINE認証情報がありません");
    }

    var verifiedUser = verifyLiffIdToken(idToken);
    var userId = verifiedUser.userId;

    if (!isAllowedLiffUser(userId)) {
      debugLog("未許可ユーザーからのLIFF保存を拒否しました");

      return {
        success: false,
        message: "このアカウントでは記録できません。",
      };
    }

    var validatedData = validateLiffGardenLogData(
      requestData.gardenLog,
    );

    var sheet = getSheet();

    var rowData = escapeSpreadsheetRow([
      new Date(),
      validatedData.workDate,
      validatedData.place,
      validatedData.detailPlace,
      validatedData.plant,
      validatedData.task,
      validatedData.memo,
      "",
      "",
      userId,
      validatedData.base,
    ]);

    sheet.appendRow(rowData);

    var savedRow = sheet.getLastRow();

    debugLog(
      "LIFFからの園芸記録保存完了: row=" + savedRow,
    );

    return {
      success: true,
      message: "園芸記録を保存しました。",
      savedRow: savedRow,
    };
  } catch (error) {
    debugLog("LIFF保存エラー: " + error);

    return {
      success: false,
      message:
        "記録を保存できませんでした。\n" +
        "時間をおいて、もう一度お試しください。",
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (lockError) {
      debugLog("LIFF保存ロック解放エラー: " + lockError);
    }
  }
}

/**
 * LIFFのIDトークンをLINEプラットフォームで検証する
 *
 * スクリプトプロパティ：
 * LINE_LOGIN_CHANNEL_ID
 *
 * @param {string} idToken LIFFで取得したIDトークン
 * @return {Object} 検証済みユーザー情報
 */
function verifyLiffIdToken(idToken) {
  var channelId =
    PropertiesService.getScriptProperties().getProperty(
      "LINE_LOGIN_CHANNEL_ID",
    );

  if (!channelId) {
    throw new Error(
      "LINE_LOGIN_CHANNEL_IDが未設定です",
    );
  }

  var response = UrlFetchApp.fetch(
    "https://api.line.me/oauth2/v2.1/verify",
    {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: {
        id_token: idToken,
        client_id: String(channelId).trim(),
      },
      muteHttpExceptions: true,
    },
  );

  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  if (responseCode !== 200) {
    debugLog(
      "IDトークン検証失敗: status=" + responseCode,
    );

    throw new Error("IDトークンを検証できませんでした");
  }

  var tokenData = JSON.parse(responseText);

  if (!tokenData.sub) {
    throw new Error(
      "検証結果からLINEユーザーIDを取得できませんでした",
    );
  }

  if (
    String(tokenData.aud) !==
    String(channelId).trim()
  ) {
    throw new Error(
      "IDトークンのチャネルIDが一致しません",
    );
  }

  return {
    userId: String(tokenData.sub),
  };
}

/**
 * LIFF利用者が開発中の許可ユーザーか確認する
 *
 * スクリプトプロパティ：
 * ALLOWED_LINE_USER_ID
 *
 * @param {string} userId 検証済みLINEユーザーID
 * @return {boolean} 許可されている場合はtrue
 */
function isAllowedLiffUser(userId) {
  var allowedUserId =
    PropertiesService.getScriptProperties().getProperty(
      "ALLOWED_LINE_USER_ID",
    );

  if (!allowedUserId) {
    debugLog(
      "エラー: ALLOWED_LINE_USER_IDが未設定です",
    );

    return false;
  }

  return (
    String(userId) ===
    String(allowedUserId).trim()
  );
}

/**
 * LIFFから受け取った園芸記録を検証する
 *
 * @param {Object} gardenLog 園芸記録
 * @return {Object} 整形済みデータ
 */
function validateLiffGardenLogData(gardenLog) {
  if (!gardenLog || typeof gardenLog !== "object") {
    throw new Error("園芸記録データがありません");
  }

  var workDate = String(
    gardenLog.workDate || "",
  ).trim();

  var base = String(
    gardenLog.base || "",
  ).trim();

  var place = String(
    gardenLog.place || "",
  ).trim();

  var detailPlace = String(
    gardenLog.detailPlace || "",
  ).trim();

  var plant = String(
    gardenLog.plant || "",
  ).trim();

  var task = String(
    gardenLog.task || "",
  ).trim();

  var memo = String(
    gardenLog.memo || "",
  ).trim();

  if (!isValidLiffWorkDate(workDate)) {
    throw new Error("作業日が不正です");
  }

  if (!base) {
    throw new Error("育成拠点が未入力です");
  }

  if (!place) {
    throw new Error("場所が未入力です");
  }

  if (!plant) {
    throw new Error("植物名が未入力です");
  }

  if (!task) {
    throw new Error("作業内容が未入力です");
  }

  if (base.length > 100) {
    throw new Error("育成拠点が長すぎます");
  }

  if (place.length > 100) {
    throw new Error("場所が長すぎます");
  }

  if (detailPlace.length > 100) {
    throw new Error("詳細場所が長すぎます");
  }

  if (plant.length > 200) {
    throw new Error("植物名が長すぎます");
  }

  if (task.length > 100) {
    throw new Error("作業内容が長すぎます");
  }

  if (memo.length > 2000) {
    throw new Error("メモが長すぎます");
  }

  return {
    workDate: workDate.replace(/-/g, "/"),
    base: base,
    place: place,
    detailPlace: detailPlace,
    plant: plant,
    task: task,
    memo: memo,
  };
}

/**
 * LIFFから受け取った作業日を検証する
 *
 * @param {string} workDate YYYY-MM-DD形式の日付
 * @return {boolean} 正しい日付の場合はtrue
 */
function isValidLiffWorkDate(workDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return false;
  }

  var parts = workDate.split("-");

  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);

  var date = new Date(
    year,
    month - 1,
    day,
  );

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}