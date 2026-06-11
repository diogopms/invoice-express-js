/**
 * Work with clients: look one up by id / name / code, update it, and list the
 * documents issued to it. (Listing and creating clients is in `quickstart.ts`.)
 */
import {
  client,
  getClientsByClientIdJson,
  putClientsByClientIdJson,
  getClientsFindByNameJson,
  getClientsFindByCodeJson,
  postClientsByClientIdInvoicesJson,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // Find a client by name (exact match). Returns the single matching record.
  const { data: byName } = await getClientsFindByNameJson({
    query: { api_key, client_name: "Acme, Lda" },
  });
  const clientId = Number(byName?.client?.id);
  if (!clientId) {
    console.error("client not found");
    return;
  }

  // Or look one up by its code, or by id directly.
  await getClientsFindByCodeJson({ query: { api_key, client_code: 12345 } });
  const { data: fetched, error } = await getClientsByClientIdJson({
    path: { "client-id": clientId },
    query: { api_key },
  });
  if (error) {
    console.error("get failed", error);
    return;
  }
  console.log("client", fetched?.client?.name);

  // Update a few fields. Only the keys you send are changed.
  await putClientsByClientIdJson({
    path: { "client-id": clientId },
    query: { api_key },
    body: {
      client: {
        name: "Acme, Lda",
        email: "accounts@acme.example",
        phone: "+351 210 000 000",
      },
    },
  });

  // List the invoices issued to this client (optionally filtered by status/type).
  const { data: invoices } = await postClientsByClientIdInvoicesJson({
    path: { "client-id": clientId },
    query: { api_key, page: 1, per_page: 20 },
    body: { filter: { status: ["draft", "sent"] } },
  });
  console.log(`${invoices?.pagination.total_entries ?? 0} invoices for client`);
}

main();
