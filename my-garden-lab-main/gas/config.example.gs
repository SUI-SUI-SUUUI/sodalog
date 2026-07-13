/**
 * My Garden Lab - スクリプトプロパティ設定例
 *
 * このファイルは GitHub 用の参照テンプレートです。
 * 実際の値は Google Apps Script の
 * 「プロジェクトの設定 → スクリプト プロパティ」
 * に登録してください。
 *
 * 値をこのファイルや config.gs に直接書かないでください。
 * config.gs をローカルで使う場合は .gitignore 対象です。
 */

/** 必須プロパティ */
var REQUIRED_SCRIPT_PROPERTIES = [
  "LINE_CHANNEL_ACCESS_TOKEN",
  "IMAGE_FOLDER_ID",
];

/** リッチメニュー利用時のみ必要 */
var OPTIONAL_SCRIPT_PROPERTIES = [
  "RICH_MENU_IMAGE_FILE_ID",
  "RICH_MENU_ID",
];

/**
 * スクリプトプロパティの設定手順
 *
 * 1. GASエディタ右上「プロジェクトの設定」を開く
 * 2. 「スクリプト プロパティ」で次を追加する
 *
 * | プロパティ名                 | 設定内容                                      |
 * |-----------------------------|-----------------------------------------------|
 * | LINE_CHANNEL_ACCESS_TOKEN   | LINE Developers のチャネルアクセストークン     |
 * | IMAGE_FOLDER_ID             | 画像保存用 Google Drive 親フォルダの ID        |
 * | RICH_MENU_IMAGE_FILE_ID     | リッチメニュー画像の Drive ファイル ID（任意） |
 * | RICH_MENU_ID                | setupRichMenu 実行後に自動保存（任意）         |
 *
 * IMAGE_FOLDER_ID の確認方法:
 * Drive でフォルダを開き、URL の folders/ の直後が ID です。
 * 例: https://drive.google.com/drive/folders/xxxxxxxxxxxxxxxx
 */

/**
 * 必須プロパティが設定されているか確認する
 *
 * GASエディタから実行し、ログで結果を確認してください。
 * 値そのものは出力しません。
 */
function checkRequiredScriptProperties() {
  var properties = PropertiesService.getScriptProperties();
  var missing = [];

  REQUIRED_SCRIPT_PROPERTIES.forEach(function (key) {
    var value = properties.getProperty(key);

    if (!value || String(value).trim() === "") {
      missing.push(key);
      return;
    }

    debugLog("設定済み: " + key);
  });

  if (missing.length > 0) {
    debugLog("未設定: " + missing.join(", "));
    throw new Error(
      "未設定のスクリプトプロパティがあります: " + missing.join(", "),
    );
  }

  debugLog("必須スクリプトプロパティはすべて設定されています。");
}

/**
 * 任意プロパティの設定状況を確認する
 */
function checkOptionalScriptProperties() {
  var properties = PropertiesService.getScriptProperties();

  OPTIONAL_SCRIPT_PROPERTIES.forEach(function (key) {
    var value = properties.getProperty(key);

    if (!value || String(value).trim() === "") {
      debugLog("未設定（任意）: " + key);
      return;
    }

    debugLog("設定済み（任意）: " + key);
  });
}
