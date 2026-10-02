/*
 * Cloud Run → GAS の同期呼び出し(STEP 4-5)。
 *
 * - LINE Webhookの転送(index.ts の forwardEventsToGas、応答を待たない)とは別に、
 *   GASの応答を待って結果を受け取る
 * - 送り先・共有シークレットは forwardEventsToGas と同じ GAS_WEBHOOK_URL / GAS_SHARED_SECRET を使う
 * - GASの doPost は body.action があるときだけこの経路として扱い、body.events の処理には入らない
 */
import { Router } from "express";
import type { GoogleConfig } from "./google";
import { asyncHandler, requireAdmin, requireGoogleConfig } from "./http";

// GASは起動直後に数秒かかることがあるため、余裕を持たせる
const DEFAULT_TIMEOUT_MS = 25_000;

export type GasConfig = {
  url: string;
  sharedSecret: string;
};

export class GasCallError extends Error {
  constructor(
    readonly code:
      | "gas_not_configured"
      | "gas_timeout"
      | "gas_http_error"
      | "gas_invalid_response"
      | "gas_rejected",
    message: string
  ) {
    super(message);
    this.name = "GasCallError";
  }
}

export function loadGasConfig(): GasConfig | null {
  const url = process.env.GAS_WEBHOOK_URL ?? "";
  const sharedSecret = process.env.GAS_SHARED_SECRET ?? "";
  if (!url || !sharedSecret) {
    return null;
  }
  return { url, sharedSecret };
}

type CallOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * GASの doPost に action を送り、応答のJSONを返す。
 * 応答が { ok: true, ... } でなければ GasCallError を投げる
 * (共有シークレットが合わない場合、GASは { status: "ok" } だけを返すため、これも失敗として扱う)。
 */
export async function callGasSync<T extends Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
  config: GasConfig | null,
  options: CallOptions = {}
): Promise<T> {
  if (!config) {
    throw new GasCallError("gas_not_configured", "GAS_WEBHOOK_URL or GAS_SHARED_SECRET is not set");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    // GASのWeb Appは302でリダイレクトして結果を返す。fetchはPOSTの302をGETで追うので、そのまま結果が読める
    response = await fetchImpl(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedSecret: config.sharedSecret, action, payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new GasCallError("gas_timeout", `GAS call timed out: action=${action}`);
    }
    throw err;
  }

  if (!response.ok) {
    throw new GasCallError("gas_http_error", `GAS call failed: action=${action}, status=${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GasCallError("gas_invalid_response", `GAS response is not JSON: action=${action}`);
  }
  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new GasCallError(
      "gas_rejected",
      `GAS rejected the call: action=${action}${typeof error === "string" ? `, error=${error}` : ""}`
    );
  }
  return body as T;
}

/** 検証用: GET /admin/gas/ping(X-Admin-Token 必須)で、GASとの同期呼び出しを確かめる */
export function createGasRouter(googleConfig: GoogleConfig | null): Router {
  const router = Router();
  router.use(requireGoogleConfig(googleConfig), requireAdmin(googleConfig));

  router.get(
    "/ping",
    asyncHandler(async (_req, res) => {
      const startedAt = Date.now();
      try {
        const result = await callGasSync("ping", {}, loadGasConfig());
        const elapsedMs = Date.now() - startedAt;
        console.log("GAS sync call: action=ping, elapsedMs=" + elapsedMs);
        res.json({ ...result, elapsedMs });
      } catch (err) {
        if (err instanceof GasCallError) {
          console.error("GAS sync call failed:", err.code, err.message);
          res.status(err.code === "gas_not_configured" ? 503 : 502).json({ ok: false, error: err.code });
          return;
        }
        throw err;
      }
    })
  );

  return router;
}
