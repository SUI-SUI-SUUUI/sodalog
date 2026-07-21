/**
 * そだログの使い方をLINEへ返信する
 */
function replyHelpMessage(
  replyToken
) {
  replyMessage(
    replyToken,
    [
      "そだログの使い方",
      "",
      "【園芸記録を追加】",
      "「記録する」と送ってください。",
      "",
      "【最近の記録を見る】",
      "「最近の記録」と送ってください。",
      "",
      "【入力を中止】",
      "入力途中で「中止」と送ってください。",
      "",
      "【画像を追加】",
      "記録を保存した直後に画像を送ってください。",
      "",
      "【従来の自由入力】",
      "次の形式でも記録できます。",
      "",
      "作業日_場所_詳細場所_植物名_作業内容",
      "",
      "例：",
      "2026/07/13_北側_中央_つつじ_剪定",
    ].join("\n")
  );
}

/**
 * 指定ユーザーの最近の園芸記録を取得する
 */
function getRecentGardenLogs(
  userId,
  limit
) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var maxCount =
    Number(limit) || 3;

  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        HEADER.length
      )
      .getDisplayValues();

  var results = [];

  for (
    var i = values.length - 1;
    i >= 0;
    i--
  ) {
    var row = values[i];

    var recordUserId =
      row[9];

    if (
      String(recordUserId) !==
      String(userId)
    ) {
      continue;
    }

    results.push({
      workDate: row[1],
      place: row[2],
      detailPlace: row[3],
      plantName: row[4],
      workType: row[5],
      memo: row[6],
      imageUrl: row[7],
      folderUrl: row[8],
      base: row[10],
    });

    if (
      results.length >= maxCount
    ) {
      break;
    }
  }

  return results;
}

/**
 * 最近の園芸記録をLINEへ返信する
 */
function replyRecentGardenLogs(
  userId,
  replyToken
) {
  var records =
    getRecentGardenLogs(
      userId,
      3
    );

  if (records.length === 0) {
    replyMessage(
      replyToken,
      [
        "まだ園芸記録がありません。",
        "",
        "「記録する」と送ると、",
        "番号を選びながら記録できます。",
      ].join("\n")
    );
    return;
  }

  var lines = [
    "最近の園芸記録です。",
  ];

  records.forEach(
    function (record, index) {
      lines.push("");
      lines.push(
        (index + 1) +
          "件目"
      );

      lines.push(
        "作業日：" +
          (record.workDate || "未設定")
      );

      lines.push(
        "育成拠点：" +
          (record.base || "未設定")
      );

      lines.push(
        "場所：" +
          (record.place || "未設定") +
          " / " +
          (record.detailPlace || "未設定")
      );

      lines.push(
        "植物名：" +
          (record.plantName || "未設定")
      );

      lines.push(
        "作業内容：" +
          (record.workType || "未設定")
      );

      lines.push(
        "メモ：" +
          (record.memo || "なし")
      );

      lines.push(
        "画像：" +
          (
            record.imageUrl
              ? "あり"
              : "なし"
          )
      );
    }
  );

  replyMessage(
    replyToken,
    lines.join("\n")
  );
}
