/*
 * STEP 4-4a: アルバムの写真の取得(サーバーが中継して画像を返す)。
 *
 * - Driveの共有設定は変えない(制限付きのまま)。外部公開URLも作らない
 * - 返すのは、そだログがその保存先に保存した写真だけ(appProperties で確かめる)
 * - size=thumb は Drive が作るサムネイル(長辺 THUMB_SIZE px)。取れない・まだ無い場合は保存した画像を返す
 * - どちらを返したかは X-Sodalog-Photo-Source ヘッダーで分かる(thumbnail / original)
 */
import type { OAuth2Client } from "google-auth-library";
import { drive } from "@googleapis/drive";
import { describeGoogleError } from "./google";
import type { StorageEnv } from "./storage";

export const THUMB_SIZE = 480;
const THUMB_TIMEOUT_MS = 10_000;

export type PhotoSize = "thumb" | "full";
export type PhotoSource = "thumbnail" | "original";

export class PhotoNotFoundError extends Error {}

// DriveのファイルIDの形(英数字・ハイフン・アンダースコア)
export function isValidFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

export function parsePhotoSize(value: unknown): PhotoSize | null {
  if (value === undefined || value === "thumb") {
    return "thumb";
  }
  return value === "full" ? "full" : null;
}

// そだログがこの保存先に保存した写真か(records.ts の savePhoto で付けた appProperties)
export function isAppPhoto(appProperties: Record<string, string> | null | undefined, env: StorageEnv): boolean {
  return appProperties?.sodalogKind === "photo" && appProperties?.sodalogStorage === env;
}

// サムネイルのURLの末尾の大きさ指定(=s220 など)を、欲しい大きさに変える
export function sizedThumbnailUrl(thumbnailLink: string, size: number): string {
  return /=s\d+$/.test(thumbnailLink) ? thumbnailLink.replace(/=s\d+$/, `=s${size}`) : `${thumbnailLink}=s${size}`;
}

async function fetchThumbnail(
  auth: OAuth2Client,
  thumbnailLink: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const { token } = await auth.getAccessToken();
    if (!token) {
      return null;
    }
    // 共有されていないファイルのサムネイルは、認証付きのリクエストで取得する必要がある
    const response = await fetch(sizedThumbnailUrl(thumbnailLink, THUMB_SIZE), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(THUMB_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      console.warn("Thumbnail unavailable:", response.status);
      return null;
    }
    return { body: Buffer.from(await response.arrayBuffer()), contentType };
  } catch (err) {
    console.warn("Thumbnail fetch failed:", (err as Error).message);
    return null;
  }
}

/**
 * 写真を取得する。そだログの写真でなければ PhotoNotFoundError。
 */
export async function getPhoto(
  auth: OAuth2Client,
  env: StorageEnv,
  fileId: string,
  size: PhotoSize
): Promise<{ body: Buffer; contentType: string; source: PhotoSource }> {
  const driveApi = drive({ version: "v3", auth });

  let meta;
  try {
    ({ data: meta } = await driveApi.files.get({
      fileId,
      fields: "id,mimeType,trashed,appProperties,thumbnailLink",
    }));
  } catch (err) {
    // drive.file では、アプリが作っていないファイルも 404 になる
    if (describeGoogleError(err).status === 404) {
      throw new PhotoNotFoundError(fileId);
    }
    throw err;
  }
  if (meta.trashed || !isAppPhoto(meta.appProperties as Record<string, string> | undefined, env)) {
    throw new PhotoNotFoundError(fileId);
  }

  if (size === "thumb" && meta.thumbnailLink) {
    const thumbnail = await fetchThumbnail(auth, meta.thumbnailLink);
    if (thumbnail) {
      return { ...thumbnail, source: "thumbnail" };
    }
  }

  const { data } = await driveApi.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return {
    body: Buffer.from(data as ArrayBuffer),
    contentType: meta.mimeType || "image/jpeg",
    source: "original",
  };
}
