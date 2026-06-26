"use strict";

/**
 * Unit tests for the hand-written interceptor / fetch-decorator helpers
 * (`@diogopms/invoice-express-js/interceptors`). Everything runs against fake
 * fetch implementations and a capturing logger — no network, no secrets.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  createLoggingInterceptors,
  attachLogging,
  composeFetch,
  withLogging,
  withTimeout,
  withRetry,
} = require("../dist/interceptors.js");
const { createClient, createConfig } = require("../dist/client/index.js");

const BASE = "https://acme.app.invoicexpress.com";

/** A Logger that records every call for assertions. */
function captureLogger() {
  const entries = [];
  const record = (level) => (message, meta) =>
    entries.push({ level, message, meta });
  return {
    entries,
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
}

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

// --------------------------------------------------------------------------
// Logging interceptors
// --------------------------------------------------------------------------

test("createLoggingInterceptors logs request and response with timing", () => {
  const logger = captureLogger();
  const { onRequest, onResponse } = createLoggingInterceptors({ logger });

  const request = new Request(`${BASE}/clients.json?api_key=secret`);
  onRequest(request, {});
  onResponse(okResponse(), request, {});

  const [req, res] = logger.entries;
  assert.equal(req.message, "→ request");
  assert.equal(req.meta.method, "GET");
  // api_key is redacted from the logged URL by default.
  assert.match(req.meta.url, /api_key=\*\*\*/);
  assert.doesNotMatch(req.meta.url, /secret/);

  assert.equal(res.message, "← response");
  assert.equal(res.meta.status, 200);
  assert.equal(typeof res.meta.durationMs, "number");
});

test("logging interceptor uses warn for error-status responses", () => {
  const logger = captureLogger();
  const { onRequest, onResponse } = createLoggingInterceptors({ logger });

  const request = new Request(`${BASE}/clients.json`);
  onRequest(request, {});
  onResponse(new Response("nope", { status: 422 }), request, {});

  const res = logger.entries.find((e) => e.level === "warn");
  assert.ok(res, "expected a warn entry for the 422 response");
  assert.equal(res.meta.status, 422);
});

test("onError logs at error level with the message", () => {
  const logger = captureLogger();
  const { onError } = createLoggingInterceptors({ logger });

  const request = new Request(`${BASE}/clients.json`);
  const returned = onError(new Error("boom"), undefined, request, {});

  const err = logger.entries.find((e) => e.level === "error");
  assert.ok(err);
  assert.equal(err.meta.error, "boom");
  // The interceptor must return the (possibly transformed) error unchanged.
  assert.equal(returned instanceof Error && returned.message, "boom");
});

test("attachLogging registers three interceptors and detaches them", () => {
  const logger = captureLogger();
  const client = createClient(createConfig({ baseUrl: BASE }));

  const detach = attachLogging(client, { logger });
  assert.equal(client.interceptors.request.fns.filter(Boolean).length, 1);
  assert.equal(client.interceptors.response.fns.filter(Boolean).length, 1);
  assert.equal(client.interceptors.error.fns.filter(Boolean).length, 1);

  detach();
  assert.equal(client.interceptors.request.fns.filter(Boolean).length, 0);
  assert.equal(client.interceptors.response.fns.filter(Boolean).length, 0);
  assert.equal(client.interceptors.error.fns.filter(Boolean).length, 0);
});

// --------------------------------------------------------------------------
// Fetch decorators
// --------------------------------------------------------------------------

test("composeFetch applies middlewares left-to-right (outermost first)", async () => {
  const order = [];
  const tag = (name) => (next) => async (input, init) => {
    order.push(`${name}:before`);
    const res = await next(input, init);
    order.push(`${name}:after`);
    return res;
  };
  const base = async () => okResponse();

  const fetchFn = composeFetch(base, tag("A"), tag("B"));
  await fetchFn(new Request(`${BASE}/x`));

  assert.deepEqual(order, ["A:before", "B:before", "B:after", "A:after"]);
});

test("withLogging logs success and rethrows on failure", async () => {
  const logger = captureLogger();

  const ok = composeFetch(async () => okResponse(), withLogging(logger));
  await ok(new Request(`${BASE}/ok?api_key=secret`));
  const info = logger.entries.find((e) => e.message === "← fetch");
  assert.equal(info.meta.status, 200);
  assert.match(info.meta.url, /api_key=\*\*\*/);

  const fail = composeFetch(async () => {
    throw new Error("network down");
  }, withLogging(logger));
  await assert.rejects(() => fail(new Request(`${BASE}/x`)), /network down/);
  assert.ok(logger.entries.some((e) => e.message === "✗ fetch failed"));
});

test("withTimeout aborts a slow request", async () => {
  const slow = composeFetch(
    (input) =>
      new Promise((_resolve, reject) => {
        const signal = input.signal;
        signal.addEventListener("abort", () =>
          reject(signal.reason ?? new Error("aborted")),
        );
      }),
    withTimeout(20),
  );

  await assert.rejects(() => slow(new Request(`${BASE}/slow`)));
});

test("withTimeout passes through a fast request untouched", async () => {
  const fast = composeFetch(async () => okResponse(), withTimeout(1000));
  const res = await fast(new Request(`${BASE}/fast`));
  assert.equal(res.status, 200);
});

test("withRetry retries idempotent 5xx then succeeds", async () => {
  let attempts = 0;
  const flaky = composeFetch(
    async () => {
      attempts += 1;
      return attempts < 3 ? new Response("err", { status: 503 }) : okResponse();
    },
    withRetry({ retries: 3, backoff: () => 0 }),
  );

  const res = await flaky(new Request(`${BASE}/get`)); // GET is idempotent
  assert.equal(res.status, 200);
  assert.equal(attempts, 3);
});

test("withRetry does NOT retry a 500 on POST by default", async () => {
  let attempts = 0;
  const post = composeFetch(
    async () => {
      attempts += 1;
      return new Response("err", { status: 500 });
    },
    withRetry({ retries: 3, backoff: () => 0 }),
  );

  const res = await post(
    new Request(`${BASE}/clients.json`, { method: "POST", body: "{}" }),
  );
  assert.equal(res.status, 500);
  assert.equal(attempts, 1);
});

test("withRetry retries 429 regardless of method", async () => {
  let attempts = 0;
  const post = composeFetch(
    async () => {
      attempts += 1;
      return attempts < 2
        ? new Response("slow down", { status: 429 })
        : okResponse();
    },
    withRetry({ retries: 3, backoff: () => 0 }),
  );

  const res = await post(
    new Request(`${BASE}/clients.json`, { method: "POST", body: "{}" }),
  );
  assert.equal(res.status, 200);
  assert.equal(attempts, 2);
});

test("withRetry gives up after exhausting retries and returns the last response", async () => {
  let attempts = 0;
  const always500 = composeFetch(
    async () => {
      attempts += 1;
      return new Response("err", { status: 503 });
    },
    withRetry({ retries: 2, backoff: () => 0 }),
  );

  const res = await always500(new Request(`${BASE}/get`));
  assert.equal(res.status, 503);
  assert.equal(attempts, 3); // 1 initial + 2 retries
});
