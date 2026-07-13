/**
 * My Garden Lab - LINE Webhook
 */

var SHEET_NAME = "garden_log";
var SESSION_SHEET_NAME = "user_sessions";

var SESSION_HEADER = [
  "LINEユーザーID",
  "現在の段階",
  "作業日",
  "育成拠点",
  "場所",
  "詳細場所",
  "植物名",
  "作業内容",
  "メモ",
  "更新日時",
];

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
  "LINEユーザーID",
  "育成拠点",
];
