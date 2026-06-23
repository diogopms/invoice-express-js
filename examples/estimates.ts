/**
 * Estimates (quotes, proformas, fee notes). The `{estimates-type}` path segment
 * picks the document type and the body / response are wrapped under the matching
 * singular key: quotes → `quote`, proformas → `proforma`, fees_notes → `fees_note`.
 *
 * This issues a quote: list → create → get → update → finalize → email.
 */
import {
  client,
  getEstimatesJson,
  postByEstimatesTypeJson,
  getByEstimatesTypeByDocumentIdJson,
  putByEstimatesTypeByDocumentIdJson,
  putByEstimatesTypeByDocumentIdChangeStateJson,
  putByEstimatesTypeByDocumentIdEmailDocumentJson,
  type EstimateRequest,
  type EstimateStateRequest,
  type PutByEstimatesTypeByDocumentIdEmailDocumentJsonData,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List estimates across all types (filter with `type[]` / `status[]`).
  const { data: list } = await getEstimatesJson({
    query: {
      api_key,
      page: 1,
      per_page: 20,
      "type[]": ["Quote", "Proforma"],
    },
  });
  console.log(`${list?.pagination.total_entries ?? 0} estimates found`);

  // Create a draft quote.
  const newQuote: EstimateRequest = {
    quote: {
      date: "11/06/2026",
      due_date: "25/06/2026",
      client: { name: "Acme, Lda" },
      items: [
        {
          name: "Consulting",
          unit_price: 100,
          quantity: 1,
          tax: { name: "IVA23" },
        },
      ],
    },
  };
  const { data: created, error } = await postByEstimatesTypeJson({
    path: { "estimates-type": "quotes" },
    query: { api_key },
    body: newQuote,
  });
  if (error || created === undefined || !("quote" in created)) {
    console.error("create failed", error);
    return;
  }
  const documentId = created.quote.id;

  // Read it back, then update it while still a draft.
  await getByEstimatesTypeByDocumentIdJson({
    path: { "estimates-type": "quotes", "document-id": documentId },
    query: { api_key },
  });
  const quoteUpdate: EstimateRequest = {
    quote: {
      date: "11/06/2026",
      due_date: "30/06/2026",
      reference: "Q-2026-001",
      client: { name: "Acme, Lda" },
      items: [
        {
          name: "Consulting",
          unit_price: 120,
          quantity: 1,
          tax: { name: "IVA23" },
        },
      ],
    },
  };
  await putByEstimatesTypeByDocumentIdJson({
    path: { "estimates-type": "quotes", "document-id": documentId },
    query: { api_key },
    body: quoteUpdate,
  });

  // Finalize it, then email it to the client.
  const finalize: EstimateStateRequest = { quote: { state: "finalized" } };
  await putByEstimatesTypeByDocumentIdChangeStateJson({
    path: { "estimates-type": "quotes", "document-id": documentId },
    query: { api_key },
    body: finalize,
  });
  const email: PutByEstimatesTypeByDocumentIdEmailDocumentJsonData["body"] = {
    message: { subject: "Your quote", body: "Please find it attached." },
  };
  await putByEstimatesTypeByDocumentIdEmailDocumentJson({
    path: { "estimates-type": "quotes", "document-id": documentId },
    query: { api_key },
    body: email,
  });
}

main();
