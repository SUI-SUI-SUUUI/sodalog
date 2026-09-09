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

  if (parts.length !== 5 && parts.length !== 6 && parts.length !== 7) {
    return {
      isValid: false,
      errorCode: "INVALID_ITEM_COUNT",
    };
  }

  /*
   * 5項目：旧形式(育成拠点・メモなし)
   * 6項目：現行LIFF形式(育成拠点なし、メモあり。育成拠点は「自宅」固定)
   * 7項目：旧LIFF形式(育成拠点・メモあり)
   */
  var hasBase = parts.length === 7;
  var hasMemo = parts.length === 6 || parts.length === 7;

  var workDate = parts[0].trim();
  var base = hasBase ? parts[1].trim() : "自宅";
  var place = hasBase ? parts[2].trim() : parts[1].trim();
  var detailPlace = hasBase ? parts[3].trim() : parts[2].trim();
  var plant = hasBase ? parts[4].trim() : parts[3].trim();
  var taskText = hasBase ? parts[5].trim() : parts[4].trim();
  var memo = hasMemo ? (hasBase ? parts[6].trim() : parts[5].trim()) : "";

  /*
   * STEP 9で場所以外を任意項目にしたため、必須なのは作業日と場所だけ。
   * 植物名・作業内容・メモが全部空の記録(写真だけ残す、など)も許可する。
   */
  if (!workDate || !place) {
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
      task: parseTaskField(taskText),
      memo: memo,
      base: base,
    },
  };
}

/**
 * 作業内容の文字列をタグ配列にする
 *
 * 現行LIFFはJSON配列("["水やり","草取り"]")で送ってくるが、
 * 手入力のテキストコマンドや旧LIFF形式は単一の文字列("剪定")のまま
 * 送られてくるため、どちらも配列として扱えるようにする。
 *
 * @param {string} taskText 作業内容の生テキスト
 * @return {Array<string>} 作業内容のタグ配列
 */
function parseTaskField(taskText) {
  if (!taskText) {
    return [];
  }

  try {
    var parsed = JSON.parse(taskText);

    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(function (value) {
        return value;
      });
    }
  } catch (error) {
    // JSON配列でなければ、単一の作業内容の文字列として扱う
  }

  return [String(taskText)];
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
