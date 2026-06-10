"use strict";

/**
 * Live verification runner for the InvoiceXpress SDK (v2 functional API).
 *
 * Drives the *built* SDK against a real account and reports coverage across the
 * generated operations. Read-only by default; higher tiers opt into mutation:
 *
 *   (default)       reads only — lists, gets, find-by, SAF-T probe
 *   --write         reversible create/update/delete cycles (clean up after themselves)
 *   --destructive   full document lifecycles: finalize, pay, cancel, email,
 *                   guides, sequences (creates non-deletable sequences and
 *                   canceled documents — use on a test account only)
 *   --accounts      partner Accounts API (creates a NON-DELETABLE sub-account)
 *
 * The API key is read from a command-line argument — never from an environment
 * variable, a file, or source control. Nothing is persisted.
 *
 *   pnpm run build
 *   node scripts/live-check.cjs <api-key> <base-url> [--write] [--destructive] [--accounts]
 */

const path = require("node:path");
const sdkModule = require(path.join(__dirname, "..", "dist", "index.js"));

const args = process.argv.slice(2);
const withDestructive = args.includes("--destructive");
const withWrite = args.includes("--write") || withDestructive;
const withAccounts = args.includes("--accounts");
const positional = args.filter((a) => !a.startsWith("--"));
const api_key = positional[0];
const BASE = positional[1];

if (!api_key || !BASE) {
  console.error(
    "usage: node scripts/live-check.cjs <api-key> <base-url> [--write] [--destructive] [--accounts]\n" +
      "  <base-url> e.g. https://your-account.app.invoicexpress.com",
  );
  process.exit(2);
}

// Track which generated operations the run exercised, via a recording proxy.
const ALL_OPS = Object.keys(sdkModule).filter(
  (k) => typeof sdkModule[k] === "function" && /Json$/.test(k),
);
const exercised = new Set();
const sdk = new Proxy(sdkModule, {
  get(target, prop) {
    if (typeof prop === "string" && /Json$/.test(prop)) exercised.add(prop);
    return target[prop];
  },
});

sdk.client.setConfig({ baseUrl: BASE });

const TODAY = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
})();

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

// Free-trial accounts can't send documents by email; the endpoint is still
// reachable and returns 401 ("não está disponível durante o período gratuito").
const EMAIL_OK = [401, 403, 422];
const EMAIL_BODY = {
  message: {
    client: { email: "lc@example.com", save: "0" },
    subject: "live-check",
    body: "live-check",
  },
};

