/**
 * Quickstart: construct the client and read/create clients.
 *
 * Run your own copy after building the package, or use it as a reference.
 * Replace BASE with your account URL and `apiKey` with your API key.
 */
import { InvoiceExpressClient, ApiError } from "../src";

const client = new InvoiceExpressClient({
  // Your account name is the subdomain of your InvoiceXpress URL:
  // https://<account-name>.app.invoicexpress.com
  BASE: "https://your-account.app.invoicexpress.com",
});

const apiKey = "your-api-key";

async function main(): Promise<void> {
  // List clients (paginated).
  const { clients, pagination } = await client.clients.getClientsJson({
    apiKey,
    page: 1,
    perPage: 10,
  });
  console.log(`${pagination.total_entries} clients found`);
  console.log(clients);

  // Create a client. If the fiscal_id / name already exists InvoiceXpress
  // returns the existing record instead of creating a duplicate.
  const created = await client.clients.postClientsJson({
    apiKey,
    requestBody: {
      client: {
        name: "Acme, Lda",
        email: "billing@acme.example",
        fiscal_id: "500000000",
      },
    },
  });
  console.log("created client", created.client?.id);
}

main().catch((error: unknown) => {
  // Failed requests throw an ApiError carrying the HTTP status and body.
  if (error instanceof ApiError) {
    console.error(error.status, error.statusText, error.body);
  } else {
    throw error;
  }
});
