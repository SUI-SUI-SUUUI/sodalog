/**
 * 記録用シートを取得する
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);

    sheet.appendRow(HEADER);
  } else {
    ensureGardenLogHeader(sheet);
  }

  return sheet;
}

/**
 * LINE由来の文字列がスプレッドシートの数式として実行されるのを防ぐ
 */
function escapeSpreadsheetFormula(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (/^[=+\-@]/.test(value)) {
    return "'" + value;
  }

  return value;
}

/**
 * 行データ内の文字列を安全にする
 */
function escapeSpreadsheetRow(rowData) {
  return rowData.map(escapeSpreadsheetFormula);
}

/**
 * 既存のgarden_logへ不足している見出しを追加する
 */
function ensureGardenLogHeader(sheet) {
  var userIdHeader = sheet.getRange(1, 10).getDisplayValue();

  var baseHeader = sheet.getRange(1, 11).getDisplayValue();

  if (!userIdHeader) {
    sheet.getRange(1, 10).setValue("LINEユーザーID");
  }

  if (!baseHeader) {
    sheet.getRange(1, 11).setValue("育成拠点");
  }
}

/**
 * セッション用シートを取得する
 */
function getSessionSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName(SESSION_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SESSION_SHEET_NAME);

    sheet.appendRow(SESSION_HEADER);
  } else {
    ensureSessionSheetHeader(sheet);
  }

  return sheet;
}

/**
 * 既存のuser_sessionsへメモ列を追加する
 */
function ensureSessionSheetHeader(sheet) {
  var memoHeader = sheet.getRange(1, 9).getDisplayValue();

  var updatedAtHeader = sheet.getRange(1, 10).getDisplayValue();

  if (memoHeader === "更新日時") {
    sheet.insertColumnBefore(9);
  }

  sheet.getRange(1, 9).setValue("メモ");

  sheet.getRange(1, 10).setValue("更新日時");
}

/**
 * ユーザーのセッションを取得する
 */
function getUserSession(userId) {
  var sheet = getSessionSheet();

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  var values = sheet
    .getRange(2, 1, lastRow - 1, SESSION_HEADER.length)
    .getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) {
      return {
        row: i + 2,
        userId: values[i][0],
        step: values[i][1],
        workDate: values[i][2],
        base: values[i][3],
        place: values[i][4],
        detailPlace: values[i][5],
        plantName: values[i][6],
        workType: values[i][7],
        memo: values[i][8],
        updatedAt: values[i][9],
      };
    }
  }

  return null;
}

/**
 * ユーザーのセッションを保存する
 */
function saveUserSession(userId, sessionData) {
  var sheet = getSessionSheet();

  var existingSession = getUserSession(userId);

  var rowData = escapeSpreadsheetRow([
    userId,
    sessionData.step || "",
    sessionData.workDate || "",
    sessionData.base || "",
    sessionData.place || "",
    sessionData.detailPlace || "",
    sessionData.plantName || "",
    sessionData.workType || "",
    sessionData.memo || "",
    new Date(),
  ]);

  if (existingSession) {
    sheet
      .getRange(existingSession.row, 1, 1, SESSION_HEADER.length)
      .setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

/**
 * ユーザーのセッションを削除する
 */
function deleteUserSession(userId) {
  var sheet = getSessionSheet();

  var existingSession = getUserSession(userId);

  if (!existingSession) {
    return;
  }

  sheet.deleteRow(existingSession.row);
}

/**
 * 新しいセッションを開始する
 */
function startUserSession(userId) {
  saveUserSession(userId, {
    step: "WAITING_DATE",
    workDate: "",
    base: "",
    place: "",
    detailPlace: "",
    plantName: "",
    workType: "",
    memo: "",
  });
}
