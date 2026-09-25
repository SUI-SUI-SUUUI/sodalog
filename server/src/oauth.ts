/*
 * STEP3: Google OAuth検証用のルート。
 *
 * 開発者本人のGoogleアカウントを連携してrefresh tokenをSecret Managerに保存し、
 * drive.fileスコープで既存データ(garden_log・写真フォルダ)に届くか、
 * 新規作成したファイルへ書き込めるか、refresh tokenが何日で失効するかを確かめる。
 * 記録保存APIではないため、既存データへの書き込みは一切行わない。
 */
import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { CodeChallengeMethod } from "google-auth-library";
import { drive } from "@googleapis/drive";
import { sheets } from "@googleapis/sheets";
import { addSecretVersion } from "./secrets";
import {
  connectWithStoredToken,
  createOAuthClient,
  describeGoogleError,
  runCheck,
  tokenAgeDays,
  type GoogleConfig,
  type StoredRefreshToken,
} from "./google";
import { asyncHandler, requireAdmin, requireGoogleConfig, safeEqual } from "./http";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", DRIVE_FILE_SCOPE];

const STATE_COOKIE = "sodalog_oauth";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

const TEST_FOLDER_NAME = "sodalog-oauth-test";
const TEST_SHEET_NAME = "sodalog-oauth-test-sheet";
const TEST_APP_PROPERTY = "sodalogOauthTest";

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendPage(res: Response, status: number, title: string, lines: string[]): void {
  const body = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
  res
    .status(status)
    .type("html")
    .send(
      `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escapeHtml(title)}</title></head>` +
        `<body style="font-family:sans-serif;padding:16px;line-height:1.6">` +
        `<h1 style="font-size:20px">${escapeHtml(title)}</h1>\n${body}</body></html>`
    );
}

