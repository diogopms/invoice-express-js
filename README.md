# invoice-express-js

A typed JavaScript / TypeScript client for the [InvoiceXpress](https://invoicexpress.com/) API.

The client is generated from an OpenAPI specification with [`@hey-api/openapi-ts`](https://heyapi.dev/) and ships with full TypeScript types for every request and response.

- 📦 Single client class exposing every resource (`clients`, `invoices`, `invoicesReceipts`, `items`, `taxes`, `saft`)
- 🟦 First-class TypeScript types for request payloads and responses
- 🔁 Request / response interceptors
- ⏹️ Cancelable requests
- 🌐 Built on `fetch` — no runtime dependencies

> **Status:** early stage. A subset of the InvoiceXpress API is implemented — see [Operations implemented](#operations-implemented).

## Installation

This package is published to the **GitHub Packages** registry under the `@diogopms` scope. Tell your package manager where to find the scope by adding the following to a `.npmrc` file at the root of your project:

```ini
@diogopms:registry=https://npm.pkg.github.com
```

Installing from GitHub Packages requires authentication — follow GitHub's guide on [authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

Then install:

```bash
npm install @diogopms/invoice-express-js
# or
pnpm add @diogopms/invoice-express-js
# or
yarn add @diogopms/invoice-express-js
```

## Quick start

```ts
import { InvoiceExpressClient } from "@diogopms/invoice-express-js";

// Your account name is the subdomain of your InvoiceXpress URL:
// https://<account-name>.app.invoicexpress.com
const client = new InvoiceExpressClient({
  BASE: "https://your-account.app.invoicexpress.com",
});

const apiKey = "your-api-key";

const { clients, pagination } = await client.clients.getClientsJson({
  apiKey,
  page: 1,
  perPage: 10,
});

console.log(`${pagination.total_entries} clients found`);
console.log(clients);
```

## Authentication

InvoiceXpress authenticates every request with an **API key** passed as a query parameter. With this client, you pass your `apiKey` to each method call:

```ts
await client.taxes.getTaxesJson({ apiKey: "your-api-key" });
```

You can find your API key in your InvoiceXpress account under **Account Settings → API**.

## Configuration

The constructor accepts a partial configuration object. Only `BASE` is typically required.

```ts
const client = new InvoiceExpressClient({
  BASE: "https://your-account.app.invoicexpress.com", // required: your account URL
  VERSION: "1.0.0",
  HEADERS: { "X-Custom-Header": "value" },
  WITH_CREDENTIALS: false,
  CREDENTIALS: "include", // "include" | "omit" | "same-origin"
  ENCODE_PATH: encodeURIComponent,
});
```

| Option             | Type                                                  | Default                                          | Description                                  |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `BASE`             | `string`                                              | `https://account_name.app.invoicexpress.com`     | Base URL of your InvoiceXpress account.      |
| `VERSION`          | `string`                                              | `1.0.0`                                          | API version.                                 |
| `HEADERS`          | `Record<string, string>` or resolver                  | `undefined`                                      | Extra headers sent with every request.       |
| `WITH_CREDENTIALS` | `boolean`                                             | `false`                                          | Whether to send credentials with the request.|
| `CREDENTIALS`      | `"include" \| "omit" \| "same-origin"`                | `"include"`                                      | `fetch` credentials mode.                    |
| `ENCODE_PATH`      | `(path: string) => string`                            | `undefined`                                      | Custom path-encoding function.               |

## Usage

The client exposes one property per resource. Every method takes a single `data` object and returns a `CancelablePromise` resolving to a typed response.

### Clients

```ts
// List clients (paginated)
const list = await client.clients.getClientsJson({ apiKey, page: 1, perPage: 20 });

// Get a client by ID
const { client: found } = await client.clients.getClientsByClientIdJson({
  apiKey,
  clientId: 12345,
});

// Find by name / code
await client.clients.getClientsFindByNameJson({ apiKey, clientName: "Acme, Lda" });
await client.clients.getClientsFindByCodeJson({ apiKey, clientCode: 1001 });

// Create a client
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

// List a client's invoices
await client.clients.postClientsByClientIdInvoicesJson({
  apiKey,
  clientId: 12345,
  requestBody: { filter: { status: ["draft", "sent"] } },
});
```

### Invoices

```ts
const invoices = await client.invoices.getInvoicesJson({
  apiKey,
  page: 1,
  perPage: 20,
  nonArchived: true,
  typeArray: ["Invoice", "InvoiceReceipt"],
  statusArray: ["draft", "sent"],
});
```

### Invoice receipts

```ts
// Create an invoice receipt
const receipt = await client.invoicesReceipts.postInvoiceReceiptsJson({
  apiKey,
  requestBody: {
    invoice_receipt: {
      date: "08/06/2026",
      due_date: "08/06/2026",
      status: "draft",
      client: { name: "Acme, Lda", code: "ACME" },
      items: [{ name: "Consulting", unit_price: 100, quantity: 2 }],
    },
  },
});

const documentId = receipt.invoice_receipts!.id;

// Get a document
await client.invoicesReceipts.getInvoiceReceiptsByDocumentIdJson({ apiKey, documentId });

// Change its state (e.g. finalize)
await client.invoicesReceipts.putInvoiceReceiptsByDocumentIdChangeStateJson({
  apiKey,
  documentId,
  requestBody: { invoice_receipt: { state: "finalized" } },
});

// Send by email
await client.invoicesReceipts.putInvoiceReceiptsByDocumentIdEmailDocumentJson({
  apiKey,
  documentId,
  requestBody: { message: { subject: "Your invoice", body: "Thank you!" } },
});

// Generate the PDF (poll until it resolves to a 200)
await client.invoicesReceipts.getApiPdfByDocumentIdJson({ apiKey, documentId });
```

### Items & taxes

```ts
await client.items.getItemsJson({ apiKey });
await client.items.getItemsByItemIdJson({ apiKey, itemId: 999 });

await client.taxes.getTaxesJson({ apiKey });
await client.taxes.getTaxesByTaxIdJson({ apiKey, taxId: 42 });
```

### SAF-T export

```ts
// Returns { url } once ready, or { message } while still generating — keep polling.
const saft = await client.saft.getApiExportSaftJson({ apiKey, month: "6", years: "2026" });
```

## Error handling

Failed requests throw an `ApiError` containing the HTTP status and response body.

```ts
import { ApiError } from "@diogopms/invoice-express-js";

try {
  await client.clients.getClientsByClientIdJson({ apiKey, clientId: 0 });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status); // e.g. 404
    console.error(error.statusText);
    console.error(error.body); // raw response body
  } else {
    throw error;
  }
}
```

## Interceptors

Register middleware to inspect or mutate every request and response. Interceptors run in registration order.

```ts
// Mutate the outgoing fetch RequestInit
client.request.config.interceptors.request.use((req) => {
  req.headers = { ...req.headers, "X-Trace-Id": crypto.randomUUID() };
  return req;
});

// Inspect the raw Response
client.request.config.interceptors.response.use((res) => {
  console.log("←", res.status, res.url);
  return res;
});
```

## Cancellation

Every method returns a `CancelablePromise`, so in-flight requests can be aborted.

```ts
const promise = client.invoices.getInvoicesJson({ apiKey, page: 1, perPage: 50, nonArchived: true, typeArray: ["Invoice"], statusArray: ["draft"] });

// later…
promise.cancel();
```

## TypeScript

All request and response shapes are exported, so you can type your own helpers:

```ts
import type { Client, Invoice, ClientRequest, InvoicesResponse } from "@diogopms/invoice-express-js";
```

## Operations implemented

| API Section      | Operation                  | Status          |
|------------------|----------------------------|-----------------|
| **Invoices**     | Send by email              | ✅ |
|                  | Generate PDF               | ✅ |
|                  | Get                        | ✅ |
|                  | List all                   | ✅ |
|                  | Create                     | ✅ |
|                  | Update                     | ✅ |
|                  | Change-state               | ✅ |
|                  | Related documents          | ✅ |
|                  | Generate payment           | ✅ |
|                  | Cancel payment             | Not Implemented |
|                  | Get QR Code                | Not Implemented |
| **Estimates**    | Send by email              | Not Implemented |
|                  | Generate PDF               | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Change-state               | Not Implemented |
| **Guides**       | Send by email              | Not Implemented |
|                  | Generate PDF               | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Change-state               | Not Implemented |
|                  | Get QR Code                | Not Implemented |
| **Clients**      | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | ✅ |
|                  | Create                     | ✅ |
|                  | Find by name               | ✅ |
|                  | Find by code               | ✅ |
|                  | List invoices              | ✅ |
| **Items**        | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | ✅ |
|                  | Create                     | ✅ |
|                  | Delete                     | ✅ |
| **Sequences**    | Register                   | Not Implemented |
|                  | List all                   | Not Implemented |
|                  | Get                        | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
| **Taxes**        | List all                   | ✅ |
|                  | Get                        | ✅ |
|                  | Update                     | ✅ |
|                  | Create                     | ✅ |
|                  | Delete                     | ✅ |
| **Accounts**     | Get                        | Not Implemented |
|                  | Update                     | Not Implemented |
|                  | Create                     | Not Implemented |
|                  | Create for existing user   | Not Implemented |
|                  | At Communication           | Not Implemented |
| **SAF-T**        | Export SAF-T               | ✅ |
| **Treasury**     | Get client balance         | Not Implemented |
|                  | Update initial balance     | Not Implemented |
|                  | Get regularization         | Not Implemented |
|                  | Create regularization      | Not Implemented |
|                  | Delete regularization      | Not Implemented |
|                  | Create treasury movement   | Not Implemented |
|                  | Delete treasury movement   | Not Implemented |

## Development

The client is generated from [`openapi.yaml`](./openapi.yaml). To regenerate the sources and build the package:

```bash
pnpm install
pnpm run generate   # regenerate ./src from openapi.yaml
pnpm run build      # compile TypeScript to ./dist
```

To add or change operations, edit `openapi.yaml` and re-run `pnpm run generate`. Do not hand-edit the generated `*.gen.ts` files or the `src/core/` directory — your changes will be overwritten.

## Roadmap

- [ ] Add tests
- [ ] Add an `examples/` folder
- [ ] Implement more operations (Estimates, Guides, Sequences, Accounts, Treasury)

## License

[ISC](./LICENSE)
