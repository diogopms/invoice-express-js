/**
 * Issue an invoice receipt end-to-end: create it as a draft, finalize it,
 * email it to the client, and fetch the PDF.
 */
import { InvoiceExpressClient } from "../src";

const client = new InvoiceExpressClient({
  BASE: "https://your-account.app.invoicexpress.com",
});

const apiKey = "your-api-key";

async function main(): Promise<void> {
  // Create the invoice receipt (draft). A client and items that don't exist
  // yet are created on the fly from the names/codes provided.
  const receipt = await client.invoicesReceipts.postInvoiceReceiptsJson({
    apiKey,
    requestBody: {
      invoice_receipt: {
        date: "09/06/2026",
        due_date: "09/06/2026",
        status: "draft",
        client: { name: "Acme, Lda" },
        items: [{ name: "Consulting", unit_price: 100, quantity: 2 }],
      },
    },
  });

  const documentId = receipt.invoice_receipt!.id;

  // Finalize it so it becomes a legal document.
  await client.invoicesReceipts.putInvoiceReceiptsByDocumentIdChangeStateJson({
    apiKey,
    documentId,
    requestBody: { invoice_receipt: { state: "finalized" } },
  });

  // Email it to the client.
  await client.invoicesReceipts.putInvoiceReceiptsByDocumentIdEmailDocumentJson(
    {
      apiKey,
      documentId,
      requestBody: { message: { subject: "Your invoice", body: "Thank you!" } },
    },
  );

  // Generate the PDF. The endpoint returns 202 while the PDF is still being
  // built, so poll until it resolves to a 200 in a real integration.
  const pdf = await client.invoicesReceipts.getApiPdfByDocumentIdJson({
    apiKey,
    documentId,
  });
  console.log(pdf);
}

main().catch((error: unknown) => {
  throw error;
});
