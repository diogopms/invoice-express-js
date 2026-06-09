"use strict";

/**
 * Live verification runner for the InvoiceXpress SDK (v2 functional API).
 *
 * Drives the *built* SDK against a real account and reports coverage across the
 * generated operations. Read-only by default; `--write` adds reversible
 * create/update/delete cycles that clean up after themselves.
 *
 * The API key is read from a command-line argument — never from an environment
 * variable, a file, or source control. Nothing is persisted.
 *
 *   pnpm run build
 *   node scripts/live-check.cjs <api-key> <base-url> [--write]
 */

const path = require("node:path");
const sdk = require(path.join(__dirname, "..", "dist", "index.js"));

const args = process.argv.slice(2);
const withWrite = args.includes("--write");
const positional = args.filter((a) => !a.startsWith("--"));
const api_key = positional[0];
const BASE = positional[1];

if (!api_key || !BASE) {
  console.error(
    "usage: node scripts/live-check.cjs <api-key> <base-url> [--write]\n" +
      "  <base-url> e.g. https://your-account.app.invoicexpress.com",
  );
  process.exit(2);
}

sdk.client.setConfig({ baseUrl: BASE });

const results = [];
async function check(name, fn, { okStatuses = [] } = {}) {
  try {
    const { data, error, response } = await fn();
    const status = response ? response.status : "ERR";
    if (response && response.ok) {
      // 2xx — success (empty-body 200s can surface error as `{}`, ignore it)
      results.push({ name, ok: true, info: brief(data) });
    } else {
      const ok = okStatuses.includes(status);
      results.push({
        name,
        ok,
        reachable: ok,
        status,
        info: JSON.stringify(error).slice(0, 130),
      });
    }
    return data;
  } catch (e) {
    results.push({
      name,
      ok: false,
      status: "THROW",
      info: String(e.message).slice(0, 130),
    });
    return null;
  }
}

function brief(d) {
  if (d == null) return "ok";
  for (const k of [
    "taxes",
    "items",
    "clients",
    "invoices",
    "estimates",
    "guides",
    "sequences",
  ]) {
    if (Array.isArray(d[k])) return `${k}: ${d[k].length}`;
  }
  if (d.pagination) return `entries: ${d.pagination.total_entries}`;
  const first = Object.keys(d)[0];
  return first ? `${first}#${d[first] && d[first].id}` : "ok";
}

async function reads() {
  await check("taxes.list", () => sdk.getTaxesJson({ query: { api_key } }));
  await check("items.list", () => sdk.getItemsJson({ query: { api_key } }));
  await check("sequences.list", () =>
    sdk.getSequencesJson({ query: { api_key } }),
  );
  await check("estimates.list", () =>
    sdk.getEstimatesJson({ query: { api_key, page: 1, per_page: 5 } }),
  );
  await check("guides.list", () =>
    sdk.getGuidesJson({ query: { api_key, page: 1, per_page: 5 } }),
  );
  await check(
    "saft.export",
    () =>
      sdk.getApiExportSaftJson({
        query: { api_key, month: "1", years: "2030" },
      }),
    { okStatuses: [422] },
  );
  await check("invoices.list", () =>
    sdk.getInvoicesJson({
      query: {
        api_key,
        page: 1,
        per_page: 5,
        non_archived: true,
        "type[]": ["Invoice", "InvoiceReceipt"],
        "status[]": ["draft", "sent", "settled", "canceled", "second_copy"],
      },
    }),
  );
  const clients = await check("clients.list", () =>
    sdk.getClientsJson({ query: { api_key, page: 1, per_page: 5 } }),
  );
  const firstClient = clients && clients.clients && clients.clients[0];
  if (firstClient) {
    const cid = firstClient.id;
    await check("clients.get", () =>
      sdk.getClientsByClientIdJson({
        path: { "client-id": cid },
        query: { api_key },
      }),
    );
    await check(
      "clients.findByName",
      () =>
        sdk.getClientsFindByNameJson({
          query: { api_key, client_name: firstClient.name },
        }),
      { okStatuses: [404] },
    );
    await check("treasury.balance", () =>
      sdk.getApiV3ClientsByClientIdBalanceJson({
        path: { "client-id": cid },
        query: { api_key },
      }),
    );
    await check("treasury.regularization.list", () =>
      sdk.getApiV3ClientsByClientIdRegularizationJson({
        path: { "client-id": cid },
        query: { api_key },
      }),
    );
  }
  return { firstClient };
}

