/**
 * My Garden Lab - リッチメニュー管理
 *
 * 事前準備：
 * 1. my_garden_lab_richmenu_2500x843.png をGoogle Driveへアップロード
 * 2. 画像ファイルIDをスクリプトプロパティへ登録
 *
 * プロパティ名：
 * RICH_MENU_IMAGE_FILE_ID
 *
 * LINE_CHANNEL_ACCESS_TOKEN は既存設定を使用する
 */

/**
 * リッチメニューを一括作成する
 *
 * 実行順：
 * 1. リッチメニュー作成
 * 2. 画像アップロード
 * 3. デフォルト設定
 */
function setupRichMenu() {
  var richMenuId = createMyGardenLabRichMenu();

  uploadRichMenuImage(richMenuId);

  setDefaultRichMenu(richMenuId);

  PropertiesService.getScriptProperties().setProperty(
    "RICH_MENU_ID",
    richMenuId,
  );

  debugLog("リッチメニュー設定完了: " + richMenuId);
}

/**
 * 3分割リッチメニューを作成する
 */
function createMyGardenLabRichMenu() {
  var token = getLineChannelAccessToken();

  var payload = {
    size: {
      width: 2500,
      height: 843,
    },
    selected: true,
    name: "My Garden Lab メインメニュー",
    chatBarText: "メニュー",
    areas: [
      {
        bounds: {
          x: 0,
          y: 0,
          width: 833,
          height: 843,
        },
        action: {
          type: "message",
          label: "記録する",
          text: "記録する",
        },
      },
      {
        bounds: {
          x: 833,
          y: 0,
          width: 833,
          height: 843,
        },
        action: {
          type: "message",
          label: "最近の記録",
          text: "最近の記録",
        },
      },
      {
        bounds: {
          x: 1666,
          y: 0,
          width: 834,
          height: 843,
        },
        action: {
          type: "message",
          label: "使い方",
          text: "使い方",
        },
      },
    ],
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/richmenu", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  assertLineApiSuccess(response, "リッチメニュー作成");

  var result = JSON.parse(response.getContentText());

  if (!result.richMenuId) {
    throw new Error("richMenuIdを取得できませんでした");
  }

  return result.richMenuId;
}

/**
 * Drive上の画像をリッチメニューへ登録する
 */
function uploadRichMenuImage(richMenuId) {
  var token = getLineChannelAccessToken();

  var fileId = PropertiesService.getScriptProperties().getProperty(
    "RICH_MENU_IMAGE_FILE_ID",
  );

  if (!fileId) {
    throw new Error("RICH_MENU_IMAGE_FILE_IDが設定されていません");
  }

  var file = DriveApp.getFileById(fileId);

  var blob = file.getBlob();

  var contentType = blob.getContentType();

  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw new Error("リッチメニュー画像はPNGまたはJPEGを使用してください");
  }

  var response = UrlFetchApp.fetch(
    "https://api-data.line.me/v2/bot/richmenu/" + richMenuId + "/content",
    {
      method: "post",
      contentType: contentType,
      headers: {
        Authorization: "Bearer " + token,
      },
      payload: blob.getBytes(),
      muteHttpExceptions: true,
    },
  );

  assertLineApiSuccess(response, "リッチメニュー画像アップロード");
}

/**
 * リッチメニューを全ユーザーのデフォルトに設定する
 */
function setDefaultRichMenu(richMenuId) {
  var token = getLineChannelAccessToken();

  var response = UrlFetchApp.fetch(
    "https://api.line.me/v2/bot/user/all/richmenu/" + richMenuId,
    {
      method: "post",
      headers: {
        Authorization: "Bearer " + token,
      },
      muteHttpExceptions: true,
    },
  );

  assertLineApiSuccess(response, "デフォルトリッチメニュー設定");
}

/**
 * 現在のデフォルトリッチメニューIDを確認する
 */
function getDefaultRichMenuId() {
  var token = getLineChannelAccessToken();

  var response = UrlFetchApp.fetch(
    "https://api.line.me/v2/bot/user/all/richmenu",
    {
      method: "get",
      headers: {
        Authorization: "Bearer " + token,
      },
      muteHttpExceptions: true,
    },
  );

  assertLineApiSuccess(response, "デフォルトリッチメニュー確認");

  var result = JSON.parse(response.getContentText());

  debugLog("現在のデフォルトリッチメニュー: " + result.richMenuId);

  return result.richMenuId;
}

/**
 * デフォルトリッチメニューを解除する
 */
function clearDefaultRichMenu() {
  var token = getLineChannelAccessToken();

  var response = UrlFetchApp.fetch(
    "https://api.line.me/v2/bot/user/all/richmenu",
    {
      method: "delete",
      headers: {
        Authorization: "Bearer " + token,
      },
      muteHttpExceptions: true,
    },
  );

  assertLineApiSuccess(response, "デフォルトリッチメニュー解除");

  debugLog("デフォルトリッチメニューを解除しました");
}

/**
 * スクリプトプロパティに保存された
 * リッチメニューを削除する
 */
function deleteSavedRichMenu() {
  var properties = PropertiesService.getScriptProperties();

  var richMenuId = properties.getProperty("RICH_MENU_ID");

  if (!richMenuId) {
    throw new Error("RICH_MENU_IDが保存されていません");
  }

  deleteRichMenuById(richMenuId);

  properties.deleteProperty("RICH_MENU_ID");
}

/**
 * 指定したリッチメニューを削除する
 */
function deleteRichMenuById(richMenuId) {
  var token = getLineChannelAccessToken();

  var response = UrlFetchApp.fetch(
    "https://api.line.me/v2/bot/richmenu/" + richMenuId,
    {
      method: "delete",
      headers: {
        Authorization: "Bearer " + token,
      },
      muteHttpExceptions: true,
    },
  );

  assertLineApiSuccess(response, "リッチメニュー削除");

  debugLog("リッチメニューを削除しました: " + richMenuId);
}

/**
 * LINEチャネルアクセストークンを取得する
 */
function getLineChannelAccessToken() {
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKENが設定されていません");
  }

  return token;
}

/**
 * LINE APIのレスポンスを確認する
 */
function assertLineApiSuccess(response, actionName) {
  var statusCode = response.getResponseCode();

  var responseBody = response.getContentText();

  debugLog(actionName + " status: " + statusCode);

  debugLog(actionName + " body: " + responseBody);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      actionName +
        "に失敗しました。status=" +
        statusCode +
        " body=" +
        responseBody,
    );
  }
}
