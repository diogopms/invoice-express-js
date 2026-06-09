"use strict";

/**
 * End-to-end tests that drive the generated client through its full request
 * pipeline — URL building, query params, JSON body, interceptors and error
 * mapping — against a mocked `fetch` transport.
 *
 * Note: these deliberately do NOT hit the live InvoiceXpress API (which would
 * require account credentials). They stub `globalThis.fetch` so the whole
 * client stack runs without any network or secrets.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { InvoiceExpressClient, ApiError } = require("../dist/index.js");

const BASE = "https://acme.app.invoicexpress.com";
const API_KEY = "test-key";

const realFetch = globalThis.fetch;

/** Captured `fetch(url, init)` invocations for the current test. */
let calls;
/** Builds the Response the mock returns; replaced per scenario via `respondJson`. */
let responder;

function respondJson(body, init = {}) {
  responder = () =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      statusText: init.statusText ?? "OK",
      headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
  calls = [];
  respondJson({});
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return responder(url, init);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const newClient = () => new InvoiceExpressClient({ BASE });

test("GET builds the URL with the path and query params", async () => {
  respondJson({
    clients: [],
    pagination: {
      total_entries: 0,
      current_page: 1,
      total_pages: 0,
      per_page: 20,
    },
  });

  const res = await newClient().clients.getClientsJson({
    apiKey: API_KEY,
    page: 1,
    perPage: 20,
  });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(init.method, "GET");
  assert.ok(url.startsWith(`${BASE}/clients.json`), `unexpected url: ${url}`);
  assert.match(url, /api_key=test-key/);
  assert.match(url, /page=1/);
  assert.deepEqual(res.clients, []);
});

test("POST serializes the JSON body and sets the method", async () => {
  respondJson(
    { client: { id: 1, name: "Acme, Lda" } },
    { status: 201, statusText: "Created" },
  );

  const payload = {
    client: { name: "Acme, Lda", email: "billing@acme.example" },
  };
  const res = await newClient().clients.postClientsJson({
    apiKey: API_KEY,
    requestBody: payload,
  });

  const { url, init } = calls[0];
  assert.equal(init.method, "POST");
  assert.ok(url.startsWith(`${BASE}/clients.json`));
  assert.deepEqual(JSON.parse(init.body), payload);
  assert.equal(res.client.id, 1);
});

test("path parameters are substituted into the URL", async () => {
  respondJson({ client: { id: 12345, name: "Acme" } });

  await newClient().clients.getClientsByClientIdJson({
    apiKey: API_KEY,
    clientId: 12345,
  });

  assert.ok(
    calls[0].url.startsWith(`${BASE}/clients/12345.json`),
    calls[0].url,
  );
});

test("error status codes reject with an ApiError carrying the status", async () => {
  respondJson({ error: "not found" }, { status: 404, statusText: "Not Found" });

  await assert.rejects(
    () =>
      newClient().clients.getClientsByClientIdJson({
        apiKey: API_KEY,
        clientId: 0,
      }),
    (err) => {
      assert.ok(err instanceof ApiError, "expected an ApiError");
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test("request interceptors can mutate the outgoing request", async () => {
  respondJson({ taxes: [] });

  const client = newClient();
  client.request.config.interceptors.request.use((req) => {
    req.headers = { ...req.headers, "X-Trace-Id": "trace-123" };
    return req;
  });

  await client.taxes.getTaxesJson({ apiKey: API_KEY });

  const { headers } = calls[0].init;
  const traceId =
    headers instanceof Headers
      ? headers.get("X-Trace-Id")
      : headers["X-Trace-Id"];
  assert.equal(traceId, "trace-123");
});
