/**
 * 園芸記録の番号選択を開始する
 */
function startGardenLogInput(
  userId,
  replyToken
) {
  startUserSession(userId);

  replyMessage(
    replyToken,
    [
      "園芸記録を始めます。",
      "",
      "作業日を選んでください。",
      "",
      "1：今日",
      "2：昨日",
      "3：日付を入力",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n")
  );
}

/**
 * 入力途中の番号や文章を処理する
 */
function handleSessionInput(
  userId,
  replyToken,
  text,
  session
) {
  debugLog("handleSessionInput 開始");
  debugLog(
    "現在の段階: " +
      session.step
  );
  debugLog("入力内容: " + text);

  if (session.step === "WAITING_DATE") {
    handleDateSelection(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CUSTOM_DATE"
  ) {
    handleCustomDateInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (session.step === "WAITING_BASE") {
    handleBaseSelection(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (session.step === "WAITING_PLACE") {
    handlePlaceSelection(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_DETAIL_PLACE"
  ) {
    handleDetailPlaceSelection(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_PLANT_NAME"
  ) {
    handlePlantNameInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_WORK_TYPE"
  ) {
    handleWorkTypeSelection(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CUSTOM_BASE"
  ) {
    handleCustomBaseInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CUSTOM_PLACE"
  ) {
    handleCustomPlaceInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CUSTOM_DETAIL_PLACE"
  ) {
    handleCustomDetailPlaceInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CUSTOM_WORK_TYPE"
  ) {
    handleCustomWorkTypeInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_MEMO_CHOICE"
  ) {
    handleMemoChoice(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_MEMO_TEXT"
  ) {
    handleMemoInput(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  if (
    session.step ===
    "WAITING_CONFIRM"
  ) {
    handleSaveConfirmation(
      userId,
      replyToken,
      text,
      session
    );
    return;
  }

  debugLog(
    "未対応のセッション段階: " +
      session.step
  );

  replyMessage(
    replyToken,
    "入力状態を確認できませんでした。\n" +
      "「中止」と送ったあと、もう一度「記録する」と送ってください。"
  );
}

/**
 * 作業日の番号選択を処理する
 */
function handleDateSelection(
  userId,
  replyToken,
  text,
  session
) {
  if (text === "1") {
    session.workDate = getTodayText();
    session.step = "WAITING_BASE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      buildDateConfirmedAndBaseSelectionMessage(
        session.workDate
      )
    );
    return;
  }

  if (text === "2") {
    session.workDate =
      getYesterdayText();

    session.step = "WAITING_BASE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      buildDateConfirmedAndBaseSelectionMessage(
        session.workDate
      )
    );
    return;
  }

  if (text === "3") {
    session.step =
      "WAITING_CUSTOM_DATE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "作業日を入力してください。",
        "",
        "入力形式：2026/07/13",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  replyMessage(
    replyToken,
    [
      "番号を正しく読み取れませんでした。",
      "",
      "作業日を選んでください。",
      "",
      "1：今日",
      "2：昨日",
      "3：日付を入力",
    ].join("\n")
  );
}

/**
 * 直接入力された作業日を処理する
 */
function handleCustomDateInput(
  userId,
  replyToken,
  text,
  session
) {
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
      ].join("\n")
    );
    return;
  }

  session.workDate =
    normalizeDateText(text);

  session.step = "WAITING_BASE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildDateConfirmedAndBaseSelectionMessage(
      session.workDate
    )
  );
}

/**
 * 日付確定と育成拠点選択を1通にまとめる
 */
function buildDateConfirmedAndBaseSelectionMessage(
  workDate
) {
  return [
    "作業日を「" +
      workDate +
      "」に設定しました。",
    "",
    "育成拠点を選んでください。",
    "",
    "1：自宅",
    "2：その他",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 自由入力された育成拠点を処理する
 */
function handleCustomBaseInput(
  userId,
  replyToken,
  text,
  session
) {
  var baseName =
    validateCustomInputText(
      text,
      "育成拠点",
      replyToken
    );

  if (!baseName) {
    return;
  }

  session.base = baseName;
  session.step = "WAITING_PLACE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildBaseConfirmedAndPlaceSelectionMessage(
      baseName
    )
  );
}

/**
 * 自由入力された場所を処理する
 */
function handleCustomPlaceInput(
  userId,
  replyToken,
  text,
  session
) {
  var placeName =
    validateCustomInputText(
      text,
      "場所",
      replyToken
    );

  if (!placeName) {
    return;
  }

  session.place = placeName;
  session.step =
    "WAITING_DETAIL_PLACE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildPlaceConfirmedAndDetailPlaceSelectionMessage(
      placeName
    )
  );
}

/**
 * 自由入力された詳細場所を処理する
 */
function handleCustomDetailPlaceInput(
  userId,
  replyToken,
  text,
  session
) {
  var detailPlaceName =
    validateCustomInputText(
      text,
      "詳細場所",
      replyToken
    );

  if (!detailPlaceName) {
    return;
  }

  session.detailPlace =
    detailPlaceName;

  session.step =
    "WAITING_PLANT_NAME";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    [
      "詳細場所を「" +
        detailPlaceName +
        "」に設定しました。",
      "",
      "植物名を入力してください。",
      "",
      "例：アジサイ",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n")
  );
}

/**
 * 自由入力された作業内容を処理し、
 * garden_logへ正式保存する
 */
function handleCustomWorkTypeInput(
  userId,
  replyToken,
  text,
  session
) {
  var workType =
    validateCustomInputText(
      text,
      "作業内容",
      replyToken
    );

  if (!workType) {
    return;
  }

  session.workType =
    workType;

  session.step =
    "WAITING_MEMO_CHOICE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildMemoChoiceMessage(
      session.workType
    )
  );
}

