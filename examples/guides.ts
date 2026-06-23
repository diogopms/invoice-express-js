/**
 * Guides (shippings, transports, devolutions). The `{guides-type}` path segment
 * picks the type and the body / response are wrapped under the matching singular
 * key: shippings → `shipping`, transports → `transport`, devolutions → `devolution`.
 *
 * This issues a transport guide: list → create → get → finalize → email.
 */
import {
  client,
  getGuidesJson,
  postByGuidesTypeJson,
  getByGuidesTypeByDocumentIdJson,
  putByGuidesTypeByDocumentIdChangeStateJson,
  putByGuidesTypeByDocumentIdEmailDocumentJson,
  type GuideRequest,
  type GuideStateRequest,
  type PutByGuidesTypeByDocumentIdEmailDocumentJsonData,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List guides (filter with `type[]` / `status[]`).
  const { data: list } = await getGuidesJson({
    query: { api_key, page: 1, per_page: 20, "type[]": ["Transport"] },
  });
  console.log(`${list?.pagination.total_entries ?? 0} guides found`);

  // Create a draft transport guide. `loaded_at` is a date-time; goods with no
  // tax need a `tax_exemption` code (e.g. "M10").
  const newTransport: GuideRequest = {
    transport: {
      date: "11/06/2026",
      loaded_at: "11/06/2026 19:00:00",
      tax_exemption: "M10",
      address_from: {
        detail: "Rua A, 1",
        city: "Lisboa",
        postal_code: "1000-001",
      },
      address_to: {
        detail: "Rua B, 2",
        city: "Porto",
        postal_code: "4000-002",
      },
      client: { name: "Acme, Lda" },
      items: [{ name: "Pallet", unit_price: 0, quantity: 3 }],
    },
  };
  const { data: created, error } = await postByGuidesTypeJson({
    path: { "guides-type": "transports" },
    query: { api_key },
    body: newTransport,
  });
  if (error || created === undefined || !("transport" in created)) {
    console.error("create failed", error);
    return;
  }
  const documentId = created.transport.id;

  // Read it back.
  await getByGuidesTypeByDocumentIdJson({
    path: { "guides-type": "transports", "document-id": documentId },
    query: { api_key },
  });

  // NOTE: updating a guide (putByGuidesTypeByDocumentIdJson) currently returns
  // HTTP 500 for every guide type — a known InvoiceXpress server-side bug — so
  // it is intentionally not shown here.

  // Finalize it, then email it to the client.
  const finalize: GuideStateRequest = { transport: { state: "finalized" } };
  await putByGuidesTypeByDocumentIdChangeStateJson({
    path: { "guides-type": "transports", "document-id": documentId },
    query: { api_key },
    body: finalize,
  });
  const email: PutByGuidesTypeByDocumentIdEmailDocumentJsonData["body"] = {
    message: { subject: "Your transport guide", body: "Attached." },
  };
  await putByGuidesTypeByDocumentIdEmailDocumentJson({
    path: { "guides-type": "transports", "document-id": documentId },
    query: { api_key },
    body: email,
  });
}

main();
