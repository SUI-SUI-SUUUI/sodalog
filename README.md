# My Garden Lab

My Garden Labは、LINEから園芸作業の記録を送るだけで、GoogleスプレッドシートとGoogle Driveに自動整理する園芸記録管理アシスタントです。

## 概要

庭仕事中にパソコンを開かなくても、スマホのLINEから作業内容を送るだけで、日付・場所・植物名・作業内容を記録できます。

将来的には、送信された画像をGoogle Drive内の場所別・時系列フォルダに自動保存し、園芸記録を振り返りやすくすることを目指します。

## 解決したい課題

園芸作業の記録は、写真・日付・場所・植物名・作業内容が分散しやすく、あとから振り返りにくいという課題があります。

My Garden Labでは、普段使っているLINEを入口にすることで、庭仕事の流れを止めずに記録を残せる仕組みを作ります。

## MVP

まずは、LINEから送信したテキストをGoogleスプレッドシートに保存し、記録完了メッセージをLINEに返信する機能を実装します。

入力例：

```text
2026/04/11_北側_中央_つつじ_剪定
```

## 現在できること

- LINEから作業内容を送信
- Google Apps ScriptでWebhookを受信
- 入力内容を解析
- Googleスプレッドシートに1行追加
- 記録完了メッセージをLINEに返信
- LINEから送信した画像をGoogle Driveへ保存
- 保存した画像URLをスプレッドシートへ記録
- Google Driveの画像保存フォルダURLをスプレッドシートへ記録

## 今後追加予定

- 年 / 月 / 場所 / 詳細場所ごとのフォルダ自動作成
- 入力ミス時の案内返信
- LINEリッチメニュー
- 月ごとの園芸作業ふりかえり

## 使用技術

- LINE Messaging API
- Google Apps Script
- Google Spreadsheet
- Google Drive
- GitHub

## システム構成

```text
LINE
  ↓
LINE Messaging API
  ↓
Google Apps Script
  ↓
Google Spreadsheet / Google Drive
```

## ドキュメント

- [画像保存フォルダ構成](docs/folder-structure.md)
- [AI活用ログ](docs/ai-usage-log.md)

## AI活用

本プロジェクトでは、生成AIを開発補助として活用しています。

# ChatGPT：開発の中心

- 次に作る機能の整理
- GASコードの作成と修正
- エラー原因の切り分け
- READMEや応募文の作成
- EDD審査項目との照合
- ユーザー価値の言語化

# Cursor：コード作業の場所

- GitHubリポジトリを開く
- ファイル全体を確認する
- ChatGPTのコードを反映する
- 変更差分を見る
- GitHubへ保存する

# Claudeなど：節目だけの第三者レビュー

- 毎回は使わない。以下のタイミングで利用想定。
- LINEのテキスト・画像保存が完成した時
- 応募用READMEとProtoPediaページが完成した時
- 最終デモとプレゼン資料が完成した時

AI活用の詳細は `docs/ai-usage-log.md` に記録しています。

## 開発状況

開発中です。

2026年7月時点で、MVPの基本機能である以下の流れが動作しています。

```text
LINE → Google Apps Script → Googleスプレッドシート記録 → LINE返信
```

次の実装予定は、LINEから送信した画像をGoogle Driveへ保存し、スプレッドシートの 画像URL 列に記録する機能です。
