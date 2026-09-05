/**
 * 今日の日付
 */
function getTodayText() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy/MM/dd",
  );
}

/**
 * 昨日の日付
 */
function getYesterdayText() {
  var yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);

  return Utilities.formatDate(
    yesterday,
    Session.getScriptTimeZone(),
    "yyyy/MM/dd",
  );
}

/**
 * テキスト入力を検証する
 */
function validateAndParseText(text) {
  if (!text || !String(text).trim()) {
    return {
      isValid: false,
      errorCode: "EMPTY_TEXT",
    };
  }

  var parts = String(text).trim().split("_");

  if (parts.length !== 5 && parts.length !== 7) {
    return {
      isValid: false,
      errorCode: "INVALID_ITEM_COUNT",
    };
  }

  var workDate = parts[0].trim();
  var hasLiffFields = parts.length === 7;
  var base = hasLiffFields ? parts[1].trim() : "";
  var place = hasLiffFields ? parts[2].trim() : parts[1].trim();
  var detailPlace = hasLiffFields ? parts[3].trim() : parts[2].trim();
  var plant = hasLiffFields ? parts[4].trim() : parts[3].trim();
  var task = hasLiffFields ? parts[5].trim() : parts[4].trim();
  var memo = hasLiffFields ? parts[6].trim() : "";

  if (!workDate || !place || !plant || !task) {
    return {
      isValid: false,
      errorCode: "EMPTY_ITEM",
    };
  }

  if (!isValidDateText(workDate)) {
    return {
      isValid: false,
      errorCode: "INVALID_WORK_DATE",
    };
  }

  return {
    isValid: true,
    errorCode: null,
    data: {
      workDate: normalizeDateText(workDate),
      place: place,
      detailPlace: detailPlace,
      plant: plant,
      task: task,
      memo: memo,
      base: base,
    },
  };
}

/**
 * 日付文字列が有効か確認する
 */
function isValidDateText(dateText) {
  if (!dateText) {
    return false;
  }

  var match = String(dateText)
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return false;
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);

  var date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * 日付をYYYY/MM/DD形式へ統一する
 */
function normalizeDateText(dateText) {
  var match = String(dateText)
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return dateText;
  }

  return (
    match[1] +
    "/" +
    ("0" + match[2]).slice(-2) +
    "/" +
    ("0" + match[3]).slice(-2)
  );
}

/**
 * スプレッドシートから読み取った作業日をyyyy/MM/dd形式の文字列にする
 *
 * Google Sheetsは "2026/09/05" のような文字列を書き込んでも
 * 列の書式によっては日付型として保存することがあるため、
 * 読み取り側でDate/文字列どちらでも同じ形式に揃える。
 */
function formatSheetWorkDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy/MM/dd");
  }

  return String(value || "");
}

/**
 * 作業日を利用者向けの日本語表記にする
 * 例：2026年7月22日（水）
 */
function formatWorkDateForDisplay(workDate) {
  if (!workDate) {
    return "";
  }

  var dateText;

  if (
    Object.prototype.toString.call(workDate) === "[object Date]" &&
    !isNaN(workDate.getTime())
  ) {
    dateText = Utilities.formatDate(
      workDate,
      Session.getScriptTimeZone(),
      "yyyy/MM/dd",
    );
  } else {
    dateText = normalizeDateText(workDate);
  }

  var match = String(dateText)
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (!match) {
    return String(workDate);
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day);

  var weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    year +
    "年" +
    month +
    "月" +
    day +
    "日（" +
    weekdayNames[date.getDay()] +
    "）"
  );
}