export function createOAuthRouter(config: GoogleConfig | null): Router {
  const router = Router();
  router.use(requireGoogleConfig(config));

  router.get(
    "/start",
    asyncHandler(async (_req, res) => {
      const cfg = config!;
      const client = createOAuthClient(cfg);
      const state = randomBytes(32).toString("hex");
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

      // stateは16進数で「.」を含まないため、最初の「.」で区切って復元できる
      res.cookie(STATE_COOKIE, `${state}.${codeVerifier}`, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/oauth",
        maxAge: STATE_COOKIE_MAX_AGE_MS,
      });

      const url = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        login_hint: cfg.allowedEmail,
        include_granted_scopes: false,
      });
      res.redirect(url);
    })
  );

  router.get(
    "/callback",
    asyncHandler(async (req, res) => {
      const cfg = config!;
      const cookie = readCookie(req, STATE_COOKIE);
      res.clearCookie(STATE_COOKIE, { path: "/oauth" });

      if (typeof req.query.error === "string") {
        sendPage(res, 400, "Google連携が完了しませんでした", [`理由: ${req.query.error}`]);
        return;
      }

      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const separator = cookie ? cookie.indexOf(".") : -1;
      if (!code || !cookie || separator < 0) {
        sendPage(res, 400, "Google連携をやり直してください", [
          "連携の開始情報が見つからないか、有効期限(10分)が切れています。",
        ]);
        return;
      }
      const expectedState = cookie.slice(0, separator);
      const codeVerifier = cookie.slice(separator + 1);
      if (!safeEqual(state, expectedState)) {
        sendPage(res, 400, "Google連携をやり直してください", ["stateが一致しません。"]);
        return;
      }

      const client = createOAuthClient(cfg);
      let tokens;
      try {
        ({ tokens } = await client.getToken({ code, codeVerifier }));
      } catch (err) {
        console.error("OAuth token exchange failed:", describeGoogleError(err));
        sendPage(res, 400, "Google連携に失敗しました", ["トークンの取得に失敗しました。"]);
        return;
      }

      if (!tokens.id_token) {
        sendPage(res, 400, "Google連携に失敗しました", ["IDトークンが返されませんでした。"]);
        return;
      }
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: cfg.clientId,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.email ||
        !payload.email_verified ||
        payload.email.toLowerCase() !== cfg.allowedEmail.toLowerCase()
      ) {
        console.error("OAuth callback rejected: account is not allowed");
        sendPage(res, 403, "このアカウントは連携できません", [
          "許可されたGoogleアカウントでログインしてください。",
        ]);
        return;
      }

      const grantedScope = tokens.scope ?? "";
      if (!grantedScope.split(" ").includes(DRIVE_FILE_SCOPE)) {
        sendPage(res, 400, "Google Driveへのアクセスが許可されていません", [
          "同意画面で「Google ドライブ」の項目にチェックを入れて、もう一度連携してください。",
          `許可されたスコープ: ${grantedScope}`,
        ]);
        return;
      }

      if (!tokens.refresh_token) {
        sendPage(res, 400, "Google連携に失敗しました", ["refresh tokenが返されませんでした。"]);
        return;
      }

      const stored: StoredRefreshToken = {
        refresh_token: tokens.refresh_token,
        scope: grantedScope,
        obtained_at: new Date().toISOString(),
      };
      const version = await addSecretVersion(
        cfg.projectId,
        cfg.refreshTokenSecret,
        JSON.stringify(stored)
      );

      console.log("OAuth connected:", { secretVersion: version, scope: grantedScope });
      sendPage(res, 200, "Google連携が完了しました", [
        `取得時刻: ${stored.obtained_at}`,
        `許可されたスコープ: ${grantedScope}`,
        `保存先: ${cfg.refreshTokenSecret} のバージョン ${version}`,
        "この画面は閉じてかまいません。",
      ]);
    })
  );

  // 既存データへのアクセス可否を読み取りだけで確かめる
  router.get(
    "/debug/check",
    requireAdmin(config),
    asyncHandler(async (_req, res) => {
      const cfg = config!;
      const checkedAt = new Date().toISOString();
      const connection = await connectWithStoredToken(cfg);
      if (!connection.ok) {
        res.json({ checkedAt, ...connection.body });
        return;
      }

      const { client, stored } = connection;
      const driveApi = drive({ version: "v3", auth: client });
      const sheetsApi = sheets({ version: "v4", auth: client });
      const fileFields = "id,name,mimeType,capabilities(canAddChildren,canEdit)";

      const imageFolder = cfg.imageFolderId
        ? await runCheck(async () => {
            const { data } = await driveApi.files.get({ fileId: cfg.imageFolderId, fields: fileFields });
            return data;
          })
        : { ok: false, error: { message: "IMAGE_FOLDER_ID is not set" } };

      const gardenLogFile = cfg.gardenLogSpreadsheetId
        ? await runCheck(async () => {
            const { data } = await driveApi.files.get({
              fileId: cfg.gardenLogSpreadsheetId,
              fields: fileFields,
            });
            return data;
          })
        : { ok: false, error: { message: "GARDEN_LOG_SPREADSHEET_ID is not set" } };

      // 見出し行だけを読む(記録の中身は読まない)
      const gardenLogHeader = cfg.gardenLogSpreadsheetId
        ? await runCheck(async () => {
            const { data } = await sheetsApi.spreadsheets.values.get({
              spreadsheetId: cfg.gardenLogSpreadsheetId,
              range: "garden_log!A1:K1",
            });
            return { header: data.values?.[0] ?? [] };
          })
        : { ok: false, error: { message: "GARDEN_LOG_SPREADSHEET_ID is not set" } };

      res.json({
        checkedAt,
        refreshToken: {
          status: "ok",
          obtainedAt: stored.obtained_at,
          ageDays: tokenAgeDays(stored),
          grantedScope: stored.scope,
          accessTokenScopes: connection.scopes,
          accessTokenExpiresAt: connection.accessTokenExpiresAt,
        },
        imageFolder,
        gardenLogFile,
        gardenLogHeader,
      });
    })
  );

  // アプリが新規作成したテスト用フォルダ・スプレッドシートにだけ書き込む
  router.post(
    "/debug/write-test",
    requireAdmin(config),
    asyncHandler(async (_req, res) => {
      const connection = await connectWithStoredToken(config!);
      if (!connection.ok) {
        res.json(connection.body);
        return;
      }

      const driveApi = drive({ version: "v3", auth: connection.client });
      const sheetsApi = sheets({ version: "v4", auth: connection.client });

      async function findOrCreate(
        marker: string,
        name: string,
        mimeType: string,
        parents?: string[]
      ): Promise<{ id: string; created: boolean }> {
        const { data } = await driveApi.files.list({
          q:
            `appProperties has { key='${TEST_APP_PROPERTY}' and value='${marker}' } ` +
            `and mimeType='${mimeType}' and trashed=false`,
          fields: "files(id)",
          pageSize: 1,
        });
        const existing = data.files?.[0]?.id;
        if (existing) {
          return { id: existing, created: false };
        }
        const created = await driveApi.files.create({
          requestBody: { name, mimeType, parents, appProperties: { [TEST_APP_PROPERTY]: marker } },
          fields: "id",
        });
        return { id: created.data.id ?? "", created: true };
      }

      const folder = await runCheck(() =>
        findOrCreate("folder", TEST_FOLDER_NAME, "application/vnd.google-apps.folder")
      );
      if (!folder.ok) {
        res.json({ folder });
        return;
      }

      const spreadsheet = await runCheck(() =>
        findOrCreate("sheet", TEST_SHEET_NAME, "application/vnd.google-apps.spreadsheet", [
          folder.result.id,
        ])
      );
      if (!spreadsheet.ok) {
        res.json({ folder, spreadsheet });
        return;
      }

      const append = await runCheck(async () => {
        const { data } = await sheetsApi.spreadsheets.values.append({
          spreadsheetId: spreadsheet.result.id,
          range: "A1",
          valueInputOption: "RAW",
          requestBody: { values: [[new Date().toISOString(), "oauth write test"]] },
        });
        return { updatedRange: data.updates?.updatedRange };
      });

      const readBack = await runCheck(async () => {
        const { data } = await sheetsApi.spreadsheets.values.get({
          spreadsheetId: spreadsheet.result.id,
          range: "A:B",
        });
        return { rowCount: data.values?.length ?? 0 };
      });

      res.json({ folder, spreadsheet, append, readBack });
    })
  );

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("OAuth route error:", describeGoogleError(err));
    res.status(500).json({ error: "internal_error" });
  });

  return router;
}
