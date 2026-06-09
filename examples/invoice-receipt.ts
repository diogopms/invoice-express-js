/**
 * Issue an invoice receipt end-to-end: create it as a draft, finalize it,
 * email it to the client, and fetch the PDF.
 */
import {
  client,
  postInvoiceReceiptsJson,
  getInvoiceReceiptsByDocumentIdJson,
  putInvoiceReceiptsByDocumentIdChangeStateJson,
  putInvoiceReceiptsByDocumentIdEmailDocumentJson,
  getApiPdfByDocumentIdJson,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // Create the invoice receipt (draft). A client and items that don't exist
  // yet are created on the fly from the names provided.
  const { data, error } = await postInvoiceReceiptsJson({
    query: { api_key },
    body: {
      invoice_receipt: {
        date: "09/06/2026",
        due_date: "09/06/2026",
        status: "draft",
        client: { name: "Acme, Lda" },
        items: [{ name: "Consulting", unit_price: 100, quantity: 2 }],
      },
    },
  });
  if (error || !data?.invoice_receipt?.id) {
    console.error("create failed", error);
    return;
  }
  const documentId = data.invoice_receipt.id;

  // Finalize it so it becomes a legal document.
  await putInvoiceReceiptsByDocumentIdChangeStateJson({
    path: { "document-id": documentId },
    query: { api_key },
    body: { invoice_receipt: { state: "finalized" } },
  });

  // Email it to the client.
  await putInvoiceReceiptsByDocumentIdEmailDocumentJson({
    path: { "document-id": documentId },
    query: { api_key },
    body: { message: { subject: "Your invoice", body: "Thank you!" } },
  });

  // Fetch it back, then generate the PDF (poll until it resolves to a 200).
  await getInvoiceReceiptsByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
  });
  const pdf = await getApiPdfByDocumentIdJson({
    path: { "document-id": documentId },
    query: { api_key },
  });
  console.log(pdf.data);
}

main();