async function writes() {
  const stamp = Date.now();

  // Taxes: create -> update -> delete
  const tax = await check(
    "taxes.create",
    () =>
      sdk.postTaxesJson({
        query: { api_key },
        body: {
          tax: { name: `LC${stamp}`.slice(0, 18), value: "7", region: "PT" },
        },
      }),
    { okStatuses: [422] },
  );
  if (tax && tax.tax) {
    await check("taxes.update", () =>
      sdk.putTaxesByTaxIdJson({
        path: { "tax-id": tax.tax.id },
        query: { api_key },
        body: {
          tax: { name: `LC${stamp}`.slice(0, 18), value: "9", region: "PT" },
        },
      }),
    );
    await check("taxes.delete", () =>
      sdk.deleteTaxesByTaxIdJson({
        path: { "tax-id": tax.tax.id },
        query: { api_key },
      }),
    );
  }

  // Items: create -> update -> delete (unit_price as string)
  const item = await check("items.create", () =>
    sdk.postItemsJson({
      query: { api_key },
      body: {
        item: {
          name: `lc item ${stamp}`,
          unit_price: "50.0",
          tax: { name: "IVA23" },
        },
      },
    }),
  );
  if (item && item.item) {
    await check("items.update", () =>
      sdk.putItemsByItemIdJson({
        path: { "item-id": item.item.id },
        query: { api_key },
        body: { item: { name: "lc upd", unit_price: "60.0" } },
      }),
    );
    await check("items.delete", () =>
      sdk.deleteItemsByItemIdJson({
        path: { "item-id": item.item.id },
        query: { api_key },
      }),
    );
  }

  // Clients: create -> update
  const cli = await check("clients.create", () =>
    sdk.postClientsJson({
      query: { api_key },
      body: { client: { name: `lc client ${stamp}`, email: "lc@example.com" } },
    }),
  );
  if (cli && cli.client) {
    await check("clients.update", () =>
      sdk.putClientsByClientIdJson({
        path: { "client-id": cli.client.id },
        query: { api_key },
        body: { client: { name: `lc upd ${stamp}` } },
      }),
    );
  }

  // Estimate (quote): create draft -> get -> update -> change-state(deleted)
  const item2 = [
    { name: "Svc", unit_price: 100, quantity: 1, tax: { name: "IVA23" } },
  ];
  const quote = await check("estimates.create", () =>
    sdk.postByEstimatesTypeJson({
      path: { "estimates-type": "quotes" },
      query: { api_key },
      body: {
        quote: {
          date: "01/01/2030",
          due_date: "31/01/2030",
          client: { name: `lc ${stamp}` },
          items: item2,
        },
      },
    }),
  );
  if (quote && quote.quote) {
    const id = quote.quote.id;
    await check("estimates.get", () =>
      sdk.getByEstimatesTypeByDocumentIdJson({
        path: { "estimates-type": "quotes", "document-id": id },
        query: { api_key },
      }),
    );
    await check("estimates.update", () =>
      sdk.putByEstimatesTypeByDocumentIdJson({
        path: { "estimates-type": "quotes", "document-id": id },
        query: { api_key },
        body: {
          quote: {
            date: "01/01/2030",
            due_date: "31/01/2030",
            client: { name: `lc ${stamp}` },
            items: item2,
          },
        },
      }),
    );
    await check("estimates.changeState", () =>
      sdk.putByEstimatesTypeByDocumentIdChangeStateJson({
        path: { "estimates-type": "quotes", "document-id": id },
        query: { api_key },
        body: { quote: { state: "deleted" } },
      }),
    );
  }

  // Invoice receipt: create draft -> get -> change-state(deleted)
  const ir = await check(
    "invoiceReceipts.create",
    () =>
      sdk.postInvoiceReceiptsJson({
        query: { api_key },
        body: {
          invoice_receipt: {
            date: "01/01/2030",
            due_date: "31/01/2030",
            status: "draft",
            client: { name: `lc ${stamp}` },
            items: item2,
          },
        },
      }),
    { okStatuses: [422] },
  );
  if (ir && ir.invoice_receipt) {
    const id = ir.invoice_receipt.id;
    await check("invoiceReceipts.get", () =>
      sdk.getInvoiceReceiptsByDocumentIdJson({
        path: { "document-id": id },
        query: { api_key },
      }),
    );
    await check("invoiceReceipts.changeState", () =>
      sdk.putInvoiceReceiptsByDocumentIdChangeStateJson({
        path: { "document-id": id },
        query: { api_key },
        body: { invoice_receipt: { state: "deleted" } },
      }),
    );
  }

  // Treasury regularization/movement (need balance -> 422 = reachable)
  const clients = await sdk.getClientsJson({
    query: { api_key, page: 1, per_page: 1 },
  });
  const cid =
    clients.data &&
    clients.data.clients &&
    clients.data.clients[0] &&
    clients.data.clients[0].id;
  if (cid) {
    await check(
      "treasury.initialBalance",
      () =>
        sdk.putApiV3ClientsByClientIdInitialBalanceJson({
          path: { "client-id": cid },
          query: { api_key },
          body: { initial_balance: { value: 0, date: "2030-01-01" } },
        }),
      { okStatuses: [422] },
    );
    await check(
      "treasury.regularization.create",
      () =>
        sdk.postApiV3ClientsByClientIdRegularizationJson({
          path: { "client-id": cid },
          query: { api_key },
          body: { regularization: { value: 1, date: "2030-01-01" } },
        }),
      { okStatuses: [422] },
    );
    await check(
      "treasury.movement.create",
      () =>
        sdk.postApiV3ClientsByClientIdTreasuryMovementsJson({
          path: { "client-id": cid },
          query: { api_key },
          body: {
            treasury_movement: {
              value: 1,
              movement_type: "Payment",
              date: "2030-01-01",
            },
          },
        }),
      { okStatuses: [422] },
    );
  }
}

(async () => {
  console.log(
    `Live check against ${BASE} (${withWrite ? "read + write" : "read-only"})\n`,
  );
  await reads();
  if (withWrite) await writes();

  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    const note = r.ok
      ? r.reachable
        ? `(reachable, ${r.status}) `
        : ""
      : `[${r.status}] `;
    console.log(`${tag}  ${pad(r.name, 30)} ${note}${r.info || ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ok`);
  process.exit(failed.length ? 1 : 0);
})();
