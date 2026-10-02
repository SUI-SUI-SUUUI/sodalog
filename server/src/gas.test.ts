import { test } from "node:test";
import assert from "node:assert/strict";
import { callGasSync, GasCallError, type GasConfig } from "./gas";

const config: GasConfig = { url: "https://script.example/exec", sharedSecret: "secret" };

function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond(init ?? {});
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("共有シークレット・action・payloadをPOSTし、応答のJSONを返す", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json({ ok: true, action: "ping" }));
  const result = await callGasSync("ping", { a: 1 }, config, { fetchImpl });

  assert.deepEqual(result, { ok: true, action: "ping" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, config.url);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    sharedSecret: "secret",
    action: "ping",
    payload: { a: 1 },
  });
});

test("LINE Webhookの転送と区別できるよう、eventsは送らない", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json({ ok: true }));
  await callGasSync("ping", {}, config, { fetchImpl });
  assert.equal("events" in JSON.parse(String(calls[0].init.body)), false);
});

test("設定が無ければ gas_not_configured(GASは呼ばない)", async () => {
  const { fetchImpl, calls } = fakeFetch(() => json({ ok: true }));
  await assert.rejects(callGasSync("ping", {}, null, { fetchImpl }), { code: "gas_not_configured" });
  assert.equal(calls.length, 0);
});

test("共有シークレット不一致時のGASの応答({status:\"ok\"})は gas_rejected", async () => {
  const { fetchImpl } = fakeFetch(() => json({ status: "ok" }));
  await assert.rejects(callGasSync("ping", {}, config, { fetchImpl }), { code: "gas_rejected" });
});

test("ok:false は gas_rejected で、GASのエラー内容をメッセージに含める", async () => {
  const { fetchImpl } = fakeFetch(() => json({ ok: false, error: "unknown_action" }));
  await assert.rejects(callGasSync("nope", {}, config, { fetchImpl }), (err: unknown) => {
    assert.ok(err instanceof GasCallError);
    assert.equal(err.code, "gas_rejected");
    assert.match(err.message, /unknown_action/);
    return true;
  });
});

test("HTTPエラーは gas_http_error", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("error", { status: 500 }));
  await assert.rejects(callGasSync("ping", {}, config, { fetchImpl }), { code: "gas_http_error" });
});

test("JSONでない応答(GASのエラーページなど)は gas_invalid_response", async () => {
  const { fetchImpl } = fakeFetch(() => new Response("<html>error</html>", { status: 200 }));
  await assert.rejects(callGasSync("ping", {}, config, { fetchImpl }), { code: "gas_invalid_response" });
});

test("時間切れは gas_timeout", async () => {
  const { fetchImpl } = fakeFetch(
    (init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })
  );
  await assert.rejects(callGasSync("ping", {}, config, { fetchImpl, timeoutMs: 20 }), { code: "gas_timeout" });
});
