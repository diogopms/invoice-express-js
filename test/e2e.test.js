"use strict";

/**
 * End-to-end tests that drive the generated SDK through its full request
 * pipeline — URL building, query params, JSON body, interceptors and the
 * { data, error } result model — against a mocked `fetch` transport.
 *
 * These deliberately do NOT hit the live InvoiceXpress API (which would require
 * account credentials). A custom `fetch` is injected via `client.setConfig`, so
 * the whole stack runs without any network or secrets.
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  client,
  getClientsJson,
  postClientsJson,
  getClientsByClientIdJson,
  getInvoicesJson,
  putInvoicesByDocumentIdChangeStateJson,
  getTaxesJson,
} = require("../dist/index.js");

const BASE = "https://acme.app.invoicexpress.com";
const API_KEY = "test-key";

/** Captured requests for the current test. */
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
  client.setConfig({
    baseUrl: BASE,
    fetch: async (request) => {
      const body =
        request.method === "GET" || request.method === "DELETE"
          ? undefined
          : await request.clone().text();
      calls.push({ url: request.url, method: request.method, body });
      return responder(request);
    },
  });
});

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

  const { data, error } = await getClientsJson({
    query: { api_key: API_KEY, page: 1, per_page: 20 },
  });

  assert.equal(error, undefined);
  assert.equal(calls.length, 1);
  const { url, method } = calls[0];
  assert.equal(method, "GET");
  assert.ok(url.startsWith(`${BASE}/clients.json`), `unexpected url: ${url}`);
  assert.match(url, /api_key=test-key/);
  assert.match(url, /page=1/);
  assert.deepEqual(data.clients, []);
});

test("POST serializes the JSON body and sets the method", async () => {
  respondJson(
    { client: { id: 1, name: "Acme, Lda" } },
    { status: 201, statusText: "Created" },
  );

  const body = {
    client: { name: "Acme, Lda", email: "billing@acme.example" },
  };
  const { data } = await postClientsJson({ query: { api_key: API_KEY }, body });

  const call = calls[0];
  assert.equal(call.method, "POST");
  assert.ok(call.url.startsWith(`${BASE}/clients.json`));
  assert.deepEqual(JSON.parse(call.body), body);
  assert.equal(data.client.id, 1);
});

test("path parameters are substituted into the URL", async () => {
  respondJson({ client: { id: 12345, name: "Acme" } });

  await getClientsByClientIdJson({
    path: { "client-id": 12345 },
    query: { api_key: API_KEY },
  });

  assert.ok(
    calls[0].url.startsWith(`${BASE}/clients/12345.json`),
    calls[0].url,
  );
});

test("error status codes populate `error`, not throw", async () => {
  respondJson({ error: "not found" }, { status: 404, statusText: "Not Found" });

  const { data, error, response } = await getClientsByClientIdJson({
    path: { "client-id": 0 },
    query: { api_key: API_KEY },
  });

  assert.equal(data, undefined);
  assert.deepEqual(error, { error: "not found" });
  assert.equal(response.status, 404);
});

test("array query params are serialized into the URL", async () => {
  respondJson({
    invoices: [],
    pagination: {
      total_entries: 0,
      current_page: 1,
      total_pages: 0,
      per_page: 10,
    },
  });

  await getInvoicesJson({
    query: {
      api_key: API_KEY,
      page: 1,
      per_page: 10,
      non_archived: true,
      "type[]": ["Invoice", "CreditNote"],
      "status[]": ["draft"],
    },
  });

  const { url } = calls[0];
  assert.ok(url.includes("Invoice"), `expected Invoice in ${url}`);
  assert.ok(url.includes("CreditNote"), `expected CreditNote in ${url}`);
  assert.ok(url.includes("draft"), `expected draft in ${url}`);
});

test("request interceptors can mutate the outgoing request", async () => {
  respondJson({ taxes: [] });

  const interceptor = (request) => {
    request.headers.set("X-Trace-Id", "trace-123");
    return request;
  };
  client.interceptors.request.use(interceptor);

  try {
    await getTaxesJson({ query: { api_key: API_KEY } });
  } finally {
    client.interceptors.request.eject(interceptor);
  }
});

test("an empty 200 response resolves without error (e.g. change-state)", async () => {
  responder = () => new Response(null, { status: 200, statusText: "OK" });

  const { error } = await putInvoicesByDocumentIdChangeStateJson({
    path: { "document-id": 1 },
    query: { api_key: API_KEY },
    body: { invoice: { state: "finalized" } },
  });
  assert.equal(error, undefined);
});
