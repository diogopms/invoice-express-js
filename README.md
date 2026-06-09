# invoice-express-js

A typed JavaScript / TypeScript client for the [InvoiceXpress](https://invoicexpress.com/) API.

The client is generated from an OpenAPI specification with [`@hey-api/openapi-ts`](https://heyapi.dev/) and ships with full TypeScript types for every request and response.

- 📦 Single client class exposing every resource (`clients`, `invoices`, `invoicesReceipts`, `estimates`, `guides`, `sequences`, `accounts`, `treasury`, `items`, `taxes`, `saft`)
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

| Option             | Type                                   | Default                                      | Description                                   |
| ------------------ | -------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `BASE`             | `string`                               | `https://account_name.app.invoicexpress.com` | Base URL of your InvoiceXpress account.       |
| `VERSION`          | `string`                               | `1.0.0`                                      | API version.                                  |
| `HEADERS`          | `Record<string, string>` or resolver   | `undefined`                                  | Extra headers sent with every request.        |
| `WITH_CREDENTIALS` | `boolean`                              | `false`                                      | Whether to send credentials with the request. |
| `CREDENTIALS`      | `"include" \| "omit" \| "same-origin"` | `"include"`                                  | `fetch` credentials mode.                     |
| `ENCODE_PATH`      | `(path: string) => string`             | `undefined`                                  | Custom path-encoding function.                |

## Usage

The client exposes one property per resource. Every method takes a single `data` object and returns a `CancelablePromise` resolving to a typed response.

### Clients

```ts
// List clients (paginated)
const list = await client.clients.getClientsJson({
  apiKey,
  page: 1,
  perPage: 20,
});

// Get a client by ID
const { client: found } = await client.clients.getClientsByClientIdJson({
  apiKey,
  clientId: 12345,
});

// Find by name / code
await client.clients.getClientsFindByNameJson({
  apiKey,
  clientName: "Acme, Lda",
});
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

// Cancel a payment (cancels the receipt generated for a partial payment)
await client.invoices.putReceiptsByReceiptIdChangeStateJson({
  apiKey,
  receiptId: 67890,
  requestBody: {
    receipt: { state: "canceled", message: "Wrong payment values." },
  },
});

// Get a document's QR code (shared endpoint — works for invoices too)
await client.guides.getApiQrCodesByDocumentIdJson({
  apiKey,
  documentId: 12345,
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
await client.invoicesReceipts.getInvoiceReceiptsByDocumentIdJson({
  apiKey,
  documentId,
});

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

### Estimates

Estimates cover quotes, proformas and fees notes. The `estimatesType` path
segment selects the document type, and the request/response body is wrapped under
the matching singular key (`quote`, `proforma` or `fees_note`).

```ts
// Create a quote
const created = await client.estimates.postByEstimatesTypeJson({
  apiKey,
  estimatesType: "quotes",
  requestBody: {
    quote: {
      date: "09/06/2026",
      due_date: "23/06/2026",
      client: { name: "Acme, Lda", code: "ACME" },
      items: [{ name: "Consulting", unit_price: 100, quantity: 2 }],
    },
  },
});

const documentId = created.quote!.id;

// Get / update
await client.estimates.getByEstimatesTypeByDocumentIdJson({
  apiKey,
  estimatesType: "quotes",
  documentId,
});
await client.estimates.putByEstimatesTypeByDocumentIdJson({
  apiKey,
  estimatesType: "quotes",
  documentId,
  requestBody: {
    quote: {
      date: "09/06/2026",
      due_date: "30/06/2026",
      client: { name: "Acme, Lda" },
      items: [],
    },
  },
});

// Finalize, then email
await client.estimates.putByEstimatesTypeByDocumentIdChangeStateJson({
  apiKey,
  estimatesType: "quotes",
  documentId,
  requestBody: { quote: { state: "finalized" } },
});
await client.estimates.putByEstimatesTypeByDocumentIdEmailDocumentJson({
  apiKey,
  estimatesType: "quotes",
  documentId,
  requestBody: { message: { subject: "Your quote", body: "Thank you!" } },
});

// List all estimates (paginated)
await client.estimates.getEstimatesJson({ apiKey, page: 1, perPage: 20 });

// Generate the PDF (shared endpoint — poll until it resolves to a 200)
await client.invoicesReceipts.getApiPdfByDocumentIdJson({ apiKey, documentId });
```

### Guides

Guides cover shippings, transports and devolutions (transport documents). The
`guidesType` path segment selects the document type, and the request/response
body is wrapped under the matching singular key (`shipping`, `transport` or
`devolution`).

```ts
// Create a transport guide
const created = await client.guides.postByGuidesTypeJson({
  apiKey,
  guidesType: "transports",
  requestBody: {
    transport: {
      date: "09/06/2026",
      loaded_at: "09/06/2026 19:00:00",
      tax_exemption: "M10",
      address_from: {
        detail: "Rua A, 1",
        city: "Lisboa",
        postal_code: "1000-001",
        country: "Portugal",
      },
      address_to: {
        detail: "Rua B, 2",
        city: "Porto",
        postal_code: "4000-002",
        country: "Portugal",
      },
      client: { name: "Acme, Lda", code: "ACME" },
      items: [{ name: "Pallet", unit_price: 0, quantity: 3 }],
    },
  },
});

const documentId = created.transport!.id;

// Get / update
await client.guides.getByGuidesTypeByDocumentIdJson({
  apiKey,
  guidesType: "transports",
  documentId,
});

// Finalize, then email
await client.guides.putByGuidesTypeByDocumentIdChangeStateJson({
  apiKey,
  guidesType: "transports",
  documentId,
  requestBody: { transport: { state: "finalized" } },
});
await client.guides.putByGuidesTypeByDocumentIdEmailDocumentJson({
  apiKey,
  guidesType: "transports",
  documentId,
  requestBody: {
    message: { subject: "Your transport guide", body: "In transit." },
  },
});

// List all guides (paginated)
await client.guides.getGuidesJson({ apiKey, page: 1, perPage: 20 });

// QR code and PDF (shared endpoints — poll the PDF until it resolves to a 200)
await client.guides.getApiQrCodesByDocumentIdJson({ apiKey, documentId });
await client.invoicesReceipts.getApiPdfByDocumentIdJson({ apiKey, documentId });
```

### Sequences

Document numbering sequences. Create a sequence, set it as the account's current
one, and register it with the Tax Authority.

```ts
// Create a sequence
const created = await client.sequences.postSequencesJson({
  apiKey,
  requestBody: { sequence: { serie: "2026", default_sequence: "1" } },
});

const sequenceId = created.sequence!.id;

// List / get
await client.sequences.getSequencesJson({ apiKey });
await client.sequences.getSequencesBySequenceIdJson({ apiKey, sequenceId });

// Set as current, then register with the Tax Authority
await client.sequences.putSequencesBySequenceIdSetCurrentJson({
  apiKey,
  sequenceId,
});
await client.sequences.putSequencesBySequenceIdRegisterJson({
  apiKey,
  sequenceId,
});
```

### Items & taxes

```ts
await client.items.getItemsJson({ apiKey });
await client.items.getItemsByItemIdJson({ apiKey, itemId: 999 });

// Create / update / delete. NOTE: the items endpoint requires `unit_price` as a
// string (e.g. "100") — a numeric value is rejected by the API with a 422.
const item = await client.items.postItemsJson({
  apiKey,
  requestBody: {
    item: { name: "Consulting", unit_price: "100", tax: { name: "IVA23" } },
  },
});
await client.items.putItemsByItemIdJson({
  apiKey,
  itemId: item.item!.id,
  requestBody: { item: { name: "Consulting (senior)", unit_price: "150" } },
});
await client.items.deleteItemsByItemIdJson({ apiKey, itemId: item.item!.id });

await client.taxes.getTaxesJson({ apiKey });
await client.taxes.getTaxesByTaxIdJson({ apiKey, taxId: 42 });
```

### Accounts

Partner/reseller operations for managing accounts. Create an account (with a new
or existing user), fetch and update it, and submit the AT communication.

```ts
// Create an account
const created = await client.accounts.postApiAccountsCreateJson({
  apiKey,
  requestBody: {
    account: {
      organization_name: "Acme, Lda",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@acme.example",
      password: "s3cret!",
      fiscal_id: "500000000",
      tax_country: "PT",
      language: "pt",
      terms: "1",
    },
  },
});

const accountId = created.account!.id;

// Get / update
await client.accounts.getApiAccountsByAccountIdGetJson({ apiKey, accountId });
await client.accounts.putApiAccountsByAccountIdUpdateJson({
  apiKey,
  accountId,
  requestBody: {
    account: { organization_name: "Acme II, Lda", email: "ada@acme.example" },
  },
});

// Submit the AT (Tax Authority) communication
await client.accounts.postApiV3AccountsAtCommunicationJson({
  apiKey,
  requestBody: {
    at_communication: { login: "at-login", password: "at-password" },
  },
});
```

### Treasury

Per-client treasury operations: read the balance, set the initial balance, and
manage regularizations and treasury movements.

```ts
const clientId = 12345;

// Balance
await client.treasury.getApiV3ClientsByClientIdBalanceJson({
  apiKey,
  clientId,
});
await client.treasury.putApiV3ClientsByClientIdInitialBalanceJson({
  apiKey,
  clientId,
  requestBody: { value: 250.0, date: "2026-01-01" },
});

// Regularizations
await client.treasury.getApiV3ClientsByClientIdRegularizationJson({
  apiKey,
  clientId,
});
const reg = await client.treasury.postApiV3ClientsByClientIdRegularizationJson({
  apiKey,
  clientId,
  requestBody: { regularization: { value: 123.45, date: "2026-06-09" } },
});
await client.treasury.deleteApiV3ClientsByClientIdRegularizationByIdJson({
  apiKey,
  clientId,
  id: reg.regularization![0].id,
});

// Treasury movements
const mov =
  await client.treasury.postApiV3ClientsByClientIdTreasuryMovementsJson({
    apiKey,
    clientId,
    requestBody: {
      treasury_movement: {
        value: 100,
        movement_type: "Payment",
        date: "2026-06-09",
      },
    },
  });
await client.treasury.deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson({
  apiKey,
  clientId,
  id: mov.treasury_movement!.id!,
});
```

### SAF-T export

```ts
// Returns { url } once ready, or { message } while still generating — keep polling.
const saft = await client.saft.getApiExportSaftJson({
  apiKey,
  month: "6",
  years: "2026",
});
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
const promise = client.invoices.getInvoicesJson({
  apiKey,
  page: 1,
  perPage: 50,
  nonArchived: true,
  typeArray: ["Invoice"],
  statusArray: ["draft"],
});

// later…
promise.cancel();
```

## TypeScript

All request and response shapes are exported, so you can type your own helpers:

```ts
import type {
  Client,
  Invoice,
  ClientRequest,
  InvoicesResponse,
} from "@diogopms/invoice-express-js";
```

## Operations implemented

| API Section   | Operation                | Status |
| ------------- | ------------------------ | ------ |
| **Invoices**  | Send by email            | ✅     |
|               | Generate PDF             | ✅     |
|               | Get                      | ✅     |
|               | List all                 | ✅     |
|               | Create                   | ✅     |
|               | Update                   | ✅     |
|               | Change-state             | ✅     |
|               | Related documents        | ✅     |
|               | Generate payment         | ✅     |
|               | Cancel payment           | ✅     |
|               | Get QR Code              | ✅     |
| **Estimates** | Send by email            | ✅     |
|               | Generate PDF             | ✅     |
|               | Get                      | ✅     |
|               | List all                 | ✅     |
|               | Create                   | ✅     |
|               | Update                   | ✅     |
|               | Change-state             | ✅     |
| **Guides**    | Send by email            | ✅     |
|               | Generate PDF             | ✅     |
|               | Get                      | ✅     |
|               | List all                 | ✅     |
|               | Create                   | ✅     |
|               | Update                   | ✅     |
|               | Change-state             | ✅     |
|               | Get QR Code              | ✅     |
| **Clients**   | List all                 | ✅     |
|               | Get                      | ✅     |
|               | Update                   | ✅     |
|               | Create                   | ✅     |
|               | Find by name             | ✅     |
|               | Find by code             | ✅     |
|               | List invoices            | ✅     |
| **Items**     | List all                 | ✅     |
|               | Get                      | ✅     |
|               | Update                   | ✅     |
|               | Create                   | ✅     |
|               | Delete                   | ✅     |
| **Sequences** | Register                 | ✅     |
|               | List all                 | ✅     |
|               | Get                      | ✅     |
|               | Create                   | ✅     |
|               | Set current              | ✅     |
| **Taxes**     | List all                 | ✅     |
|               | Get                      | ✅     |
|               | Update                   | ✅     |
|               | Create                   | ✅     |
|               | Delete                   | ✅     |
| **Accounts**  | Get                      | ✅     |
|               | Update                   | ✅     |
|               | Create                   | ✅     |
|               | Create for existing user | ✅     |
|               | At Communication         | ✅     |
| **SAF-T**     | Export SAF-T             | ✅     |
| **Treasury**  | Get client balance       | ✅     |
|               | Update initial balance   | ✅     |
|               | Get regularization       | ✅     |
|               | Create regularization    | ✅     |
|               | Delete regularization    | ✅     |
|               | Create treasury movement | ✅     |
|               | Delete treasury movement | ✅     |

## Development

The client is generated from [`openapi.yaml`](./openapi.yaml). To regenerate the sources and build the package:

```bash
pnpm install
pnpm run generate        # regenerate ./src from openapi.yaml
pnpm run build           # compile TypeScript to ./dist
```

To add or change operations, edit `openapi.yaml` and re-run `pnpm run generate`. Do not hand-edit the generated `*.gen.ts` files or the `src/core/` directory — your changes will be overwritten.

The full set of scripts:

| Script                        | Purpose                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `pnpm run generate`           | Regenerate `./src` from `openapi.yaml`.                                |
| `pnpm run generate:check`     | Regenerate and fail if the committed client drifts from the spec (CI). |
| `pnpm run build`              | Compile TypeScript to `./dist`.                                        |
| `pnpm run typecheck`          | Type-check without emitting.                                           |
| `pnpm run typecheck:examples` | Type-check the `examples/` against the client.                         |
| `pnpm run test`               | Build, then run the smoke tests (`node --test`).                       |
| `pnpm run test:live`          | Build, then run the live verification against a real account.          |
| `pnpm run lint`               | Check formatting with Prettier.                                        |
| `pnpm run format`             | Apply Prettier formatting.                                             |

CI runs `lint`, `generate:check`, `typecheck`, `typecheck:examples`, `build` and `test` on every pull request, so a spec edit that isn't accompanied by a regenerated client will fail the build.

### Testing

The suite under [`test/`](./test) uses Node's built-in test runner (no extra
dependencies) and runs with `pnpm run test`:

- **Smoke** ([`smoke.test.js`](./test/smoke.test.js)) — builds the package and
  asserts the client exposes every resource service plus a representative
  operation per service, guarding against the generator silently dropping or
  renaming an operation.
- **End-to-end** ([`e2e.test.js`](./test/e2e.test.js)) — drives the client
  through its full request pipeline (URL building, query params, JSON body,
  interceptors and `ApiError` mapping) against a mocked `fetch` transport, so the
  whole stack is exercised without network access or account credentials.

### Live verification

[`scripts/live-check.cjs`](./scripts/live-check.cjs) drives the **built client
against a real account** and reports coverage across every generated operation
(`exercised N/62`). The API key is passed as a **command-line argument** — never
read from an environment variable, a file, or source control, and nothing is
persisted.

```bash
pnpm run build
# read-only (lists + get-by-id across every resource)
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com
# + reversible create/update/delete cycles that clean up after themselves
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com --write
# + side-effecting ops (finalize, email, payments, sequence register/set-current,
#   accounts, AT communication) — run only against a disposable/test account
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com --destructive
```

### Examples

Runnable, type-checked usage examples live in [`examples/`](./examples) — see its
[README](./examples/README.md). They import the client from `../src`, so
`pnpm run typecheck:examples` validates them against the generated types in CI.

## Roadmap

- [x] Add tests
- [x] Add an `examples/` folder
- [x] Implement all documented operations

## License

[ISC](./LICENSE)
