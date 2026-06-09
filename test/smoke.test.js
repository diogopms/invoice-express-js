"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const pkg = require("../dist/index.js");

// A representative operation per resource — guards against the generator
// silently dropping or renaming an operation.
const SAMPLE_OPERATIONS = [
  "getClientsJson",
  "getInvoicesJson",
  "postInvoiceReceiptsJson",
  "postByEstimatesTypeJson",
  "getGuidesJson",
  "getSequencesJson",
  "postApiAccountsCreateJson",
  "getApiV3ClientsByClientIdBalanceJson",
  "getItemsJson",
  "getTaxesJson",
  "getApiExportSaftJson",
];

test("package exports a configurable client", () => {
  assert.equal(typeof pkg.client, "object");
  assert.equal(typeof pkg.client.setConfig, "function");
  assert.equal(typeof pkg.client.getConfig, "function");
});

test("package exports an operation for every resource", () => {
  for (const op of SAMPLE_OPERATIONS) {
    assert.equal(typeof pkg[op], "function", `${op} should be a function`);
  }
});

test("setConfig applies the base URL", () => {
  pkg.client.setConfig({ baseUrl: "https://acme.app.invoicexpress.com" });
  assert.equal(
    pkg.client.getConfig().baseUrl,
    "https://acme.app.invoicexpress.com",
  );
});
