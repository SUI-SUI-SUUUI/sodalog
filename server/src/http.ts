import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { GoogleConfig } from "./google";

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Express 4は非同期ハンドラーの例外を拾わないため、ここでnextへ渡す
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

// Google連携の設定が無ければ、そのルーター配下は503を返す
export function requireGoogleConfig(config: GoogleConfig | null): RequestHandler {
  return (_req, res, next) => {
    if (!config) {
      res.status(503).json({ error: "oauth_not_configured" });
      return;
    }
    next();
  };
}

// 検証・管理用のルートは X-Admin-Token ヘッダーの一致を必須にする
export function requireAdmin(config: GoogleConfig | null): RequestHandler {
  return (req, res, next) => {
    const token = req.header("x-admin-token") ?? "";
    if (!config || !safeEqual(token, config.adminToken)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
