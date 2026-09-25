/*
 * Google連携の共通処理。
 * OAuth設定の読み込み、保存済みrefresh tokenでの接続、Google APIエラーの安全な要約を扱う。
 */
import { OAuth2Client } from "google-auth-library";
import { readLatestSecret } from "./secrets";

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowedEmail: string;
  adminToken: string;
  projectId: string;
  refreshTokenSecret: string;
  imageFolderId: string;
  gardenLogSpreadsheetId: string;
};

export type StoredRefreshToken = {
  refresh_token: string;
  scope: string;
  obtained_at: string;
};

/**
 * Google連携に必要な環境変数を読む。足りない場合はnullを返し、
 * サーバー全体(LINE Webhook)の起動は止めない。
 */
export function loadGoogleConfig(): GoogleConfig | null {
  const config = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: process.env.OAUTH_REDIRECT_URI ?? "",
    allowedEmail: process.env.ALLOWED_GOOGLE_EMAIL ?? "",
    adminToken: process.env.OAUTH_ADMIN_TOKEN ?? "",
    projectId: process.env.GCP_PROJECT_ID ?? "",
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET_NAME ?? "",
    imageFolderId: process.env.IMAGE_FOLDER_ID ?? "",
    gardenLogSpreadsheetId: process.env.GARDEN_LOG_SPREADSHEET_ID ?? "",
  };

  const required: (keyof GoogleConfig)[] = [
    "clientId",
    "clientSecret",
    "redirectUri",
    "allowedEmail",
    "adminToken",
    "projectId",
    "refreshTokenSecret",
  ];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    console.error("Google config is incomplete; missing:", missing.join(", "));
    return null;
  }
  return config;
}

export function createOAuthClient(config: GoogleConfig): OAuth2Client {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
}

// 7日失効の観測用。取得からの経過日数(小数2桁)
export function tokenAgeDays(stored: StoredRefreshToken): number {
  return Math.round(((Date.now() - Date.parse(stored.obtained_at)) / 86_400_000) * 100) / 100;
}

export type GoogleErrorSummary = { status?: number; reason?: string; message: string };

/**
 * Google APIのエラーから、ログや応答に出しても安全な情報だけを取り出す。
 * エラーオブジェクト全体にはリクエスト設定(client_secret等)が含まれ得るため、
 * そのままログに出さない。
 */
export function describeGoogleError(err: unknown): GoogleErrorSummary {
  const e = err as {
    status?: number;
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: { error?: unknown; error_description?: string } };
  };
  const data = e.response?.data;
  let reason: string | undefined;
  if (typeof data?.error === "string") {
    reason = data.error;
  } else if (data?.error && typeof data.error === "object") {
    const apiError = data.error as { status?: string; errors?: { reason?: string }[] };
    reason = apiError.errors?.[0]?.reason ?? apiError.status;
  }
  return {
    status: e.response?.status ?? e.status ?? (typeof e.code === "number" ? e.code : undefined),
    reason,
    message: data?.error_description ?? e.message ?? String(err),
  };
}

export type GoogleConnection =
  | {
      ok: true;
      client: OAuth2Client;
      stored: StoredRefreshToken;
      scopes: string[];
      accessTokenExpiresAt: string;
    }
  | { ok: false; body: Record<string, unknown> };

/**
 * 保存済みrefresh tokenでGoogle APIに接続できるクライアントを作る。
 * refresh tokenが無い、または失効している場合はその理由を返す。
 */
export async function connectWithStoredToken(config: GoogleConfig): Promise<GoogleConnection> {
  const raw = await readLatestSecret(config.projectId, config.refreshTokenSecret);
  if (!raw) {
    return { ok: false, body: { refreshToken: { status: "not_connected" } } };
  }
  const stored = JSON.parse(raw) as StoredRefreshToken;

  const client = createOAuthClient(config);
  client.setCredentials({ refresh_token: stored.refresh_token });
  try {
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new Error("no access token returned");
    }
    const info = await client.getTokenInfo(token);
    return {
      ok: true,
      client,
      stored,
      scopes: info.scopes,
      accessTokenExpiresAt: new Date(info.expiry_date).toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      body: {
        refreshToken: {
          obtainedAt: stored.obtained_at,
          ageDays: tokenAgeDays(stored),
          grantedScope: stored.scope,
          status: "refresh_failed",
          error: describeGoogleError(err),
        },
      },
    };
  }
}

const API_CLIENT_CACHE_MS = 10 * 60 * 1000;
let cachedApiClient: { client: OAuth2Client; loadedAt: number } | null = null;

/**
 * API用のGoogleクライアントを返す。refresh tokenが未連携ならnull。
 *
 * 毎リクエストでSecret Managerを読まないよう、インスタンス内で一定時間使い回す
 * (アクセストークンの更新はOAuth2Clientが自動で行う)。
 * 再連携でrefresh tokenが新しくなっても、最長この時間で読み直される。
 */
export async function getApiClient(config: GoogleConfig): Promise<OAuth2Client | null> {
  if (cachedApiClient && Date.now() - cachedApiClient.loadedAt < API_CLIENT_CACHE_MS) {
    return cachedApiClient.client;
  }
  const raw = await readLatestSecret(config.projectId, config.refreshTokenSecret);
  if (!raw) {
    cachedApiClient = null;
    return null;
  }
  const stored = JSON.parse(raw) as StoredRefreshToken;
  const client = createOAuthClient(config);
  client.setCredentials({ refresh_token: stored.refresh_token });
  cachedApiClient = { client, loadedAt: Date.now() };
  return client;
}

// refresh tokenの失効・取り消し(invalid_grant)かどうか
export function isGoogleAuthError(err: unknown): boolean {
  const summary = describeGoogleError(err);
  return summary.reason === "invalid_grant" || summary.message.includes("invalid_grant");
}

export async function runCheck<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; result: T } | { ok: false; error: GoogleErrorSummary }> {
  try {
    return { ok: true, result: await fn() };
  } catch (err) {
    return { ok: false, error: describeGoogleError(err) };
  }
}
