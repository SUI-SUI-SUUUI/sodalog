# GitHub Pages版LIFFの公開手順

このLIFFは、GitHub Pagesで画面を公開し、保存時はLINEトークへ記録テキストを送ります。
既存のLINE WebhookとGoogle Apps Scriptがそのメッセージを受け、Googleスプレッドシートへ保存します。
Cloud Runなどの追加バックエンドは使いません。

## 1. GitHub Pagesを有効にする

GitHubリポジトリの **Settings > Pages** を開き、Sourceを **GitHub Actions** に設定します。

その後、`liff/` または `.github/workflows/deploy-liff-pages.yml` を含む変更をGitHubへpushします。
Actionsの **Deploy LIFF to GitHub Pages** が成功すると、PagesのURLが表示されます。

公開URLは通常、次の形式です。

```text
https://<GitHubユーザー名>.github.io/<リポジトリ名>/
```

## 2. LINE DevelopersのLIFF設定を更新する

LINE Developersコンソールで、既存LIFFアプリのエンドポイントURLをGitHub Pagesの公開URLに変更します。

次を確認してください。

- スコープに `chat_message.write` があること
- LIFF URLを、公式アカウントとの1対1トーク内のリッチメニューから開くこと
- リッチメニューのLIFFアクションに、既存のLIFF IDを設定すること

`liff.sendMessages()` は、LINEアプリ内で1対1トークから起動した場合に利用できます。
外部ブラウザや「最近使用したサービス」から再読み込みした画面では送信できない場合があります。

## 3. Apps Scriptを更新してデプロイする

次のファイルを既存のApps Scriptプロジェクトへ反映し、Webアプリのデプロイを更新します。

- `gas/01_Webhook.gs`
- `gas/03_ValidationDate.gs`

LIFFが送る形式は、次の7項目です。

```text
作業日_育成拠点_場所_詳細場所_植物名_作業内容_メモ
```

従来の5項目形式も引き続き利用できます。

```text
作業日_場所_詳細場所_植物名_作業内容
```

## 4. 実機で確認する

1. LINE公式アカウントとのトークを開く
2. リッチメニューからLIFFを開く
3. 必須項目を入力し、「LINEへ送信して記録する」を押す
4. トークに「記録しました」と返信されることを確認する
5. Googleスプレッドシートに、育成拠点とメモを含む1行が追加されたことを確認する

入力値に半角アンダースコア（`_`）は使用できません。これはLINEへ送る記録テキストの区切り文字に使うためです。
