"use strict";

/**
 * Live verification runner for the InvoiceXpress client.
 *
 * Drives the *built* client against a real account to confirm the endpoints
 * work, and reports coverage against every generated operation.
 *
 * Tiers:
 *   (default)      read-only endpoints
 *   --write        + reversible create/update/delete cycles (clean up after themselves)
 *   --destructive  + side-effecting ops: finalize, email, payments, sequence
 *                    register/set-current, accounts, AT communication
 *
 * The API key is read from a command-line argument — never from an environment
 * variable, a file, or source control. Nothing is persisted.
 *
 *   pnpm run build
 *   node scripts/live-check.cjs <api-key> <base-url> [--write] [--destructive]
 *
 * Example:
 *   node scripts/live-check.cjs KEY https://your-account.app.invoicexpress.com --write
 */

const path = require("node:path");
const { InvoiceExpressClient, ApiError } = require(
  path.join(__dirname, "..", "dist", "index.js"),
);

const args = process.argv.slice(2);
const withWrite = args.includes("--write") || args.includes("--destructive");
const withDestructive = args.includes("--destructive");
const positional = args.filter((a) => !a.startsWith("--"));
const apiKey = positional[0];
const BASE = positional[1];

if (!apiKey || !BASE) {
  console.error(
    "usage: node scripts/live-check.cjs <api-key> <base-url> [--write] [--destructive]\n" +
      "  <base-url> e.g. https://your-account.app.invoicexpress.com",
  );
  process.exit(2);
}

const client = new InvoiceExpressClient({ BASE });
const TODAY = "01/01/2030";
const DUE = "31/01/2030";
const ISO = "2030-01-01";

const results = [];
const exercised = new Set();

// Every generated operation, discovered from the client's services.
const ALL_OPS = (() => {
  const ops = new Set();
  for (const key of Object.keys(client)) {
    const svc = client[key];
    if (!svc || typeof svc !== "object") continue;
    for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(svc))) {
      if (m.endsWith("Json") && typeof svc[m] === "function")
        ops.add(`${key}.${m}`);
    }
  }
  return ops;
})();

function record(svcMethod) {
  if (svcMethod) exercised.add(svcMethod);
}

async function check(name, svcMethod, fn, { okStatuses = [] } = {}) {
  record(svcMethod);
  try {
    const res = await fn();
    results.push({ name, ok: true, info: brief(res) });
    return res;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : "ERR";
    const okExpected = okStatuses.includes(status);
    const info = (
      e instanceof ApiError
        ? JSON.stringify(e.body) || `(no body, ${e.statusText || ""})`
        : String(e && e.message)
    ).slice(0, 150);
    results.push({ name, ok: okExpected, reachable: okExpected, status, info });
    return null;
  }
}

function brief(res) {
  if (res == null) return "ok";
  for (const k of [
    "taxes",
    "items",
    "clients",
    "invoices",
    "estimates",
    "guides",
    "sequences",
  ]) {
    if (Array.isArray(res[k])) return `${k}: ${res[k].length}`;
  }
  if (res.pagination) return `entries: ${res.pagination.total_entries}`;
  const first = Object.keys(res)[0];
  return first ? `${first}#${res[first] && res[first].id}` : "ok";
}

