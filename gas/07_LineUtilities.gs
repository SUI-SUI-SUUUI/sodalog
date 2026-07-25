/**
 * LINEへ返信する
 *
 * quickReplyLabelsを省略した場合は、従来どおり通常のテキスト返信を送る。
 * 文字列配列を渡した場合は、同じ文字列を送信するQuick Replyを付ける。
 *
 * 入力途中の中止案内が本文に含まれる場合は、
 * 「中止する」のQuick Replyを自動的に追加する。
 */
function replyMessage(replyToken, text, quickReplyLabels) {
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

  if (!token || !replyToken) {
    return;
  }

  var message = {
    type: "text",
    text: text,
  };

  var normalizedQuickReplyLabels = addCancelQuickReplyIfNeeded(
    text,
    quickReplyLabels,
  );

  var quickReplyItems = buildMessageQuickReplyItems(
    normalizedQuickReplyLabels,
  );

  if (quickReplyItems.length > 0) {
    message.quickReply = {
      items: quickReplyItems,
    };
  }

  var payload = {
    replyToken: replyToken,
    messages: [message],
  };

  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  debugLog("LINE reply status: " + response.getResponseCode());

  debugLog("LINE reply body: " + response.getContentText());
}

/**
 * 入力途中の案内文がある場合に、
 * 「中止する」のQuick Replyを追加する
 */
function addCancelQuickReplyIfNeeded(text, quickReplyLabels) {
  var labels = Array.isArray(quickReplyLabels)
    ? quickReplyLabels.slice()
    : [];

  var messageText = String(text || "");

  var hasCancelGuide =
    messageText.indexOf(
      "中止する場合は「中止」と送ってください。",
    ) !== -1;

  if (!hasCancelGuide) {
    return labels;
  }

  var alreadyHasCancel = labels.some(function (item) {
    if (typeof item === "string") {
      return item.trim() === "中止する";
    }

    if (!item || typeof item !== "object") {
      return false;
    }

    return (
      String(item.label || "").trim() === "中止する" ||
      String(item.text || "").trim() === "中止する"
    );
  });

  if (!alreadyHasCancel) {
    labels.push("中止する");
  }

  return labels;
}

/**
 * 文字列またはアクション定義からQuick Reply用の項目を作る
 */
function buildMessageQuickReplyItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .slice(0, 13)
    .map(function (item) {
      if (typeof item === "string") {
        var label = item.trim();

        if (!label) {
          return null;
        }

        return {
          type: "action",
          action: {
            type: "message",
            label: label,
            text: label,
          },
        };
      }

      if (!item || typeof item !== "object" || !item.type || !item.label) {
        return null;
      }

      var action = {
        type: item.type,
        label: String(item.label),
      };

      if (item.type === "message") {
        action.text = String(item.text || item.label);
      }

      return {
        type: "action",
        action: action,
      };
    })
    .filter(function (item) {
      return item !== null;
    });
}

/**
 * 写真追加用のQuick Replyアクションを作る
 */
function buildPhotoChoiceQuickReplyActions() {
  return [
    {
      type: "message",
      label: "写真なし・記録完了",
      text: "写真なし・記録完了",
    },
    {
      type: "cameraRoll",
      label: "画像を送る",
    },
    {
      type: "camera",
      label: "カメラ起動・撮影",
    },
    {
      type: "message",
      label: "記録を取り消す",
      text: "記録を取り消す",
    },
  ];
}

/**
 * JSONレスポンスを返す
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * デバッグログを書き出す
 */
function debugLog(message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var sheet = ss.getSheetByName("debug_log");

    if (!sheet) {
      sheet = ss.insertSheet("debug_log");

      sheet.appendRow(["日時", "内容"]);
    }

    sheet.appendRow([new Date(), escapeSpreadsheetFormula(message)]);
  } catch (err) {
    // ログエラーで本処理を止めない
  }
}