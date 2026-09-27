import { test } from "node:test";
import assert from "node:assert/strict";
import { isAppPhoto, isValidFileId, parsePhotoSize, sizedThumbnailUrl } from "./photos";

test("ファイルID: 英数字・ハイフン・アンダースコアのみ", () => {
  assert.equal(isValidFileId("1f3uP2BuR-wOmn6cOJVxjY2LSOExSRLPG"), true);
  assert.equal(isValidFileId("abc"), false);
  assert.equal(isValidFileId("../../etc/passwd"), false);
  assert.equal(isValidFileId("1f3uP2BuR wOmn6c"), false);
});

test("大きさ: 省略は thumb、thumb と full だけ", () => {
  assert.equal(parsePhotoSize(undefined), "thumb");
  assert.equal(parsePhotoSize("thumb"), "thumb");
  assert.equal(parsePhotoSize("full"), "full");
  assert.equal(parsePhotoSize("large"), null);
  assert.equal(parsePhotoSize(["full"]), null);
});

test("そだログの写真か: 種類と保存先の両方が一致するものだけ", () => {
  assert.equal(isAppPhoto({ sodalogKind: "photo", sodalogStorage: "test", recordId: "r" }, "test"), true);
  assert.equal(isAppPhoto({ sodalogKind: "records", sodalogStorage: "test" }, "test"), false);
  assert.equal(isAppPhoto({ sodalogKind: "photo" }, "test"), false);
  assert.equal(isAppPhoto(undefined, "test"), false);
});

test("サムネイルのURL: 末尾の大きさ指定を置き換える", () => {
  assert.equal(sizedThumbnailUrl("https://lh3.googleusercontent.com/abc=s220", 480), "https://lh3.googleusercontent.com/abc=s480");
  assert.equal(sizedThumbnailUrl("https://lh3.googleusercontent.com/abc", 480), "https://lh3.googleusercontent.com/abc=s480");
});
