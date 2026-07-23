/**
 * 園芸記録の番号選択を開始する
 */
function startGardenLogInput(userId, replyToken) {
  startUserSession(userId);

  replyMessage(
    replyToken,
    [
      "園芸記録を始めます。",
      "",
      "作業日を選んでください。",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
    ["今日", "昨日", "日付を入力"],
  );
}

/**
 * 入力途中の番号や文章を処理する
 */
function handleSessionInput(userId, replyToken, text, session) {
  debugLog("handleSessionInput 開始");
  debugLog("現在の段階: " + session.step);
  debugLog("入力内容: " + text);

  if (session.step === "WAITING_DATE") {
    handleDateSelection(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CUSTOM_DATE") {
    handleCustomDateInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_BASE") {
    handleBaseSelection(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_PLACE") {
    handlePlaceSelection(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_DETAIL_PLACE_CHOICE") {
    handleDetailPlaceChoice(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_DETAIL_PLACE") {
    handleDetailPlaceSelection(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_PLANT_NAME") {
    handlePlantNameInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_WORK_TYPE") {
    handleWorkTypeSelection(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CUSTOM_BASE") {
    handleCustomBaseInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CUSTOM_PLACE") {
    handleCustomPlaceInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CUSTOM_DETAIL_PLACE") {
    handleCustomDetailPlaceInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CUSTOM_WORK_TYPE") {
    handleCustomWorkTypeInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_MEMO_CHOICE") {
    handleMemoChoice(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_MEMO_TEXT") {
    handleMemoInput(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_CONFIRM") {
    handleSaveConfirmation(userId, replyToken, text, session);
    return;
  }

  if (session.step === "WAITING_PHOTO_CHOICE") {
    handlePhotoChoice(userId, replyToken, text, session);
    return;
  }

  debugLog("未対応のセッション段階: " + session.step);

  replyMessage(
    replyToken,
    "入力状態を確認できませんでした。\n" +
      "「中止」と送ったあと、もう一度「記録する」と送ってください。",
  );
}

/**
 * 作業日の選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleDateSelection(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "今日" || selectedText === "1") {
    session.workDate = getTodayText();
    session.step = "WAITING_BASE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      buildDateConfirmedAndBaseSelectionMessage(session.workDate),
      ["庭・北側", "庭・南側", "室内", "その他"],
    );
    return;
  }

  if (selectedText === "昨日" || selectedText === "2") {
    session.workDate = getYesterdayText();

    session.step = "WAITING_BASE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      buildDateConfirmedAndBaseSelectionMessage(session.workDate),
      ["庭・北側", "庭・南側", "室内", "その他"],
    );
    return;
  }

  if (selectedText === "日付を入力" || selectedText === "3") {
    session.step = "WAITING_CUSTOM_DATE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "作業日を入力してください。",
        "",
        "入力形式：2026/07/13",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  replyMessage(
    replyToken,
    [
      "作業日を正しく読み取れませんでした。",
      "",
      "下のボタンから選んでください。",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
    ["今日", "昨日", "日付を入力"],
  );
}

/**
 * 直接入力された作業日を処理する
 */
function handleCustomDateInput(userId, replyToken, text, session) {
  if (!isValidDateText(text)) {
    replyMessage(
      replyToken,
      [
        "日付を正しく読み取れませんでした。",
        "",
        "次の形式で入力してください。",
        "例：2026/07/13",
        "",
        "実在する日付を入力してください。",
      ].join("\n"),
    );
    return;
  }

  session.workDate = normalizeDateText(text);

  session.step = "WAITING_BASE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildDateConfirmedAndBaseSelectionMessage(session.workDate),
    ["庭・北側", "庭・南側", "室内", "その他"],
  );
}

/**
 * 日付確定と育成拠点選択を1通にまとめる
 */
function buildDateConfirmedAndBaseSelectionMessage(workDate) {
  return [
    "作業日を「" + formatWorkDateForDisplay(workDate) + "」に設定しました。",
    "",
    "どこで作業しましたか？",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 「その他」で自由入力された作業場所を処理する
 */
function handleCustomBaseInput(userId, replyToken, text, session) {
  var workPlaceName = validateCustomInputText(text, "作業場所", replyToken);

  if (!workPlaceName) {
    return;
  }

  session.base = workPlaceName;
  session.place = "";
  session.step = "WAITING_DETAIL_PLACE_CHOICE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildWorkPlaceConfirmedAndDetailSelectionMessage(workPlaceName),
    ["はい", "いいえ"],
  );
}

/**
 * 自由入力された場所を処理する
 */
function handleCustomPlaceInput(userId, replyToken, text, session) {
  var placeName = validateCustomInputText(text, "場所", replyToken);

  if (!placeName) {
    return;
  }

  session.place = placeName;
  session.step = "WAITING_DETAIL_PLACE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildPlaceConfirmedAndDetailPlaceSelectionMessage(placeName),
  );
}

/**
 * 自由入力された詳細場所を処理する
 */
function handleCustomDetailPlaceInput(userId, replyToken, text, session) {
  var detailPlaceName = validateCustomInputText(text, "詳細場所", replyToken);

  if (!detailPlaceName) {
    return;
  }

  session.detailPlace = detailPlaceName;

  session.step = "WAITING_PLANT_NAME";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    [
      "詳細場所を「" + detailPlaceName + "」に設定しました。",
      "",
      "植物名を入力してください。",
      "",
      "例：アジサイ",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
  );
}

/**
 * 自由入力された作業内容を処理し、
 * garden_logへ正式保存する
 */
function handleCustomWorkTypeInput(userId, replyToken, text, session) {
  var workType = validateCustomInputText(text, "作業内容", replyToken);

  if (!workType) {
    return;
  }

  session.workType = workType;

  session.step = "WAITING_MEMO_CHOICE";

  saveUserSession(userId, session);

  replyMessage(replyToken, buildMemoChoiceMessage(session.workType), [
    "メモなし",
    "入力する",
  ]);
}

/**
 * 自由入力の内容を確認する
 */
function validateCustomInputText(text, itemName, replyToken) {
  var value = String(text || "").trim();

  if (!value) {
    replyMessage(
      replyToken,
      itemName + "を読み取れませんでした。\n" + "もう一度入力してください。",
    );
    return null;
  }

  if (value.length > 50) {
    replyMessage(replyToken, itemName + "は50文字以内で入力してください。");
    return null;
  }

  return value;
}

/**
 * 作業場所のQuick Reply選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleBaseSelection(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "庭・北側" || selectedText === "1") {
    session.base = "庭";
    session.place = "北側";
  } else if (selectedText === "庭・南側" || selectedText === "2") {
    session.base = "庭";
    session.place = "南側";
  } else if (selectedText === "室内" || selectedText === "3") {
    session.base = "室内";
    session.place = "";
  } else if (selectedText === "その他" || selectedText === "4") {
    session.step = "WAITING_CUSTOM_BASE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "作業場所を入力してください。",
        "",
        "例：ベランダ、玄関前、貸し農園",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  } else {
    replyMessage(
      replyToken,
      [
        "作業場所を正しく読み取れませんでした。",
        "",
        "下のボタンから選んでください。",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
      ["庭・北側", "庭・南側", "室内", "その他"],
    );
    return;
  }

  session.step = "WAITING_DETAIL_PLACE_CHOICE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildWorkPlaceConfirmedAndDetailSelectionMessage(
      buildSelectedWorkPlaceDisplay(session),
    ),
    ["はい", "いいえ"],
  );
}

/**
 * 選択済みの作業場所を表示用文字列にする
 */
function buildSelectedWorkPlaceDisplay(session) {
  if (session.base === "庭" && session.place) {
    return session.base + "・" + session.place;
  }

  return session.base || session.place || "未指定";
}

/**
 * 作業場所確定と詳細場所選択を1通にまとめる
 */
function buildWorkPlaceConfirmedAndDetailSelectionMessage(workPlaceName) {
  return [
    "作業場所を「" + workPlaceName + "」に設定しました。",
    "",
    "さらに詳しい場所を記録しますか？",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 育成拠点確定と場所選択を1通にまとめる
 */
function buildBaseConfirmedAndPlaceSelectionMessage(baseName) {
  return [
    "育成拠点を「" + baseName + "」に設定しました。",
    "",
    "場所を選んでください。",
    "",
    "1：庭",
    "2：ベランダ",
    "3：室内",
    "4：畑",
    "5：その他",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 場所の番号選択を処理する
 */
function handlePlaceSelection(userId, replyToken, text, session) {
  var placeMap = {
    1: "庭",
    2: "ベランダ",
    3: "室内",
    4: "畑",
    5: "その他",
  };

  if (text === "5") {
    session.step = "WAITING_CUSTOM_PLACE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "場所を入力してください。",
        "",
        "例：玄関前、駐車場横、屋上",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  var placeName = placeMap[text];

  if (!placeName) {
    replyMessage(
      replyToken,
      [
        "番号を正しく読み取れませんでした。",
        "",
        "場所を選んでください。",
        "",
        "1：庭",
        "2：ベランダ",
        "3：室内",
        "4：畑",
        "5：その他",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  session.place = placeName;
  session.step = "WAITING_DETAIL_PLACE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildPlaceConfirmedAndDetailPlaceSelectionMessage(placeName),
  );
}

/**
 * 場所確定と詳細場所選択を1通にまとめる
 */
function buildPlaceConfirmedAndDetailPlaceSelectionMessage(placeName) {
  return [
    "場所を「" + placeName + "」に設定しました。",
    "",
    "詳細場所を選んでください。",
    "",
    "1：北側",
    "2：南側",
    "3：東側",
    "4：西側",
    "5：中央",
    "6：その他",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 詳しい場所を記録するかどうかを処理する
 */
function handleDetailPlaceChoice(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "はい" || selectedText === "1") {
    session.step = "WAITING_DETAIL_PLACE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "詳しい場所を選んでください。",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
      ["中央", "東側", "西側", "直接入力"],
    );
    return;
  }

  if (selectedText === "いいえ" || selectedText === "2") {
    session.detailPlace = "";
    session.step = "WAITING_PLANT_NAME";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "詳しい場所は記録せずに進みます。",
        "",
        "植物名を入力してください。",
        "",
        "例：アジサイ",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  replyMessage(
    replyToken,
    [
      "選択内容を正しく読み取れませんでした。",
      "",
      "下のボタンから選んでください。",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
    ["はい", "いいえ"],
  );
}

/**
 * 詳細場所のQuick Reply選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleDetailPlaceSelection(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();
  var detailPlaceName = "";

  if (selectedText === "中央" || selectedText === "1") {
    detailPlaceName = "中央";
  } else if (selectedText === "東側" || selectedText === "2") {
    detailPlaceName = "東側";
  } else if (selectedText === "西側" || selectedText === "3") {
    detailPlaceName = "西側";
  } else if (selectedText === "直接入力" || selectedText === "4") {
    session.step = "WAITING_CUSTOM_DETAIL_PLACE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "詳しい場所を入力してください。",
        "",
        "例：花壇、窓際、フェンス沿い",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  } else {
    replyMessage(
      replyToken,
      [
        "詳しい場所を正しく読み取れませんでした。",
        "",
        "下のボタンから選んでください。",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
      ["中央", "東側", "西側", "直接入力"],
    );
    return;
  }

  session.detailPlace = detailPlaceName;
  session.step = "WAITING_PLANT_NAME";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    [
      "詳細場所を「" + detailPlaceName + "」に設定しました。",
      "",
      "植物名を入力してください。",
      "",
      "例：アジサイ",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
  );
}

/**
 * 植物名の入力を処理する
 *
 * 現在は植物名を保存し、
 * 次の作業内容選択へ進む準備をする
 */
function handlePlantNameInput(userId, replyToken, text, session) {
  var plantName = String(text || "").trim();

  if (!plantName) {
    replyMessage(
      replyToken,
      [
        "植物名を読み取れませんでした。",
        "",
        "植物名を入力してください。",
        "例：アジサイ",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  session.plantName = plantName;

  session.step = "WAITING_WORK_TYPE";

  saveUserSession(userId, session);

  replyMessage(
    replyToken,
    buildPlantConfirmedAndWorkTypeSelectionMessage(plantName),
    ["水やり", "肥料", "収穫", "剪定", "草取り", "植え付け", "その他"],
  );
}

/**
 * 植物名確定と作業内容選択を1通にまとめる
 */
function buildPlantConfirmedAndWorkTypeSelectionMessage(plantName) {
  return [
    "植物名を「" + plantName + "」に設定しました。",
    "",
    "作業内容を選んでください。",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 作業内容のQuick Reply選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleWorkTypeSelection(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  var workTypeMap = {
    水やり: "水やり",
    肥料: "肥料",
    収穫: "収穫",
    剪定: "剪定",
    草取り: "草取り",
    植え付け: "植え付け",
    1: "水やり",
    2: "肥料",
    3: "収穫",
    4: "剪定",
    5: "草取り",
    6: "植え付け",
  };

  if (selectedText === "その他" || selectedText === "7") {
    session.step = "WAITING_CUSTOM_WORK_TYPE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "作業内容を入力してください。",
        "",
        "例：誘引、支柱立て、病害虫確認",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  var workType = workTypeMap[selectedText];

  if (!workType) {
    replyMessage(
      replyToken,
      [
        "作業内容を正しく読み取れませんでした。",
        "",
        "下のボタンから選んでください。",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
      ["水やり", "肥料", "収穫", "剪定", "草取り", "植え付け", "その他"],
    );
    return;
  }

  session.workType = workType;
  session.step = "WAITING_MEMO_CHOICE";

  saveUserSession(userId, session);

  replyMessage(replyToken, buildMemoChoiceMessage(session.workType), [
    "メモなし",
    "入力する",
  ]);
}

/**
 * 作業内容確定後のメモ選択メッセージを作る
 */
function buildMemoChoiceMessage(workType) {
  return [
    "作業内容を「" + workType + "」に設定しました。",
    "",
    "メモを追加しますか？",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * メモを追加するかどうかのQuick Reply選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleMemoChoice(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "入力する" || selectedText === "1") {
    session.step = "WAITING_MEMO_TEXT";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "メモを入力してください。",
        "",
        "例：花がらも取り除いた",
        "",
        "200文字以内で入力してください。",
        "中止する場合は「中止」と送ってください。",
      ].join("\n"),
    );
    return;
  }

  if (selectedText === "メモなし" || selectedText === "2") {
    session.memo = "";
    session.step = "WAITING_CONFIRM";

    saveUserSession(userId, session);

    replyMessage(replyToken, buildSaveConfirmationMessage(session), [
      "保存する",
      "中止する",
    ]);
    return;
  }

  replyMessage(
    replyToken,
    [
      "メモの選択を正しく読み取れませんでした。",
      "",
      "下のボタンから選んでください。",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n"),
    ["メモなし", "入力する"],
  );
}

/**
 * 自由入力されたメモを処理する
 */
function handleMemoInput(userId, replyToken, text, session) {
  var memo = String(text || "").trim();

  if (!memo) {
    replyMessage(
      replyToken,
      "メモを読み取れませんでした。\n" + "もう一度入力してください。",
    );
    return;
  }

  if (memo.length > 200) {
    replyMessage(replyToken, "メモは200文字以内で入力してください。");
    return;
  }

  session.memo = memo;
  session.step = "WAITING_CONFIRM";

  saveUserSession(userId, session);

  replyMessage(replyToken, buildSaveConfirmationMessage(session), [
    "保存する",
    "中止する",
  ]);
}

/**
 * 保存前の確認メッセージを作る
 */
function buildSaveConfirmationMessage(session) {
  return [
    "以下の内容で保存しますか？",
    "",
    "作業日：" + formatWorkDateForDisplay(session.workDate),
    "育成拠点：" + session.base,
    "場所：" + session.place,
    "詳細場所：" + session.detailPlace,
    "植物名：" + session.plantName,
    "作業内容：" + session.workType,
    "メモ：" + (session.memo || "なし"),
  ].join("\n");
}

/**
 * 保存確認のQuick Reply選択を処理する
 *
 * Quick Replyの文字列に加えて、従来の番号入力も受け付ける。
 */
function handleSaveConfirmation(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "保存する" || selectedText === "1") {
    session.savedRow = saveGardenLogFromSession(userId, session);
    session.step = "WAITING_PHOTO_CHOICE";

    saveUserSession(userId, session);

    replyMessage(
      replyToken,
      [
        "園芸記録を保存しました。",
        "",
        "写真を追加しますか？",
        "",
        "写真を追加しない場合は「写真なし・記録完了」を選んでください。",
      ].join("\n"),
      buildPhotoChoiceQuickReplyActions(),
    );
    return;
  }

  if (selectedText === "中止する" || selectedText === "2") {
    deleteUserSession(userId);

    replyMessage(replyToken, "園芸記録の保存を中止しました。");
    return;
  }

  replyMessage(
    replyToken,
    [
      "保存確認を正しく読み取れませんでした。",
      "",
      "下のボタンから選んでください。",
    ].join("\n"),
    ["保存する", "中止する"],
  );
}

/**
 * 写真追加の選択を処理する
 */
function handlePhotoChoice(userId, replyToken, text, session) {
  var selectedText = String(text || "").trim();

  if (selectedText === "写真なし・記録完了") {
    deleteUserSession(userId);

    replyMessage(replyToken, "写真なしで園芸記録を完了しました。");
    return;
  }

  if (selectedText === "記録を取り消す") {
    var deleted = deleteSavedGardenLogRow(userId, session.savedRow);

    deleteUserSession(userId);

    if (deleted) {
      replyMessage(replyToken, "保存した園芸記録を取り消しました。");
    } else {
      replyMessage(
        replyToken,
        "取り消す園芸記録を確認できませんでした。スプレッドシートをご確認ください。",
      );
    }
    return;
  }

  replyMessage(
    replyToken,
    [
      "写真の追加方法を下のボタンから選んでください。",
      "",
      "写真を追加しない場合は「写真なし・記録完了」を選んでください。",
    ].join("\n"),
    buildPhotoChoiceQuickReplyActions(),
  );
}

/**
 * 保存直後の園芸記録を取り消す
 */
function deleteSavedGardenLogRow(userId, row) {
  var targetRow = Number(row);

  if (!targetRow || targetRow < 2) {
    return false;
  }

  var sheet = getSheet();

  if (targetRow > sheet.getLastRow()) {
    return false;
  }

  var recordUserId = sheet.getRange(targetRow, 10).getDisplayValue();
  var imageUrl = sheet.getRange(targetRow, 8).getValue();

  if (String(recordUserId) !== String(userId) || imageUrl) {
    return false;
  }

  sheet.deleteRow(targetRow);
  return true;
}

/**
 * セッション内容をgarden_logへ保存する
 */
function saveGardenLogFromSession(userId, session) {
  var sheet = getSheet();

  sheet.appendRow(
    escapeSpreadsheetRow([
      new Date(),
      session.workDate,
      session.place,
      session.detailPlace,
      session.plantName,
      session.workType,
      session.memo || "",
      "",
      "",
      userId,
      session.base,
    ]),
  );

  var savedRow = sheet.getLastRow();

  debugLog(
    "番号選択式の園芸記録を保存しました: " +
      JSON.stringify({
        row: savedRow,
        workDate: session.workDate,
        base: session.base,
        place: session.place,
        detailPlace: session.detailPlace,
        plantName: session.plantName,
        workType: session.workType,
      }),
  );

  return savedRow;
}
