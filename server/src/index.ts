import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import { middleware as lineMiddleware, SignatureValidationFailed } from "@line/bot-sdk";
import { loadGoogleConfig } from "./google";
import { createOAuthRouter } from "./oauth";
import { createStorageRouter } from "./storage";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

const channelSecret = process.env.LINE_CHANNEL_SECRET;
if (!channelSecret) {
  throw new Error("LINE_CHANNEL_SECRET is not set");
}

const gasWebhookUrl = process.env.GAS_WEBHOOK_URL;
const gasSharedSecret = process.env.GAS_SHARED_SECRET;

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "sodalog-server" });
});

app.post(
  "/webhook/line",
  lineMiddleware({ channelSecret }),
  (req, res) => {
    console.log("LINE webhook events:", JSON.stringify(req.body.events));

    // LINEへは先に200を返し、GASへの転送は待たない(タイムアウト・リトライ防止)
    res.status(200).send("OK");

    forwardEventsToGas(req.body.events).catch((err) => {
      console.error("GAS forward failed:", err);
    });
  }
);

async function forwardEventsToGas(events: unknown): Promise<void> {
  if (!gasWebhookUrl || !gasSharedSecret) {
    console.error(
      "GAS_WEBHOOK_URL or GAS_SHARED_SECRET is not set; skipping forward to GAS"
    );
    return;
  }

  const response = await fetch(gasWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharedSecret: gasSharedSecret, events }),
  });

  console.log("GAS forward status:", response.status);
}

// Google連携(STEP3 OAuth検証・STEP4 保存先セットアップ)。
// 設定が無くても各ルートが503を返すだけで、Webhookには影響しない
const googleConfig = loadGoogleConfig();
app.use("/oauth", createOAuthRouter(googleConfig));
app.use("/admin/storage", createStorageRouter(googleConfig));

const lineErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SignatureValidationFailed) {
    res.status(401).send("signature validation failed");
    return;
  }
  next(err);
};
app.use(lineErrorHandler);

app.listen(port, () => {
  console.log(`sodalog-server listening on port ${port}`);
});