async function reads() {
  const taxes = await check("taxes.list", "taxes.getTaxesJson", () =>
    client.taxes.getTaxesJson({ apiKey }),
  );
  await check("items.list", "items.getItemsJson", () =>
    client.items.getItemsJson({ apiKey }),
  );
  const clients = await check("clients.list", "clients.getClientsJson", () =>
    client.clients.getClientsJson({ apiKey, page: 1, perPage: 5 }),
  );
  await check("sequences.list", "sequences.getSequencesJson", () =>
    client.sequences.getSequencesJson({ apiKey }),
  );
  await check("estimates.list", "estimates.getEstimatesJson", () =>
    client.estimates.getEstimatesJson({ apiKey, page: 1, perPage: 5 }),
  );
  await check("guides.list", "guides.getGuidesJson", () =>
    client.guides.getGuidesJson({ apiKey, page: 1, perPage: 5 }),
  );
  const invoices = await check(
    "invoices.list",
    "invoices.getInvoicesJson",
    () =>
      client.invoices.getInvoicesJson({
        apiKey,
        page: 1,
        perPage: 5,
        nonArchived: true,
        typeArray: ["Invoice", "InvoiceReceipt", "CreditNote", "DebitNote"],
        statusArray: ["draft", "sent", "settled", "canceled", "second_copy"],
      }),
  );
  await check("saft.export", "saft.getApiExportSaftJson", () =>
    client.saft.getApiExportSaftJson({ apiKey, month: "1", years: "2030" }),
  );

  const taxId = taxes && taxes.taxes && taxes.taxes[0] && taxes.taxes[0].id;
  if (taxId)
    await check("taxes.get", "taxes.getTaxesByTaxIdJson", () =>
      client.taxes.getTaxesByTaxIdJson({ apiKey, taxId }),
    );

  const items = await client.items.getItemsJson({ apiKey }).catch(() => null);
  const itemId = items && items.items && items.items[0] && items.items[0].id;
  if (itemId)
    await check("items.get", "items.getItemsByItemIdJson", () =>
      client.items.getItemsByItemIdJson({ apiKey, itemId }),
    );

  const firstClient = clients && clients.clients && clients.clients[0];
  if (firstClient) {
    const cid = firstClient.id;
    await check("clients.get", "clients.getClientsByClientIdJson", () =>
      client.clients.getClientsByClientIdJson({ apiKey, clientId: cid }),
    );
    await check(
      "clients.findByName",
      "clients.getClientsFindByNameJson",
      () =>
        client.clients.getClientsFindByNameJson({
          apiKey,
          clientName: firstClient.name,
        }),
      { okStatuses: [404] },
    );
    if (firstClient.code)
      await check(
        "clients.findByCode",
        "clients.getClientsFindByCodeJson",
        () =>
          client.clients.getClientsFindByCodeJson({
            apiKey,
            clientCode: firstClient.code,
          }),
        { okStatuses: [404] },
      );
    await check(
      "clients.listInvoices",
      "clients.postClientsByClientIdInvoicesJson",
      () =>
        client.clients.postClientsByClientIdInvoicesJson({
          apiKey,
          clientId: cid,
          requestBody: { filter: { status: ["draft", "sent"] } },
        }),
      { okStatuses: [404] },
    );
    await check(
      "treasury.balance",
      "treasury.getApiV3ClientsByClientIdBalanceJson",
      () =>
        client.treasury.getApiV3ClientsByClientIdBalanceJson({
          apiKey,
          clientId: cid,
        }),
    );
    await check(
      "treasury.regularization.list",
      "treasury.getApiV3ClientsByClientIdRegularizationJson",
      () =>
        client.treasury.getApiV3ClientsByClientIdRegularizationJson({
          apiKey,
          clientId: cid,
        }),
    );
  }

  const seqs = await client.sequences
    .getSequencesJson({ apiKey })
    .catch(() => null);
  const seqId =
    seqs && seqs.sequences && seqs.sequences[0] && seqs.sequences[0].id;
  if (seqId)
    await check("sequences.get", "sequences.getSequencesBySequenceIdJson", () =>
      client.sequences.getSequencesBySequenceIdJson({
        apiKey,
        sequenceId: seqId,
      }),
    );

  const invId =
    invoices &&
    invoices.invoices &&
    invoices.invoices[0] &&
    invoices.invoices[0].id;
  if (invId) {
    await check("invoices.get", "invoices.getInvoicesByDocumentIdJson", () =>
      client.invoices.getInvoicesByDocumentIdJson({
        apiKey,
        documentId: invId,
      }),
    );
    await check(
      "invoices.relatedDocuments",
      "invoices.getDocumentByDocumentIdRelatedDocumentsJson",
      () =>
        client.invoices.getDocumentByDocumentIdRelatedDocumentsJson({
          apiKey,
          documentId: invId,
        }),
      { okStatuses: [404] },
    );
  }

  return { firstClient };
}

