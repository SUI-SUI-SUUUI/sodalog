/*
 * LIFFのIDトークンによる本人確認。
 *
 * クライアントが送ってくるユーザーIDは信用せず、IDトークンをLINEの検証APIで確かめて
 * ユーザーを特定する。現在は開発者本人のみ許可する(複数ユーザー対応はB-2で扱う)。
 */
import { createHash } from "node:crypto";
import type { RequestHandler } from "express";

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const VERIFY_TIMEOUT_MS = 5000;
// 同じ画面表示中の連続リクエストでLINEへ毎回問い合わせないよう、検証結果を短時間だけ覚える
const CACHE_MAX_MS = 5 * 60 * 1000;

type VerifiedToken = { sub: string; expiresAt: number };

const verifiedCache = new Map<string, VerifiedToken>();

export class LiffTokenError extends Error {
  constructor(
    public readonly kind: "invalid" | "unavailable",
    message: string
  ) {
    super(message);
  }
}

function cacheKey(idToken: string): string {
  return createHash("sha256").update(idToken).digest("base64url");
}

function pruneCache(now: number): void {
  for (const [key, value] of verifiedCache) {
    if (value.expiresAt <= now) {
      verifiedCache.delete(key);
    }
  }
}

/**
 * IDトークンを検証し、LINEユーザーID(sub)を返す。
 * トークンが不正・期限切れなら kind="invalid"、LINE側に問い合わせられなければ kind="unavailable"。
 */
export async function verifyLiffIdToken(idToken: string, channelId: string): Promise<string> {
  const now = Date.now();
  const key = cacheKey(idToken);
  const cached = verifiedCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.sub;
  }

  let response: globalThis.Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LiffTokenError("unavailable", `LINE verify request failed: ${(err as Error).message}`);
  }

  if (response.status >= 500) {
    throw new LiffTokenError("unavailable", `LINE verify returned ${response.status}`);
  }
  if (response.status !== 200) {
    // 期限切れ・署名不正・別チャネルのトークンなど(本文にトークンは含まれない)
    const body = (await response.json().catch(() => ({}))) as { error_description?: string };
    throw new LiffTokenError("invalid", body.error_description ?? `status ${response.status}`);
  }

  const data = (await response.json()) as { sub?: string; aud?: string; exp?: number };
  if (!data.sub || String(data.aud) !== channelId) {
    throw new LiffTokenError("invalid", "unexpected verify response");
  }

  const tokenExpiresAt = typeof data.exp === "number" ? data.exp * 1000 : now;
  const expiresAt = Math.min(tokenExpiresAt, now + CACHE_MAX_MS);
  if (expiresAt > now) {
    pruneCache(now);
    verifiedCache.set(key, { sub: data.sub, expiresAt });
  }
  return data.sub;
}

/**
 * Authorization: Bearer <LIFFのIDトークン> を検証し、許可ユーザーだけを通す。
 * 通過したら res.locals.lineUserId に検証済みのユーザーIDを入れる。
 */
export function requireLiffUser(channelId: string, allowedUserId: string): RequestHandler {
  return (req, res, next) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") ?? "");
    if (!match) {
      res.status(401).json({ error: "missing_id_token" });
      return;
    }

    verifyLiffIdToken(match[1].trim(), channelId)
      .then((userId) => {
        if (userId !== allowedUserId) {
          res.status(403).json({ error: "forbidden_user" });
          return;
        }
        res.locals.lineUserId = userId;
        next();
      })
      .catch((err: unknown) => {
        if (err instanceof LiffTokenError && err.kind === "invalid") {
          res.status(401).json({ error: "invalid_id_token" });
          return;
        }
        console.error("LIFF token verification unavailable:", (err as Error).message);
        res.status(502).json({ error: "id_token_verification_unavailable" });
      });
  };
}
