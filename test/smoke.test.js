"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const pkg = require("../dist/index.js");

const BASE = "https://acme.app.invoicexpress.com";

const RESOURCE_SERVICES = [
  "clients",
  "invoices",
  "invoicesReceipts",
  "estimates",
  "guides",
  "sequences",
  "items",
  "taxes",
  "saft",
];

// A representative method per service — guards against the generator silently
// dropping or renaming an operation.
const SAMPLE_METHODS = {
  clients: "getClientsJson",
  invoices: "getInvoicesJson",
  invoicesReceipts: "postInvoiceReceiptsJson",
  estimates: "postByEstimatesTypeJson",
  guides: "getGuidesJson",
  sequences: "getSequencesJson",
  items: "getItemsJson",
  taxes: "getTaxesJson",
  saft: "getApiExportSaftJson",
};

test("package exports the client and ApiError", () => {
  assert.equal(typeof pkg.InvoiceExpressClient, "function");
  assert.equal(typeof pkg.ApiError, "function");
});

test("client exposes every resource service", () => {
  const client = new pkg.InvoiceExpressClient({ BASE });
  for (const service of RESOURCE_SERVICES) {
    assert.ok(client[service], `missing service: ${service}`);
  }
});

test("each service exposes its representative operation", () => {
  const client = new pkg.InvoiceExpressClient({ BASE });
  for (const [service, method] of Object.entries(SAMPLE_METHODS)) {
    assert.equal(
      typeof client[service][method],
      "function",
      `${service}.${method} should be a function`,
    );
  }
});

test("constructor applies the provided configuration", () => {
  const client = new pkg.InvoiceExpressClient({ BASE });
  assert.equal(client.request.config.BASE, BASE);
});
