/**
 * Quickstart: configure the client and read/create clients.
 *
 * The SDK is a set of standalone functions that return `{ data, error }`
 * (they do not throw on HTTP errors). Configure the shared `client` once with
 * your account URL; pass your API key as the `api_key` query parameter.
 */
import { client, getClientsJson, postClientsJson } from "../src";

// Your account name is the subdomain of your InvoiceXpress URL:
// https://<account-name>.app.invoicexpress.com
client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List clients (paginated).
  const { data, error } = await getClientsJson({
    query: { api_key, page: 1, per_page: 10 },
  });
  if (error) {
    console.error("request failed", error);
    return;
  }
  console.log(`${data.pagination.total_entries} clients found`);
  console.log(data.clients);

  // Create a client. If the fiscal_id / name already exists InvoiceXpress
  // returns the existing record instead of creating a duplicate.
  const created = await postClientsJson({
    query: { api_key },
    body: {
      client: {
        name: "Acme, Lda",
        email: "billing@acme.example",
        fiscal_id: "500000000",
      },
    },
  });
  console.log("created client", created.data?.client?.id);
}

main();
