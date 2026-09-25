/*
 * LIFFから呼ぶAPI(STEP 4-2: 場所の一覧取得・登録)。
 *
 * - 本人確認: Authorization: Bearer <LIFFのIDトークン>(クライアントのユーザーIDは信用しない)
 * - CORS: GitHub PagesのLIFF配信元だけを許可する
 * - 保存先: STORAGE_ENV で指定した新しい保存先(現時点ではテスト用のみ)
 */
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { describeGoogleError, getApiClient, isGoogleAuthError, type GoogleConfig } from "./google";
import { asyncHandler } from "./http";
import { requireLiffUser } from "./liffAuth";
import { createLocation, listLocations, normalizeLocationName } from "./locations";
import { isStorageEnv, resolveStorage, StorageError, type StorageEnv } from "./storage";

type ApiConfig = {
  lineLoginChannelId: string;
  allowedLineUserId: string;
  storageEnv: StorageEnv;
  corsOrigin: string;
};

/**
 * API用の環境変数を読む。足りない・不正な場合はnullを返し、/api/* は503になる。
 * STORAGE_ENV は、本番用の保存先を作るまで "test" だけを受け付ける。
 */
function loadApiConfig(): ApiConfig | null {
  const lineLoginChannelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  const allowedLineUserId = process.env.ALLOWED_LINE_USER_ID ?? "";
  const storageEnv = process.env.STORAGE_ENV ?? "";
  const corsOrigin = process.env.CORS_ORIGIN ?? "";

  const missing = Object.entries({
    LINE_LOGIN_CHANNEL_ID: lineLoginChannelId,
    ALLOWED_LINE_USER_ID: allowedLineUserId,
    STORAGE_ENV: storageEnv,
    CORS_ORIGIN: corsOrigin,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    console.error("API config is incomplete; missing:", missing.join(", "));
    return null;
  }
  if (!isStorageEnv(storageEnv)) {
    console.error("API config: STORAGE_ENV must be one of the allowed storage environments");
    return null;
  }
  return { lineLoginChannelId, allowedLineUserId, storageEnv, corsOrigin };
}

function cors(allowedOrigin: string | undefined): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    if (allowedOrigin && req.header("origin") === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function createApiRouter(googleConfig: GoogleConfig | null): Router {
  const router = Router();
  const apiConfig = loadApiConfig();

  router.use(cors(apiConfig?.corsOrigin));
  router.use((_req, res, next) => {
    if (!googleConfig || !apiConfig) {
      res.status(503).json({ error: "api_not_configured" });
      return;
    }
    next();
  });
  // 本人確認はボディの解析より先に行い、未認証のリクエストのボディは読まない
  if (apiConfig) {
    router.use(requireLiffUser(apiConfig.lineLoginChannelId, apiConfig.allowedLineUserId));
  }
  // Webhookの署名検証は生のボディが必要なため、JSONの解析は/api配下だけで行う
  router.use(express.json({ limit: "8kb" }));

  async function getStorageContext(res: Response) {
    const client = await getApiClient(googleConfig!);
    if (!client) {
      res.status(503).json({ error: "google_not_connected" });
      return null;
    }
    const storage = await resolveStorage(client, apiConfig!.storageEnv);
    return { client, spreadsheetId: storage.spreadsheetId };
  }

  router.get(
    "/locations",
    asyncHandler(async (_req, res) => {
      const context = await getStorageContext(res);
      if (!context) {
        return;
      }
      const locations = await listLocations(context.client, context.spreadsheetId);
      res.json({ locations });
    })
  );

  router.post(
    "/locations",
    asyncHandler(async (req, res) => {
      const validation = normalizeLocationName((req.body as { name?: unknown } | undefined)?.name);
      if (!validation.ok) {
        res.status(400).json({ error: "invalid_name", reason: validation.error });
        return;
      }
      const context = await getStorageContext(res);
      if (!context) {
        return;
      }
      const result = await createLocation(context.client, context.spreadsheetId, validation.name);
      res.status(result.created ? 201 : 200).json(result);
    })
  );

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    if (type === "entity.too.large") {
      res.status(413).json({ error: "payload_too_large" });
      return;
    }
    if (err instanceof StorageError) {
      res.status(409).json({ error: err.code });
      return;
    }
    if (isGoogleAuthError(err)) {
      console.error("API Google auth error:", describeGoogleError(err));
      res.status(502).json({ error: "google_auth_failed" });
      return;
    }
    console.error("API route error:", describeGoogleError(err));
    res.status(500).json({ error: "internal_error" });
  });

  return router;
}