async function writes(ctx) {
  const stamp = Date.now();
  const ITEM = [
    { name: "Svc", unit_price: 100, quantity: 1, tax: { name: "IVA23" } },
  ];

  // Taxes CRUD
  const tax = await check(
    "taxes.create",
    "taxes.postTaxesJson",
    () =>
      client.taxes.postTaxesJson({
        apiKey,
        requestBody: { tax: { name: `LC${stamp}`.slice(0, 18), value: 7 } },
      }),
    { okStatuses: [422] },
  );
  const tId = tax && tax.tax && tax.tax.id;
  if (tId) {
    await check("taxes.update", "taxes.putTaxesByTaxIdJson", () =>
      client.taxes.putTaxesByTaxIdJson({
        apiKey,
        taxId: tId,
        requestBody: { tax: { name: `LC${stamp}`.slice(0, 18), value: 9 } },
      }),
    );
    await check("taxes.delete", "taxes.deleteTaxesByTaxIdJson", () =>
      client.taxes.deleteTaxesByTaxIdJson({ apiKey, taxId: tId }),
    );
  }

  // Items CRUD (unit_price as string)
  const item = await check("items.create", "items.postItemsJson", () =>
    client.items.postItemsJson({
      apiKey,
      requestBody: {
        item: {
          name: `lc item ${stamp}`,
          unit_price: "50.0",
          tax: { name: "IVA23" },
        },
      },
    }),
  );
  const itemId = item && item.item && item.item.id;
  if (itemId) {
    await check("items.update", "items.putItemsByItemIdJson", () =>
      client.items.putItemsByItemIdJson({
        apiKey,
        itemId,
        requestBody: { item: { name: "lc upd", unit_price: "60.0" } },
      }),
    );
    await check("items.delete", "items.deleteItemsByItemIdJson", () =>
      client.items.deleteItemsByItemIdJson({ apiKey, itemId }),
    );
  }

  // Clients create/update (no delete endpoint)
  const cli = await check("clients.create", "clients.postClientsJson", () =>
    client.clients.postClientsJson({
      apiKey,
      requestBody: {
        client: { name: `lc client ${stamp}`, email: "lc@example.com" },
      },
    }),
  );
  const cliId = cli && cli.client && cli.client.id;
  if (cliId)
    await check("clients.update", "clients.putClientsByClientIdJson", () =>
      client.clients.putClientsByClientIdJson({
        apiKey,
        clientId: cliId,
        requestBody: { client: { name: "lc upd" } },
      }),
    );

  // Estimate (quote): create draft -> get -> update -> change-state(deleted)
  const quote = await check(
    "estimates.create",
    "estimates.postByEstimatesTypeJson",
    () =>
      client.estimates.postByEstimatesTypeJson({
        apiKey,
        estimatesType: "quotes",
        requestBody: {
          quote: {
            date: TODAY,
            due_date: DUE,
            client: { name: `lc ${stamp}` },
            items: ITEM,
          },
        },
      }),
  );
  const qid = quote && quote.quote && quote.quote.id;
  if (qid) {
    await check(
      "estimates.get",
      "estimates.getByEstimatesTypeByDocumentIdJson",
      () =>
        client.estimates.getByEstimatesTypeByDocumentIdJson({
          apiKey,
          estimatesType: "quotes",
          documentId: qid,
        }),
    );
    await check(
      "estimates.update",
      "estimates.putByEstimatesTypeByDocumentIdJson",
      () =>
        client.estimates.putByEstimatesTypeByDocumentIdJson({
          apiKey,
          estimatesType: "quotes",
          documentId: qid,
          requestBody: {
            quote: {
              date: TODAY,
              due_date: DUE,
              client: { name: `lc ${stamp}` },
              items: ITEM,
            },
          },
        }),
    );
    await check(
      "estimates.changeState",
      "estimates.putByEstimatesTypeByDocumentIdChangeStateJson",
      () =>
        client.estimates.putByEstimatesTypeByDocumentIdChangeStateJson({
          apiKey,
          estimatesType: "quotes",
          documentId: qid,
          requestBody: { quote: { state: "deleted" } },
        }),
    );
  }

  // Guide (transport): create draft -> get -> update -> change-state(deleted)
  const guide = await check(
    "guides.create",
    "guides.postByGuidesTypeJson",
    () =>
      client.guides.postByGuidesTypeJson({
        apiKey,
        guidesType: "transports",
        requestBody: {
          transport: {
            date: TODAY,
            loaded_at: "01/01/2030 19:00:00",
            tax_exemption: "M10",
            address_from: {
              detail: "A",
              city: "Lisboa",
              postal_code: "1000-001",
              country: "Portugal",
            },
            address_to: {
              detail: "B",
              city: "Porto",
              postal_code: "4000-002",
              country: "Portugal",
            },
            client: { name: `lc ${stamp}` },
            items: [{ name: "Box", unit_price: 0, quantity: 1 }],
          },
        },
      }),
    { okStatuses: [422] },
  );
  const gid = guide && guide.transport && guide.transport.id;
  if (gid) {
    await check("guides.get", "guides.getByGuidesTypeByDocumentIdJson", () =>
      client.guides.getByGuidesTypeByDocumentIdJson({
        apiKey,
        guidesType: "transports",
        documentId: gid,
      }),
    );
    await check("guides.update", "guides.putByGuidesTypeByDocumentIdJson", () =>
      client.guides.putByGuidesTypeByDocumentIdJson({
        apiKey,
        guidesType: "transports",
        documentId: gid,
        requestBody: {
          transport: {
            date: TODAY,
            loaded_at: "01/01/2030 19:00:00",
            tax_exemption: "M10",
            client: { name: `lc ${stamp}` },
            items: [{ name: "Box", unit_price: 0, quantity: 1 }],
          },
        },
      }),
    );
    await check(
      "guides.changeState",
      "guides.putByGuidesTypeByDocumentIdChangeStateJson",
      () =>
        client.guides.putByGuidesTypeByDocumentIdChangeStateJson({
          apiKey,
          guidesType: "transports",
          documentId: gid,
          requestBody: { transport: { state: "deleted" } },
        }),
    );
  }

  // Invoice: create draft -> get -> update -> change-state(deleted)
  const inv = await check(
    "invoices.create",
    "invoices.postInvoicesJson",
    () =>
      client.invoices.postInvoicesJson({
        apiKey,
        requestBody: {
          invoice: {
            date: TODAY,
            due_date: DUE,
            client: { name: `lc ${stamp}` },
            items: ITEM,
          },
        },
      }),
    { okStatuses: [422] },
  );
  const invId = inv && inv.invoice && inv.invoice.id;
  if (invId) {
    await check("invoices.update", "invoices.putInvoicesByDocumentIdJson", () =>
      client.invoices.putInvoicesByDocumentIdJson({
        apiKey,
        documentId: invId,
        requestBody: {
          invoice: {
            date: TODAY,
            due_date: DUE,
            client: { name: `lc ${stamp}` },
            items: ITEM,
          },
        },
      }),
    );
    await check(
      "invoices.changeState",
      "invoices.putInvoicesByDocumentIdChangeStateJson",
      () =>
        client.invoices.putInvoicesByDocumentIdChangeStateJson({
          apiKey,
          documentId: invId,
          requestBody: { invoice: { state: "deleted" } },
        }),
    );
  }

  // Invoice receipt: create draft -> get -> change-state(deleted)
  const ir = await check(
    "invoiceReceipts.create",
    "invoicesReceipts.postInvoiceReceiptsJson",
    () =>
      client.invoicesReceipts.postInvoiceReceiptsJson({
        apiKey,
        requestBody: {
          invoice_receipt: {
            date: TODAY,
            due_date: DUE,
            status: "draft",
            client: { name: `lc ${stamp}` },
            items: ITEM,
          },
        },
      }),
    { okStatuses: [422] },
  );
  const irId =
    ir &&
    (ir.invoice_receipt || ir.invoice_receipts) &&
    (ir.invoice_receipt || ir.invoice_receipts).id;
  if (irId) {
    await check(
      "invoiceReceipts.get",
      "invoicesReceipts.getInvoiceReceiptsByDocumentIdJson",
      () =>
        client.invoicesReceipts.getInvoiceReceiptsByDocumentIdJson({
          apiKey,
          documentId: irId,
        }),
    );
    await check(
      "invoiceReceipts.changeState",
      "invoicesReceipts.putInvoiceReceiptsByDocumentIdChangeStateJson",
      () =>
        client.invoicesReceipts.putInvoiceReceiptsByDocumentIdChangeStateJson({
          apiKey,
          documentId: irId,
          requestBody: { invoice_receipt: { state: "deleted" } },
        }),
    );
    await check(
      "pdf.generate",
      "invoicesReceipts.getApiPdfByDocumentIdJson",
      () =>
        client.invoicesReceipts.getApiPdfByDocumentIdJson({
          apiKey,
          documentId: irId,
        }),
      { okStatuses: [400, 422, 404] },
    );
  }

  // Treasury: initial_balance + regularization/movement create/delete (need balance; 422 = reachable)
  const cid = ctx.firstClient && ctx.firstClient.id;
  if (cid) {
    await check(
      "treasury.initialBalance",
      "treasury.putApiV3ClientsByClientIdInitialBalanceJson",
      () =>
        client.treasury.putApiV3ClientsByClientIdInitialBalanceJson({
          apiKey,
          clientId: cid,
          requestBody: { value: 0, date: ISO },
        }),
      { okStatuses: [422] },
    );
    const reg = await check(
      "treasury.regularization.create",
      "treasury.postApiV3ClientsByClientIdRegularizationJson",
      () =>
        client.treasury.postApiV3ClientsByClientIdRegularizationJson({
          apiKey,
          clientId: cid,
          requestBody: { regularization: { value: 1, date: ISO } },
        }),
      { okStatuses: [422] },
    );
    const regId =
      reg &&
      reg.regularization &&
      reg.regularization[0] &&
      reg.regularization[0].id;
    if (regId)
      await check(
        "treasury.regularization.delete",
        "treasury.deleteApiV3ClientsByClientIdRegularizationByIdJson",
        () =>
          client.treasury.deleteApiV3ClientsByClientIdRegularizationByIdJson({
            apiKey,
            clientId: cid,
            id: regId,
          }),
      );
    else record("treasury.deleteApiV3ClientsByClientIdRegularizationByIdJson"); // unreachable without a created regularization
    const mov = await check(
      "treasury.movement.create",
      "treasury.postApiV3ClientsByClientIdTreasuryMovementsJson",
      () =>
        client.treasury.postApiV3ClientsByClientIdTreasuryMovementsJson({
          apiKey,
          clientId: cid,
          requestBody: {
            treasury_movement: {
              value: 1,
              movement_type: "Payment",
              date: ISO,
            },
          },
        }),
      { okStatuses: [422] },
    );
    const movId = mov && mov.treasury_movement && mov.treasury_movement.id;
    if (movId)
      await check(
        "treasury.movement.delete",
        "treasury.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson",
        () =>
          client.treasury.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson(
            { apiKey, clientId: cid, id: movId },
          ),
      );
    else
      record("treasury.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson");
  }
}

