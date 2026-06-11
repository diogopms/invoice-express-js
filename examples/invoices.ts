/**
 * Issue a standalone invoice end-to-end and exercise everything you can do with
 * it: list with filters, create → get → update → finalize, register a partial
 * payment, inspect related documents, fetch the PDF / QR code, then cancel the
 * payment receipt it generated.
 */
import {
  client,
  getInvoicesJson,
  postInvoicesJson,
  getInvoicesByDocumentIdJson,
  putInvoicesByDocumentIdJson,
  putInvoicesByDocumentIdChangeStateJson,
  getDocumentByDocumentIdRelatedDocumentsJson,
  postDocumentsByDocumentIdPartialPaymentsJson,
  putReceiptsByReceiptIdChangeStateJson,
  getApiPdfByDocumentIdJson,
  getApiQrCodesByDocumentIdJson,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List invoices. Array filters use the `type[]` / `status[]` query keys, and
  // page / per_page / non_archived are required by this endpoint.
  const { data: list, error: listError } = await getInvoicesJson({
    query: {
      api_key,
      page: 1,
      per_page: 20,
      non_archived: true,
      "type[]": ["Invoice", "InvoiceReceipt"],
      "status[]": ["draft", "sent"],
    },
  });
  if (listError || !list) {
    console.error("list failed", listError);
    return;
  }
  console.log(`${list.pagination.total_entries} invoices found`);

  // Create a draft invoice. A client / items that don't exist yet are created
  // on the fly from the names given. Items carry their own tax here; if an item
  // has no tax you must set `tax_exemption` on the invoice instead.
  const { data: created, error: createError } = await postInvoicesJson({
    query: { api_key },
    body: {
      invoice: {
        date: "11/06/2026",
        due_date: "25/06/2026",
        client: { name: "Acme, Lda", fiscal_id: "500000000" },
        items: [
          {
            name: "Consulting",
            unit_price: 100,
            quantity: 2,
            tax: { name: "IVA23" },
          },
        ],
      },
    },
  });
  if (createError || !created?.invoice?.id) {
    console.error("create failed", createError);
    return;
  }
  const documentId = created.invoice.id;

  // Read it back, then update a field while it is still a draft.
  await getInvoicesByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
  });
  await putInvoicesByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
    body: {
      invoice: {
        date: "11/06/2026",
        due_date: "30/06/2026",
        observations: "Net 30.",
        client: { name: "Acme, Lda" },
        items: [
          {
            name: "Consulting",
            unit_price: 100,
            quantity: 2,
            tax: { name: "IVA23" },
          },
        ],
      },
    },
  });

  // Finalize it so it becomes a legal document.
  await putInvoicesByDocumentIdChangeStateJson({
    path: { "document-id": documentId },
    query: { api_key },
    body: { invoice: { state: "finalized" } },
  });

  // Register a partial payment — this generates a receipt document.
  await postDocumentsByDocumentIdPartialPaymentsJson({
    path: { "document-id": documentId },
    query: { api_key },
    body: {
      partial_payment: {
        amount: 123,
        payment_date: "11/06/2026",
        payment_mechanism: "TB",
      },
    },
  });

  // The receipt shows up under the invoice's related documents.
  const { data: related } = await getDocumentByDocumentIdRelatedDocumentsJson({
    path: { "document-id": documentId },
    query: { api_key },
  });
  const receipt = related?.invoices.find((doc) => doc.type === "Receipt");

  // Fetch the PDF and the QR code (both may return 202 while generating —
  // keep requesting until you get a 200).
  await getApiPdfByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
  });
  await getApiQrCodesByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
  });

  // Cancel the payment receipt (a reason is required).
  if (receipt) {
    await putReceiptsByReceiptIdChangeStateJson({
      path: { "receipt-id": receipt.id },
      query: { api_key },
      body: { receipt: { state: "canceled", message: "Paid by mistake." } },
    });
  }
}

main();