async function reads() {
  const taxes = await check("taxes.list", () =>
    sdk.getTaxesJson({ query: { api_key } }),
  );
  const firstTax = taxes && taxes.taxes && taxes.taxes[0];
  if (firstTax) {
    await check("taxes.get", () =>
      sdk.getTaxesByTaxIdJson({
        path: { "tax-id": firstTax.id },
        query: { api_key },
      }),
    );
  }
  const items = await check("items.list", () =>
    sdk.getItemsJson({ query: { api_key } }),
  );
  const firstItem = items && items.items && items.items[0];
  if (firstItem) {
    await check("items.get", () =>
      sdk.getItemsByItemIdJson({
        path: { "item-id": firstItem.id },
        query: { api_key },
      }),
    );
  }
  const sequences = await check("sequences.list", () =>
    sdk.getSequencesJson({ query: { api_key } }),
  );
  const firstSeq = sequences && sequences.sequences && sequences.sequences[0];
  if (firstSeq) {
    await check("sequences.get", () =>
      sdk.getSequencesBySequenceIdJson({
        path: { "sequence-id": firstSeq.id },
        query: { api_key },
      }),
    );
  }
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
    await check(
      "clients.findByCode",
      () =>
        sdk.getClientsFindByCodeJson({
          query: { api_key, client_code: firstClient.code || 0 },
        }),
      { okStatuses: [404] },
    );
    await check("clients.listInvoices", () =>
      sdk.postClientsByClientIdInvoicesJson({
        path: { "client-id": cid },
        query: { api_key, page: 1, per_page: 5 },
        body: { filter: {} },
      }),
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
    if (withDestructive) {
      await check(
        "estimates.email",
        () =>
          sdk.putByEstimatesTypeByDocumentIdEmailDocumentJson({
            path: { "estimates-type": "quotes", "document-id": id },
            query: { api_key },
            body: EMAIL_BODY,
          }),
        { okStatuses: EMAIL_OK },
      );
    }
    await check("estimates.changeState", () =>
      sdk.putByEstimatesTypeByDocumentIdChangeStateJson({
        path: { "estimates-type": "quotes", "document-id": id },
        query: { api_key },
        body: { quote: { state: "deleted" } },
      }),
    );
  }

  // Invoice receipt: create draft -> get -> [email] -> change-state(deleted)
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
    if (withDestructive) {
      await check(
        "invoiceReceipts.email",
        () =>
          sdk.putInvoiceReceiptsByDocumentIdEmailDocumentJson({
            path: { "document-id": id },
            query: { api_key },
            body: EMAIL_BODY,
          }),
        { okStatuses: EMAIL_OK },
      );
    }
    await check("invoiceReceipts.changeState", () =>
      sdk.putInvoiceReceiptsByDocumentIdChangeStateJson({
        path: { "document-id": id },
        query: { api_key },
        body: { invoice_receipt: { state: "deleted" } },
      }),
    );
  }

  // Treasury: initial balance, then regularization and movement create -> delete
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
    const reg = await check(
      "treasury.regularization.create",
      () =>
        sdk.postApiV3ClientsByClientIdRegularizationJson({
          path: { "client-id": cid },
          query: { api_key },
          body: { regularization: { value: 1, date: "2030-01-01" } },
        }),
      { okStatuses: [422] },
    );
    const regId = reg && reg.regularization && reg.regularization.id;
    if (regId) {
      await check("treasury.regularization.delete", () =>
        sdk.deleteApiV3ClientsByClientIdRegularizationByIdJson({
          path: { "client-id": cid, id: regId },
          query: { api_key },
        }),
      );
    }
    const mov = await check(
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
    const movId = mov && mov.treasury_movement && mov.treasury_movement.id;
    if (movId) {
      await check("treasury.movement.delete", () =>
        sdk.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson({
          path: { "client-id": cid, id: movId },
          query: { api_key },
        }),
      );
    }
  }
}