/**
 * 自由入力の内容を確認する
 */
function validateCustomInputText(
  text,
  itemName,
  replyToken
) {
  var value =
    String(text || "").trim();

  if (!value) {
    replyMessage(
      replyToken,
      itemName +
        "を読み取れませんでした。\n" +
        "もう一度入力してください。"
    );
    return null;
  }

  if (value.length > 50) {
    replyMessage(
      replyToken,
      itemName +
        "は50文字以内で入力してください。"
    );
    return null;
  }

  return value;
}

/**
 * 育成拠点の番号選択を処理する
 */
function handleBaseSelection(
  userId,
  replyToken,
  text,
  session
) {
  var baseName = "";

  if (text === "1") {
    baseName = "自宅";
  } else if (text === "2") {
    session.step =
      "WAITING_CUSTOM_BASE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "育成拠点を入力してください。",
        "",
        "例：実家、貸し農園、職場",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  } else {
    replyMessage(
      replyToken,
      [
        "番号を正しく読み取れませんでした。",
        "",
        "育成拠点を選んでください。",
        "",
        "1：自宅",
        "2：その他",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  session.base = baseName;
  session.step = "WAITING_PLACE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildBaseConfirmedAndPlaceSelectionMessage(
      baseName
    )
  );
}

/**
 * 育成拠点確定と場所選択を1通にまとめる
 */
function buildBaseConfirmedAndPlaceSelectionMessage(
  baseName
) {
  return [
    "育成拠点を「" +
      baseName +
      "」に設定しました。",
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
function handlePlaceSelection(
  userId,
  replyToken,
  text,
  session
) {
  var placeMap = {
    "1": "庭",
    "2": "ベランダ",
    "3": "室内",
    "4": "畑",
    "5": "その他",
  };

  if (text === "5") {
    session.step =
      "WAITING_CUSTOM_PLACE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "場所を入力してください。",
        "",
        "例：玄関前、駐車場横、屋上",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  var placeName =
    placeMap[text];

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
      ].join("\n")
    );
    return;
  }

  session.place = placeName;
  session.step =
    "WAITING_DETAIL_PLACE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildPlaceConfirmedAndDetailPlaceSelectionMessage(
      placeName
    )
  );
}