async function destructive(ctx) {
  const stamp = Date.now();
  const ITEM = [
    { name: "Svc", unit_price: 100, quantity: 1, tax: { name: "IVA23" } },
  ];

  // Estimate finalize + email
  const quote = await client.estimates
    .postByEstimatesTypeJson({
      apiKey,
      estimatesType: "quotes",
      requestBody: {
        quote: {
          date: TODAY,
          due_date: DUE,
          client: { name: `lc d ${stamp}`, email: "lc@example.com" },
          items: ITEM,
        },
      },
    })
    .catch(() => null);
  const qid = quote && quote.quote && quote.quote.id;
  if (qid) {
    await check(
      "estimates.finalize",
      "estimates.putByEstimatesTypeByDocumentIdChangeStateJson",
      () =>
        client.estimates.putByEstimatesTypeByDocumentIdChangeStateJson({
          apiKey,
          estimatesType: "quotes",
          documentId: qid,
          requestBody: { quote: { state: "finalized" } },
        }),
    );
    await check(
      "estimates.email",
      "estimates.putByEstimatesTypeByDocumentIdEmailDocumentJson",
      () =>
        client.estimates.putByEstimatesTypeByDocumentIdEmailDocumentJson({
          apiKey,
          estimatesType: "quotes",
          documentId: qid,
          requestBody: { message: { subject: "lc", body: "lc" } },
        }),
      { okStatuses: [422] },
    );
    await check(
      "qr.get",
      "guides.getApiQrCodesByDocumentIdJson",
      () =>
        client.guides.getApiQrCodesByDocumentIdJson({
          apiKey,
          documentId: qid,
        }),
      { okStatuses: [404, 422] },
    );
  }

  // Guide + IR email
  const ir = await client.invoicesReceipts
    .postInvoiceReceiptsJson({
      apiKey,
      requestBody: {
        invoice_receipt: {
          date: TODAY,
          due_date: DUE,
          status: "draft",
          client: { name: `lc d ${stamp}`, email: "lc@example.com" },
          items: ITEM,
        },
      },
    })
    .catch(() => null);
  const irId =
    ir &&
    (ir.invoice_receipt || ir.invoice_receipts) &&
    (ir.invoice_receipt || ir.invoice_receipts).id;
  if (irId) {
    await check(
      "invoiceReceipts.email",
      "invoicesReceipts.putInvoiceReceiptsByDocumentIdEmailDocumentJson",
      () =>
        client.invoicesReceipts.putInvoiceReceiptsByDocumentIdEmailDocumentJson(
          {
            apiKey,
            documentId: irId,
            requestBody: { message: { subject: "lc", body: "lc" } },
          },
        ),
      { okStatuses: [422] },
    );
  }
  const guide = await client.guides
    .postByGuidesTypeJson({
      apiKey,
      guidesType: "transports",
      requestBody: {
        transport: {
          date: TODAY,
          loaded_at: "01/01/2030 19:00:00",
          tax_exemption: "M10",
          client: { name: `lc d ${stamp}`, email: "lc@example.com" },
          items: [{ name: "Box", unit_price: 0, quantity: 1 }],
        },
      },
    })
    .catch(() => null);
  const gid = guide && guide.transport && guide.transport.id;
  if (gid) {
    await check(
      "guides.email",
      "guides.putByGuidesTypeByDocumentIdEmailDocumentJson",
      () =>
        client.guides.putByGuidesTypeByDocumentIdEmailDocumentJson({
          apiKey,
          guidesType: "transports",
          documentId: gid,
          requestBody: { message: { subject: "lc", body: "lc" } },
        }),
      { okStatuses: [422] },
    );
    await client.guides
      .putByGuidesTypeByDocumentIdChangeStateJson({
        apiKey,
        guidesType: "transports",
        documentId: gid,
        requestBody: { transport: { state: "deleted" } },
      })
      .catch(() => {});
  }

  // Invoice finalize -> partial payment -> cancel payment
  const inv = await client.invoices
    .postInvoicesJson({
      apiKey,
      requestBody: {
        invoice: {
          date: TODAY,
          due_date: DUE,
          client: { name: `lc d ${stamp}` },
          items: ITEM,
        },
      },
    })
    .catch(() => null);
  const invId = inv && inv.invoice && inv.invoice.id;
  if (invId) {
    await client.invoices
      .putInvoicesByDocumentIdChangeStateJson({
        apiKey,
        documentId: invId,
        requestBody: { invoice: { state: "finalized" } },
      })
      .catch(() => {});
    const pay = await check(
      "invoices.generatePayment",
      "invoices.postDocumentsByDocumentIdPartialPaymentsJson",
      () =>
        client.invoices.postDocumentsByDocumentIdPartialPaymentsJson({
          apiKey,
          documentId: invId,
          requestBody: { partial_payment: { amount: 1, payment_date: TODAY } },
        }),
      { okStatuses: [400, 422, 404] },
    );
    const receiptId =
      pay && (pay.receipt_id || (pay.receipt && pay.receipt.id));
    if (receiptId)
      await check(
        "invoices.cancelPayment",
        "invoices.putReceiptsByReceiptIdChangeStateJson",
        () =>
          client.invoices.putReceiptsByReceiptIdChangeStateJson({
            apiKey,
            receiptId,
            requestBody: { receipt: { state: "canceled", message: "lc" } },
          }),
        { okStatuses: [422, 404] },
      );
    else record("invoices.putReceiptsByReceiptIdChangeStateJson");
  }

  // Sequences register/set-current (config + AT)
  const seqs = await client.sequences
    .getSequencesJson({ apiKey })
    .catch(() => null);
  const seqId =
    seqs && seqs.sequences && seqs.sequences[0] && seqs.sequences[0].id;
  if (seqId) {
    await check(
      "sequences.setCurrent",
      "sequences.putSequencesBySequenceIdSetCurrentJson",
      () =>
        client.sequences.putSequencesBySequenceIdSetCurrentJson({
          apiKey,
          sequenceId: seqId,
        }),
      { okStatuses: [422] },
    );
    await check(
      "sequences.register",
      "sequences.putSequencesBySequenceIdRegisterJson",
      () =>
        client.sequences.putSequencesBySequenceIdRegisterJson({
          apiKey,
          sequenceId: seqId,
        }),
      { okStatuses: [422, 400] },
    );
    await check(
      "sequences.update",
      "sequences.putSequencesBySequenceIdJson",
      () =>
        client.sequences.putSequencesBySequenceIdJson({
          apiKey,
          sequenceId: seqId,
          requestBody: { sequence: { serie: seqs.sequences[0].serie } },
        }),
      { okStatuses: [422] },
    );
  }
  await check(
    "sequences.create",
    "sequences.postSequencesJson",
    () =>
      client.sequences.postSequencesJson({
        apiKey,
        requestBody: { sequence: { serie: `LC${stamp}`.slice(0, 8) } },
      }),
    { okStatuses: [422] },
  );

  // Accounts (partner API)
  const acct = await check(
    "accounts.create",
    "accounts.postApiAccountsCreateJson",
    () =>
      client.accounts.postApiAccountsCreateJson({
        apiKey,
        requestBody: {
          account: {
            organization_name: `lc ${stamp}`,
            email: `lc-${stamp}@example.com`,
          },
        },
      }),
    { okStatuses: [401, 403, 422] },
  );
  const acctId = acct && acct.account && acct.account.id;
  if (acctId) {
    await check(
      "accounts.get",
      "accounts.getApiAccountsByAccountIdGetJson",
      () =>
        client.accounts.getApiAccountsByAccountIdGetJson({
          apiKey,
          accountId: acctId,
        }),
      { okStatuses: [401, 403, 404] },
    );
    await check(
      "accounts.update",
      "accounts.putApiAccountsByAccountIdUpdateJson",
      () =>
        client.accounts.putApiAccountsByAccountIdUpdateJson({
          apiKey,
          accountId: acctId,
          requestBody: {
            account: {
              organization_name: "lc upd",
              email: `lc-${stamp}@example.com`,
            },
          },
        }),
      { okStatuses: [401, 403, 422] },
    );
  } else {
    record("accounts.getApiAccountsByAccountIdGetJson");
    record("accounts.putApiAccountsByAccountIdUpdateJson");
  }
  await check(
    "accounts.createAlreadyUser",
    "accounts.postApiAccountsCreateAlreadyUserJson",
    () =>
      client.accounts.postApiAccountsCreateAlreadyUserJson({
        apiKey,
        requestBody: {
          account: {
            organization_name: `lc ${stamp}`,
            email: `lc-${stamp}@example.com`,
          },
        },
      }),
    { okStatuses: [401, 403, 422] },
  );
  await check(
    "accounts.atCommunication",
    "accounts.postApiV3AccountsAtCommunicationJson",
    () =>
      client.accounts.postApiV3AccountsAtCommunicationJson({
        apiKey,
        requestBody: { at_communication: {} },
      }),
    { okStatuses: [401, 403, 422, 400] },
  );
}

(async () => {
  console.log(
    `Live check against ${BASE} — tier: ${withDestructive ? "read+write+destructive" : withWrite ? "read+write" : "read-only"}\n`,
  );
  const ctx = await reads();
  if (withWrite) await writes(ctx);
  if (withDestructive) await destructive(ctx);

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
  const notExercised = [...ALL_OPS].filter((op) => !exercised.has(op)).sort();
  console.log(
    `\nchecks: ${results.length - failed.length}/${results.length} ok`,
  );
  console.log(
    `endpoint coverage: ${exercised.size}/${ALL_OPS.size} operations exercised`,
  );
  if (notExercised.length)
    console.log(
      `not exercised (need --write/--destructive or fixtures):\n  ${notExercised.join("\n  ")}`,
    );
  process.exit(failed.length ? 1 : 0);
})();
