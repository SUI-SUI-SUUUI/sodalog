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

    var events = body.events || [];

    debugLog("events数: " + events.length);

    events.forEach(function (event) {
      try {
        var eventType = event && event.type ? event.type : "unknown";

        var messageType =
          event && event.message && event.message.type
            ? event.message.type
            : "none";

        debugLog(
          "イベント受信: type=" + eventType + ", messageType=" + messageType,
        );

        /*
         * 開発期間中は、許可したLINEユーザーだけを処理する。
         * 許可されていないユーザーのイベントは、
         * 返信・保存・画像取得などを行わず終了する。
         */
        if (!isAllowedLineUser(event)) {
          debugLog("未許可ユーザーのイベントを拒否しました");
          return;
        }

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

  /*
   * LINE DevelopersのWebhook検証では
   * eventsが空の場合がある。
   * その場合も正常レスポンスを返す。
   */
  return createJsonResponse({
    status: "ok",
  });
}

/**
 * 開発期間中に許可されたLINEユーザーか確認する
 *
 * スクリプトプロパティ：
 * ALLOWED_LINE_USER_ID
 */
function isAllowedLineUser(event) {
  var allowedUserId = PropertiesService.getScriptProperties().getProperty(
    "ALLOWED_LINE_USER_ID",
  );

  if (!allowedUserId) {
    debugLog("エラー: ALLOWED_LINE_USER_ID が未設定です");
    return false;
  }

  var sourceUserId =
    event && event.source && event.source.userId
      ? String(event.source.userId)
      : "";

  if (!sourceUserId) {
    debugLog("送信元ユーザーIDを取得できません");
    return false;
  }

  return sourceUserId === String(allowedUserId).trim();
}

/**
 * ブラウザ確認用
 */
function doGet(e) {
  return ContentService.createTextOutput("そだログ Webhook is running.");
}

/**
 * テキストメッセージを処理する
 */
function handleTextMessage(event) {
  var text = String(event.message.text || "").trim();

  var replyToken = event.replyToken;

  var userId = event.source && event.source.userId ? event.source.userId : "";

  debugLog("handleTextMessage 開始");

  /*
   * メッセージ本文やユーザーID全体を
   * 通常ログへ残さない。
   */
  debugLog("受信テキスト文字数: " + text.length);

  if (!userId) {
    replyMessage(
      replyToken,
      "ユーザー情報を取得できませんでした。\n" + "もう一度お試しください。",
    );
    return;
  }

  if (text === "中止" || text === "キャンセル") {
    deleteUserSession(userId);

    replyMessage(replyToken, "園芸記録の入力を中止しました。");
    return;
  }

  if (text === "記録する" || text === "記録" || text === "園芸記録") {
    startGardenLogInput(userId, replyToken);
    return;
  }

  if (text === "最近の記録" || text === "最近" || text === "履歴") {
    replyRecentGardenLogs(userId, replyToken);
    return;
  }

  if (text === "使い方" || text === "ヘルプ" || text === "メニュー") {
    replyHelpMessage(replyToken);
    return;
  }

  var session = getUserSession(userId);

  if (session) {
    handleSessionInput(userId, replyToken, text, session);
    return;
  }

  var validationResult = validateAndParseText(text);

  if (!validationResult.isValid) {
    debugLog("入力形式エラー: " + validationResult.errorCode);

    replyMessage(
      replyToken,
      [
        "番号を選びながら記録する場合は、",
        "「記録する」と送ってください。",
        "",
        "最近の記録を見る場合は、",
        "「最近の記録」と送ってください。",
        "",
        "操作方法を見る場合は、",
        "「使い方」と送ってください。",
        "",
        "これまでどおり、次の形式でも記録できます。",
        "",
        "作業日_場所_詳細場所_植物名_作業内容",
        "",
        "入力例：",
        "2026/07/13_北側_中央_つつじ_剪定",
      ].join("\n"),
    );
    return;
  }

  var parsed = validationResult.data;

  var sheet = getSheet();

  sheet.appendRow(
    escapeSpreadsheetRow([
      new Date(),
      parsed.workDate,
      parsed.place,
      parsed.detailPlace,
      parsed.plant,
      parsed.task,
      "",
      "",
      "",
      userId,
      "",
    ]),
  );

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