/**
 * 場所確定と詳細場所選択を1通にまとめる
 */
function buildPlaceConfirmedAndDetailPlaceSelectionMessage(
  placeName
) {
  return [
    "場所を「" +
      placeName +
      "」に設定しました。",
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
 * 詳細場所の番号選択を処理する
 */
function handleDetailPlaceSelection(
  userId,
  replyToken,
  text,
  session
) {
  var detailPlaceMap = {
    "1": "北側",
    "2": "南側",
    "3": "東側",
    "4": "西側",
    "5": "中央",
    "6": "その他",
  };

  if (text === "6") {
    session.step =
      "WAITING_CUSTOM_DETAIL_PLACE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "詳細場所を入力してください。",
        "",
        "例：東花壇、中央鉢植え、窓際",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  var detailPlaceName =
    detailPlaceMap[text];

  if (!detailPlaceName) {
    replyMessage(
      replyToken,
      [
        "番号を正しく読み取れませんでした。",
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
      ].join("\n")
    );
    return;
  }

  session.detailPlace =
    detailPlaceName;

  session.step =
    "WAITING_PLANT_NAME";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    [
      "詳細場所を「" +
        detailPlaceName +
        "」に設定しました。",
      "",
      "植物名を入力してください。",
      "",
      "例：アジサイ",
      "",
      "中止する場合は「中止」と送ってください。",
    ].join("\n")
  );
}

/**
 * 植物名の入力を処理する
 *
 * 現在は植物名を保存し、
 * 次の作業内容選択へ進む準備をする
 */
function handlePlantNameInput(
  userId,
  replyToken,
  text,
  session
) {
  var plantName =
    String(text || "").trim();

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
      ].join("\n")
    );
    return;
  }

  session.plantName =
    plantName;

  session.step =
    "WAITING_WORK_TYPE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildPlantConfirmedAndWorkTypeSelectionMessage(
      plantName
    )
  );
}

/**
 * 植物名確定と作業内容選択を1通にまとめる
 */