async function destructive() {
  const stamp = Date.now();
  const items = [
    { name: "Svc", unit_price: 100, quantity: 1, tax: { name: "IVA23" } },
  ];
  // The sequence rejects dates earlier than its last finalized invoice, and
  // previous runs finalized documents dated 01/01/2030 — pin the same date so
  // every run can finalize regardless of when it executes.
  const DOC_DATE = "01/01/2030";

  // Invoice: create -> get -> update -> finalize -> pdf/qr ->
  // treasury cycles on its client -> partial payment -> related ->
  // cancel receipt -> cancel invoice
  const inv = await check("invoices.create", () =>
    sdk.postInvoicesJson({
      query: { api_key },
      body: {
        invoice: {
          date: DOC_DATE,
          due_date: "31/01/2030",
          client: { name: `lc ${stamp}` },
          items,
        },
      },
    }),
  );
  if (inv && inv.invoice) {
    const id = inv.invoice.id;
    await check("invoices.get", () =>
      sdk.getInvoicesByDocumentIdJson({
        path: { "document-id": id },
        query: { api_key },
      }),
    );
    await check("invoices.update", () =>
      sdk.putInvoicesByDocumentIdJson({
        path: { "document-id": id },
        query: { api_key },
        body: {
          invoice: {
            date: DOC_DATE,
            due_date: "31/01/2030",
            client: { name: `lc ${stamp}` },
            items,
            observations: "live-check",
          },
        },
      }),
    );
    const finalized = await check("invoices.finalize", () =>
      sdk.putInvoicesByDocumentIdChangeStateJson({
        path: { "document-id": id },
        query: { api_key },
        body: { invoice: { state: "finalized" } },
      }),
    );
    const wasFinalized = results.at(-1).ok;
    if (wasFinalized) {
      // PDF generation is async server-side: 202 until ready, then 200.
      await check(
        "documents.pdf",
        async () => {
          let res;
          for (let i = 0; i < 5; i++) {
            res = await sdk.getApiPdfByDocumentIdJson({
              path: { "document-id": id },
              query: { api_key },
            });
            if (res.response.status !== 202) break;
            await new Promise((r) => setTimeout(r, 2000));
          }
          return res;
        },
        { okStatuses: [202] },
      );
      await check(
        "documents.qrCode",
        () =>
          sdk.getApiQrCodesByDocumentIdJson({
            path: { "document-id": id },
            query: { api_key },
          }),
        { okStatuses: [202, 404, 422] },
      );
      // Pay the invoice in full, then unwind: cancel the receipt and the
      // invoice. No treasury movements touch this document — a deleted
      // movement leaves it permanently "paid" server-side and uncancelable
      // (see treasuryCycles below).
      const total =
        (finalized && finalized.invoice && finalized.invoice.total) ||
        (inv.invoice && inv.invoice.total) ||
        123;
      const payAmount = (amount) =>
        sdk.postDocumentsByDocumentIdPartialPaymentsJson({
          path: { "document-id": id },
          query: { api_key },
          body: {
            partial_payment: {
              amount,
              payment_date: DOC_DATE,
              note: "live-check",
            },
          },
        });
      const pp = await check("invoices.partialPayment", async () => {
        // If the full amount is rejected with a cap ("menor ou igual a X"),
        // retry with the cap the server reports.
        let res = await payAmount(Number(total));
        if (res.response && res.response.status === 422) {
          const m = JSON.stringify(res.error).match(
            /menor ou igual a ([\d.]+)/,
          );
          if (m) res = await payAmount(Number(m[1]));
        }
        return res;
      });
      const related = await check("documents.relatedDocuments", () =>
        sdk.getDocumentByDocumentIdRelatedDocumentsJson({
          path: { "document-id": id },
          query: { api_key },
        }),
      );
      let ppReceiptId =
        (pp && pp.receipt && pp.receipt.id) ||
        (pp && pp.partial_payment && pp.partial_payment.id);
      if (!ppReceiptId) {
        const receipt = ((related && related.documents) || []).find(
          (d) =>
            /receipt/i.test(d.type || d.document_type || "") &&
            d.status !== "canceled",
        );
        ppReceiptId = receipt && receipt.id;
      }
      if (ppReceiptId) {
        await check("receipts.cancel", () =>
          sdk.putReceiptsByReceiptIdChangeStateJson({
            path: { "receipt-id": ppReceiptId },
            query: { api_key },
            body: { receipt: { state: "canceled", message: "live-check" } },
          }),
        );
      }
      await check("invoices.cancel", () =>
        sdk.putInvoicesByDocumentIdChangeStateJson({
          path: { "document-id": id },
          query: { api_key },
          body: { invoice: { state: "canceled", message: "live-check" } },
        }),
      );
    } else {
      // Draft never finalized — delete it instead.
      await check("invoices.delete(draft)", () =>
        sdk.putInvoicesByDocumentIdChangeStateJson({
          path: { "document-id": id },
          query: { api_key },
          body: { invoice: { state: "deleted" } },
        }),
      );
    }
  }

  // Treasury create/delete cycles need a client with an outstanding document
  // balance, and a deleted Payment movement leaves its document permanently
  // "paid" server-side (and therefore uncancelable) — so run them against a
  // throwaway invoice, keeping the main lifecycle above clean. The setup and
  // cleanup calls are unchecked (their operations are already covered above);
  // cleanup is best-effort.
  const tInvRes = await sdk.postInvoicesJson({
    query: { api_key },
    body: {
      invoice: {
        date: DOC_DATE,
        due_date: "31/01/2030",
        client: { name: `lc treasury ${stamp}` },
        items,
      },
    },
  });
  const tInv = tInvRes.data && tInvRes.data.invoice;
  if (tInv) {
    const fin = await sdk.putInvoicesByDocumentIdChangeStateJson({
      path: { "document-id": tInv.id },
      query: { api_key },
      body: { invoice: { state: "finalized" } },
    });
    const tGot = await sdk.getInvoicesByDocumentIdJson({
      path: { "document-id": tInv.id },
      query: { api_key },
    });
    const cid =
      tGot.data && tGot.data.invoice && tGot.data.invoice.client
        ? tGot.data.invoice.client.id
        : null;
    if (fin.response.ok && cid) {
      // Regularizations need a pending balance independent of documents —
      // bump the initial balance, cycle, then reset it.
      await check("treasury.initialBalance(set)", () =>
        sdk.putApiV3ClientsByClientIdInitialBalanceJson({
          path: { "client-id": cid },
          query: { api_key },
          body: { initial_balance: { value: 10, date: "2030-01-01" } },
        }),
      );
      const reg = await check(
        "treasury.regularization.create",
        () =>
          sdk.postApiV3ClientsByClientIdRegularizationJson({
            path: { "client-id": cid },
            query: { api_key },
            body: { regularization: { value: 1, date: "2030-01-01" } },
          }),
        { okStatuses: [422] },
      );
      const regId = reg && reg.regularization && reg.regularization.id;
      if (regId) {
        await check("treasury.regularization.delete", () =>
          sdk.deleteApiV3ClientsByClientIdRegularizationByIdJson({
            path: { "client-id": cid, id: regId },
            query: { api_key },
          }),
        );
      }
      const mov = await check(
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
      const movId = mov && mov.treasury_movement && mov.treasury_movement.id;
      if (movId) {
        // Known InvoiceXpress server-side bug: deleting a movement returns
        // 500 ("undefined method 'invoice' for nil") but the deletion IS
        // applied — a retry returns 404. 500 counts as ok.
        await check(
          "treasury.movement.delete",
          () =>
            sdk.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson({
              path: { "client-id": cid, id: movId },
              query: { api_key },
            }),
          { okStatuses: [500] },
        );
      }
      await check("treasury.initialBalance(reset)", () =>
        sdk.putApiV3ClientsByClientIdInitialBalanceJson({
          path: { "client-id": cid },
          query: { api_key },
          body: { initial_balance: { value: 0, date: "2030-01-01" } },
        }),
      );
      // Best-effort cleanup: cancel the movement's auto-generated receipt,
      // then try to cancel the invoice (may stay "paid" — server-side quirk).
      const rel = await sdk.getDocumentByDocumentIdRelatedDocumentsJson({
        path: { "document-id": tInv.id },
        query: { api_key },
      });
      for (const d of (rel.data && rel.data.documents) || []) {
        if (
          /receipt/i.test(d.type || d.document_type || "") &&
          d.status !== "canceled"
        ) {
          await sdk.putReceiptsByReceiptIdChangeStateJson({
            path: { "receipt-id": d.id },
            query: { api_key },
            body: { receipt: { state: "canceled", message: "live-check" } },
          });
        }
      }
      await sdk.putInvoicesByDocumentIdChangeStateJson({
        path: { "document-id": tInv.id },
        query: { api_key },
        body: { invoice: { state: "canceled", message: "live-check" } },
      });
    } else {
      // Could not finalize — delete the draft.
      await sdk.putInvoicesByDocumentIdChangeStateJson({
        path: { "document-id": tInv.id },
        query: { api_key },
        body: { invoice: { state: "deleted" } },
      });
    }
  }

  // Guide (transport): create -> get -> update (known server-side 500) ->
  // email -> change-state(deleted)
  const address = {
    detail: "Rua A 1",
    city: "Lisboa",
    postal_code: "1000-001",
    country: "Portugal",
  };
  // Use a dedicated client: the invoice client above got an initial balance
  // dated 2030, and documents can't predate the client's initial balance.
  const guide = await check("guides.create", () =>
    sdk.postByGuidesTypeJson({
      path: { "guides-type": "transports" },
      query: { api_key },
      body: {
        transport: {
          date: TODAY,
          loaded_at: `${TODAY} 09:00:00`,
          client: { name: `lc guide ${stamp}` },
          items,
          address_from: address,
          address_to: address,
        },
      },
    }),
  );
  if (guide && guide.transport) {
    const id = guide.transport.id;
    await check("guides.get", () =>
      sdk.getByGuidesTypeByDocumentIdJson({
        path: { "guides-type": "transports", "document-id": id },
        query: { api_key },
      }),
    );
    // Known InvoiceXpress server-side bug: guide update returns 500 for all
    // guide types. 500 counts as "reachable" until fixed upstream.
    await check(
      "guides.update",
      () =>
        sdk.putByGuidesTypeByDocumentIdJson({
          path: { "guides-type": "transports", "document-id": id },
          query: { api_key },
          body: {
            transport: {
              date: TODAY,
              loaded_at: `${TODAY} 09:00:00`,
              client: { name: `lc guide ${stamp}` },
              items,
              address_from: address,
              address_to: address,
            },
          },
        }),
      { okStatuses: [500] },
    );
    await check(
      "guides.email",
      () =>
        sdk.putByGuidesTypeByDocumentIdEmailDocumentJson({
          path: { "guides-type": "transports", "document-id": id },
          query: { api_key },
          body: EMAIL_BODY,
        }),
      { okStatuses: EMAIL_OK },
    );
    await check("guides.changeState", () =>
      sdk.putByGuidesTypeByDocumentIdChangeStateJson({
        path: { "guides-type": "transports", "document-id": id },
        query: { api_key },
        body: { transport: { state: "deleted" } },
      }),
    );
  }

  // Sequences: create (NOT deletable) -> register (AT; fails without real AT
  // credentials) -> set-current on the existing default (idempotent).
  const seq = await check(
    "sequences.create",
    () =>
      sdk.postSequencesJson({
        query: { api_key },
        body: { sequence: { serie: `LC${String(stamp).slice(-6)}` } },
      }),
    { okStatuses: [422] },
  );
  const seqList = await sdk.getSequencesJson({ query: { api_key } });
  const current =
    seqList.data &&
    seqList.data.sequences &&
    seqList.data.sequences.find((s) => s.default_sequence);
  // Creating a sequence requires valid AT credentials on the account (422
  // code 004 otherwise) — fall back to registering the existing default so
  // the endpoint is still exercised.
  const registerId =
    (seq && seq.sequence && seq.sequence.id) || (current && current.id);
  if (registerId) {
    await check(
      "sequences.register",
      () =>
        sdk.putSequencesBySequenceIdRegisterJson({
          path: { "sequence-id": registerId },
          query: { api_key },
        }),
      { okStatuses: [403, 422, 500] },
    );
  }
  if (current) {
    await check("sequences.setCurrent", () =>
      sdk.putSequencesBySequenceIdSetCurrentJson({
        path: { "sequence-id": current.id },
        query: { api_key },
      }),
    );
  }
}

async function accounts() {
  const stamp = Date.now();
  // WARNING: creates a sub-account that cannot be deleted via the API.
  const created = await check(
    "accounts.create",
    () =>
      sdk.postApiAccountsCreateJson({
        query: { api_key },
        body: {
          account: {
            organization_name: `lc org ${stamp}`,
            first_name: "Live",
            last_name: "Check",
            email: `lc${stamp}@example.com`,
            password: `Lc!${stamp}`,
            terms: "1",
          },
        },
      }),
    { okStatuses: [422] },
  );
  const accId = created && created.account && created.account.id;
  // Get/update on a fresh sub-account require partner-level credentials; the
  // primary account's key gets 404. Reachability is what we verify here.
  await check(
    "accounts.get",
    () =>
      sdk.getApiAccountsByAccountIdGetJson({
        path: { "account-id": accId || 1 },
        query: { api_key },
      }),
    { okStatuses: [404] },
  );
  await check(
    "accounts.update",
    () =>
      sdk.putApiAccountsByAccountIdUpdateJson({
        path: { "account-id": accId || 1 },
        query: { api_key },
        body: { account: { organization_name: `lc upd ${stamp}` } },
      }),
    { okStatuses: [404] },
  );
  await check(
    "accounts.createAlreadyUser",
    () =>
      sdk.postApiAccountsCreateAlreadyUserJson({
        query: { api_key },
        body: {
          account: {
            organization_name: `lc org2 ${stamp}`,
            email: `lc${stamp}@example.com`,
            password: "wrong-password",
            terms: "1",
          },
        },
      }),
    { okStatuses: [400, 401, 422] },
  );
  await check(
    "accounts.atCommunication",
    () =>
      sdk.postApiV3AccountsAtCommunicationJson({
        query: { api_key },
        body: {},
      }),
    { okStatuses: [422, 500] },
  );
}

(async () => {
  const tiers = [
    "read",
    withWrite && "write",
    withDestructive && "destructive",
    withAccounts && "accounts",
  ]
    .filter(Boolean)
    .join(" + ");
  console.log(`Live check against ${BASE} (${tiers})\n`);
  await reads();
  if (withWrite) await writes();
  if (withDestructive) await destructive();
  if (withAccounts) await accounts();

  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    const note = r.ok
      ? r.reachable
        ? `(reachable, ${r.status}) `
        : ""
      : `[${r.status}] `;
    console.log(`${tag}  ${pad(r.name, 32)} ${note}${r.info || ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks ok`,
  );

  const missing = ALL_OPS.filter((op) => !exercised.has(op));
  console.log(
    `operation coverage: ${ALL_OPS.length - missing.length}/${ALL_OPS.length}`,
  );
  if (missing.length) {
    console.log(`not exercised:\n  ${missing.join("\n  ")}`);
  }
  process.exit(failed.length ? 1 : 0);
})();