function buildPlantConfirmedAndWorkTypeSelectionMessage(
  plantName
) {
  return [
    "植物名を「" +
      plantName +
      "」に設定しました。",
    "",
    "作業内容を選んでください。",
    "",
    "1：剪定",
    "2：水やり",
    "3：施肥",
    "4：植え付け・植え替え",
    "5：草取り",
    "6：その他",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * 作業内容の番号選択を処理し、
 * garden_logへ正式保存する
 */
function handleWorkTypeSelection(
  userId,
  replyToken,
  text,
  session
) {
  var workTypeMap = {
    "1": "剪定",
    "2": "水やり",
    "3": "施肥",
    "4": "植え付け・植え替え",
    "5": "草取り",
    "6": "その他",
  };

  if (text === "6") {
    session.step =
      "WAITING_CUSTOM_WORK_TYPE";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "作業内容を入力してください。",
        "",
        "例：誘引、支柱立て、病害虫確認",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  var workType =
    workTypeMap[text];

  if (!workType) {
    replyMessage(
      replyToken,
      [
        "番号を正しく読み取れませんでした。",
        "",
        "作業内容を選んでください。",
        "",
        "1：剪定",
        "2：水やり",
        "3：施肥",
        "4：植え付け・植え替え",
        "5：草取り",
        "6：その他",
        "",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  session.workType =
    workType;

  session.step =
    "WAITING_MEMO_CHOICE";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildMemoChoiceMessage(
      session.workType
    )
  );
}

/**
 * 作業内容確定後のメモ選択メッセージを作る
 */
function buildMemoChoiceMessage(
  workType
) {
  return [
    "作業内容を「" +
      workType +
      "」に設定しました。",
    "",
    "メモを入力しますか？",
    "",
    "1：入力する",
    "2：入力しない",
    "",
    "中止する場合は「中止」と送ってください。",
  ].join("\n");
}

/**
 * メモを入力するかどうかの番号選択を処理する
 */
function handleMemoChoice(
  userId,
  replyToken,
  text,
  session
) {
  if (text === "1") {
    session.step =
      "WAITING_MEMO_TEXT";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      [
        "メモを入力してください。",
        "",
        "例：花がらも取り除いた",
        "",
        "200文字以内で入力してください。",
        "中止する場合は「中止」と送ってください。",
      ].join("\n")
    );
    return;
  }

  if (text === "2") {
    session.memo = "";
    session.step =
      "WAITING_CONFIRM";

    saveUserSession(
      userId,
      session
    );

    replyMessage(
      replyToken,
      buildSaveConfirmationMessage(
        session
      )
    );
    return;
  }

  replyMessage(
    replyToken,
    [
      "番号を正しく読み取れませんでした。",
      "",
      "メモを入力しますか？",
      "",
      "1：入力する",
      "2：入力しない",
    ].join("\n")
  );
}

/**
 * 自由入力されたメモを処理する
 */
function handleMemoInput(
  userId,
  replyToken,
  text,
  session
) {
  var memo =
    String(text || "").trim();

  if (!memo) {
    replyMessage(
      replyToken,
      "メモを読み取れませんでした。\n" +
        "もう一度入力してください。"
    );
    return;
  }

  if (memo.length > 200) {
    replyMessage(
      replyToken,
      "メモは200文字以内で入力してください。"
    );
    return;
  }

  session.memo = memo;
  session.step =
    "WAITING_CONFIRM";

  saveUserSession(
    userId,
    session
  );

  replyMessage(
    replyToken,
    buildSaveConfirmationMessage(
      session
    )
  );
}

/**
 * 保存前の確認メッセージを作る
 */
function buildSaveConfirmationMessage(
  session
) {
  return [
    "以下の内容で保存しますか？",
    "",
    "作業日：" +
      session.workDate,
    "育成拠点：" +
      session.base,
    "場所：" +
      session.place,
    "詳細場所：" +
      session.detailPlace,
    "植物名：" +
      session.plantName,
    "作業内容：" +
      session.workType,
    "メモ：" +
      (session.memo || "なし"),
    "",
    "1：保存する",
    "2：中止する",
  ].join("\n");
}

/**
 * 保存確認の番号選択を処理する
 */
function handleSaveConfirmation(
  userId,
  replyToken,
  text,
  session
) {
  if (text === "1") {
    saveGardenLogFromSession(
      userId,
      session
    );

    deleteUserSession(
      userId
    );

    replyMessage(
      replyToken,
      [
        "園芸記録を保存しました。",
        "",
        "作業日：" +
          session.workDate,
        "育成拠点：" +
          session.base,
        "場所：" +
          session.place,
        "詳細場所：" +
          session.detailPlace,
        "植物名：" +
          session.plantName,
        "作業内容：" +
          session.workType,
        "メモ：" +
          (session.memo || "なし"),
        "",
        "続けて画像を送ると、この記録に追加されます。",
      ].join("\n")
    );
    return;
  }

  if (text === "2") {
    deleteUserSession(
      userId
    );

    replyMessage(
      replyToken,
      "園芸記録の保存を中止しました。"
    );
    return;
  }

  replyMessage(
    replyToken,
    [
      "番号を正しく読み取れませんでした。",
      "",
      "1：保存する",
      "2：中止する",
    ].join("\n")
  );
}

/**
 * セッション内容をgarden_logへ保存する
 */
function saveGardenLogFromSession(
  userId,
  session
) {
  var sheet = getSheet();

  sheet.appendRow([
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
  ]);

  debugLog(
    "番号選択式の園芸記録を保存しました: " +
      JSON.stringify({
        workDate:
          session.workDate,
        base:
          session.base,
        place:
          session.place,
        detailPlace:
          session.detailPlace,
        plantName:
          session.plantName,
        workType:
          session.workType,
      })
  );
}
