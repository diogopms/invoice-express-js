# invoice-express-js

[![CI](https://github.com/diogopms/invoice-express-js/actions/workflows/ci.yaml/badge.svg)](https://github.com/diogopms/invoice-express-js/actions/workflows/ci.yaml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
![runtime deps: 0](https://img.shields.io/badge/runtime%20deps-0-success)

A typed JavaScript / TypeScript client for the [InvoiceXpress](https://invoicexpress.com/) API.

The client is generated from an OpenAPI specification with [`@hey-api/openapi-ts`](https://heyapi.dev/) and ships with full TypeScript types for every request and response.

- 📦 A tree-shakeable **function per operation** for every resource (clients, invoices, invoice receipts, estimates, guides, sequences, accounts, treasury, items, taxes, SAF-T)
- 🟦 First-class TypeScript types for request payloads and responses
- 🟩 Results returned as `{ data, error }` — no `try/catch` required
- 🔁 Request / response / error interceptors and `AbortSignal` cancellation
- 🪵 Optional logging + `fetch` decorator helpers (timeout, retry, custom client)
- 🌐 Built on `fetch` — no runtime dependencies

> **Status:** every documented InvoiceXpress operation is implemented and verified live against the API — see [Operations implemented](#operations-implemented). (One known server-side caveat: guide update; see the note there.)
>
> **v2** moved from a class-based client to a generated **functional SDK** — see [Quick start](#quick-start). For the previous API, pin `^1`.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [Usage](#usage)
- [Error handling](#error-handling)
- [Interceptors](#interceptors)
- [Logging & custom HTTP client](#logging--custom-http-client)
- [Cancellation](#cancellation)
- [TypeScript](#typescript)
- [Operations implemented](#operations-implemented)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## Installation

This package is published to **two registries** under the `@diogopms` scope — the public **npm registry** and **GitHub Packages**. Install from whichever you prefer.

### From npm (recommended)

The public npm registry needs no extra configuration:

```bash
npm install @diogopms/invoice-express-js
# or
pnpm add @diogopms/invoice-express-js
# or
yarn add @diogopms/invoice-express-js
```

### From GitHub Packages

Alternatively, install from GitHub Packages. Point the `@diogopms` scope at the registry by adding the following to a `.npmrc` file at the root of your project:

```ini
@diogopms:registry=https://npm.pkg.github.com
```

Installing from GitHub Packages requires authentication — follow GitHub's guide on [authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages). Then install with any of the commands above.

## Quick start

```ts
import { client, getClientsJson } from "@diogopms/invoice-express-js";

// Configure the shared client once. Your account name is the subdomain of your
// InvoiceXpress URL: https://<account-name>.app.invoicexpress.com
client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

const { data, error } = await getClientsJson({
  query: { api_key, page: 1, per_page: 10 },
});

if (error) throw error;
console.log(`${data.pagination.total_entries} clients found`);
console.log(data.clients);
```

Every operation is a standalone function that takes a single options object
(`{ query, path, body }`) and returns `{ data, error, request, response }` — it
**does not throw** on HTTP errors; check `error` instead.

## Authentication

InvoiceXpress authenticates every request with an **API key** sent as the
`api_key` query parameter. Pass it in `query` on each call:

```ts
await getTaxesJson({ query: { api_key: "your-api-key" } });
```

You can find your API key in your InvoiceXpress account under **Account Settings → API**.

## Configuration

Configure the shared `client` with `client.setConfig(...)` (only `baseUrl` is
typically required). Anything `fetch` accepts can be set here, plus a custom
`fetch` implementation.

```ts
import { client } from "@diogopms/invoice-express-js";

client.setConfig({
  baseUrl: "https://your-account.app.invoicexpress.com", // required: your account URL
  headers: { "X-Custom-Header": "value" },
  credentials: "include", // "include" | "omit" | "same-origin"
  // fetch: myFetch, // optional custom fetch (used by the test suite)
});
```

Need isolated clients (e.g. per tenant)? Create your own and pass it per call as
`{ client: myClient }`:

```ts
import { createClient, createConfig, getTaxesJson } from "@diogopms/invoice-express-js";

const tenant = createClient(
  createConfig({ baseUrl: "https://tenant.app.invoicexpress.com" }),
);
await getTaxesJson({ client: tenant, query: { api_key } });
```

## Usage

Each operation is a function named after its HTTP method + path. Calls follow a
uniform shape — `query` for query params (always including `api_key`), `path`
for path params, `body` for the request body:

### Clients

```ts
import {
  getClientsJson,
  getClientsByClientIdJson,
  getClientsFindByNameJson,
  postClientsJson,
} from "@diogopms/invoice-express-js";

await getClientsJson({ query: { api_key, page: 1, per_page: 20 } });
await getClientsByClientIdJson({
  path: { "client-id": 12345 },
  query: { api_key },
});
await getClientsFindByNameJson({ query: { api_key, client_name: "Acme, Lda" } });

const { data } = await postClientsJson({
  query: { api_key },
  body: {
    client: {
      name: "Acme, Lda",
      email: "billing@acme.example",
      fiscal_id: "500000000",
    },
  },
});
```

### Invoices & invoice receipts

Array filters use `type[]` / `status[]` query keys. Documents are addressed by
`document-id`.

```ts
await getInvoicesJson({
  query: {
    api_key,
    page: 1,
    per_page: 20,
    non_archived: true,
    "type[]": ["Invoice", "InvoiceReceipt"],
    "status[]": ["draft", "sent"],
  },
});

// Create a draft invoice receipt, finalize it, email it, fetch the PDF / QR code
const receipt = await postInvoiceReceiptsJson({
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
const documentId = receipt.data!.invoice_receipt!.id;

await putInvoiceReceiptsByDocumentIdChangeStateJson({
  path: { "document-id": documentId },
  query: { api_key },
  body: { invoice_receipt: { state: "finalized" } },
});
await getApiPdfByDocumentIdJson({ path: { "document-id": documentId }, query: { api_key } }); // poll until 200
await getApiQrCodesByDocumentIdJson({ path: { "document-id": documentId }, query: { api_key } });

// Generate / cancel a payment
await postDocumentsByDocumentIdPartialPaymentsJson({
  path: { "document-id": documentId },
  query: { api_key },
  body: { partial_payment: { amount: 50, payment_date: "09/06/2026" } },
});
await putReceiptsByReceiptIdChangeStateJson({
  path: { "receipt-id": 67890 },
  query: { api_key },
  body: { receipt: { state: "canceled", message: "Wrong values." } },
});
```

### Estimates & guides

The `{estimates-type}` / `{guides-type}` path segment picks the document type;
the body/response is wrapped under the matching singular key.

```ts
// estimates: quotes | proformas | fees_notes   (key: quote | proforma | fees_note)
const quote = await postByEstimatesTypeJson({
  path: { "estimates-type": "quotes" },
  query: { api_key },
  body: {
    quote: {
      date: "09/06/2026",
      due_date: "23/06/2026",
      client: { name: "Acme, Lda" },
      items: [{ name: "Consulting", unit_price: 100, quantity: 1 }],
    },
  },
});
await putByEstimatesTypeByDocumentIdChangeStateJson({
  path: { "estimates-type": "quotes", "document-id": quote.data!.quote!.id },
  query: { api_key },
  body: { quote: { state: "finalized" } },
});

// guides: shippings | transports | devolutions   (key: shipping | transport | devolution)
await postByGuidesTypeJson({
  path: { "guides-type": "transports" },
  query: { api_key },
  body: {
    transport: {
      date: "09/06/2026",
      loaded_at: "09/06/2026 19:00:00",
      tax_exemption: "M10",
      client: { name: "Acme, Lda" },
      items: [{ name: "Pallet", unit_price: 0, quantity: 3 }],
    },
  },
});
```

### Sequences, items & taxes

```ts
// Sequences
const seq = await postSequencesJson({
  query: { api_key },
  body: { sequence: { serie: "2026", default_sequence: "1" } },
});
await putSequencesBySequenceIdSetCurrentJson({
  path: { "sequence-id": seq.data!.sequence!.id },
  query: { api_key },
});

// Items — NOTE: unit_price must be a string ("100"); a number is rejected with a 422
const item = await postItemsJson({
  query: { api_key },
  body: { item: { name: "Consulting", unit_price: "100", tax: { name: "IVA23" } } },
});
await deleteItemsByItemIdJson({ path: { "item-id": item.data!.item!.id }, query: { api_key } });

// Taxes — value is a string ("23.0") and region is required
await postTaxesJson({
  query: { api_key },
  body: { tax: { name: "IVA23", value: "23.0", region: "PT" } },
});
```

### Treasury

```ts
const clientId = 12345;
await getApiV3ClientsByClientIdBalanceJson({ path: { "client-id": clientId }, query: { api_key } });
await putApiV3ClientsByClientIdInitialBalanceJson({
  path: { "client-id": clientId },
  query: { api_key },
  body: { initial_balance: { value: 250, date: "2026-01-01" } },
});
await postApiV3ClientsByClientIdRegularizationJson({
  path: { "client-id": clientId },
  query: { api_key },
  body: { regularization: { value: 123.45, date: "2026-06-09" } },
});
await postApiV3ClientsByClientIdTreasuryMovementsJson({
  path: { "client-id": clientId },
  query: { api_key },
  body: { treasury_movement: { value: 100, movement_type: "Payment", date: "2026-06-09" } },
});
```

### Accounts & SAF-T

```ts
// Accounts (partner/reseller API)
await postApiAccountsCreateJson({
  query: { api_key },
  body: { account: { organization_name: "Acme, Lda", email: "ada@acme.example" } },
});

// SAF-T export — returns { url } once ready, or { message } while still generating; keep polling
await getApiExportSaftJson({ query: { api_key, month: "6", years: "2026" } });
```

## Error handling

Operations **do not throw** on HTTP errors. Each call resolves to
`{ data, error, request, response }`: on success `data` is set and `error` is
`undefined`; on an error status `data` is `undefined` and `error` holds the typed
response body.

```ts
const { data, error, response } = await getClientsByClientIdJson({
  path: { "client-id": 0 },
  query: { api_key },
});

if (error) {
  console.error(response.status, error); // e.g. 404, { error: "..." }
} else {
  console.log(data.client);
}
```

Prefer exceptions? Pass `throwOnError: true` to make a call throw instead:

```ts
const { data } = await getTaxesJson({ query: { api_key }, throwOnError: true });
```

## Interceptors

Register middleware on the shared `client` to inspect or mutate every request and
response. Interceptors receive the `fetch` `Request` / `Response`.

```ts
import { client } from "@diogopms/invoice-express-js";

client.interceptors.request.use((request) => {
  request.headers.set("X-Trace-Id", crypto.randomUUID());
  return request;
});

client.interceptors.response.use((response) => {
  console.log("←", response.status, response.url);
  return response;
});

// Errors (network failures, non-2xx when throwing) run through error interceptors.
client.interceptors.error.use((error, response, request) => {
  console.error("✗", request?.url, response?.status, error);
  return error; // return the (possibly transformed) error
});
```

Each `.use(...)` returns an id you can pass to `.eject(id)` to remove the
interceptor later.

## Logging & custom HTTP client

For common cross-cutting needs there's an optional helper module,
`@diogopms/invoice-express-js/interceptors`. It's a thin, dependency-free layer
over the interceptor and `fetch` hooks above — use it, or wire those hooks
yourself.

**Logging** — `attachLogging` registers request, response and error
interceptors in one call (with timing, and `api_key` redacted from logged URLs)
and returns a disposer:

```ts
import { client } from "@diogopms/invoice-express-js";
import { attachLogging } from "@diogopms/invoice-express-js/interceptors";

const detach = attachLogging(client, { logger: console, level: "info" });
// ...later: detach();
```

Pass any `{ info, warn, error, debug? }` logger (pino, winston, …). Need the raw
interceptors instead? `createLoggingInterceptors(options)` returns
`{ onRequest, onResponse, onError }`.

**Custom HTTP client / fetch decorators** — the client accepts any
`fetch`-compatible function via `setConfig({ fetch })`. `composeFetch` stacks
decorators (applied left-to-right, so the first is the outermost wrapper);
`withLogging`, `withTimeout` and `withRetry` are included:

```ts
import { client } from "@diogopms/invoice-express-js";
import {
  composeFetch, withLogging, withTimeout, withRetry,
} from "@diogopms/invoice-express-js/interceptors";

client.setConfig({
  baseUrl: "https://your-account.app.invoicexpress.com",
  fetch: composeFetch(
    globalThis.fetch,
    withLogging(),
    withTimeout(10_000),
    withRetry({ retries: 2 }), // conservative: idempotent 5xx + 429 only
  ),
});
```

Write your own decorator with the `FetchMiddleware` type — `(next) => (input,
init) => Promise<Response>` — or pass a different base client (e.g. `undici`'s
`fetch`, or one bound to a proxy dispatcher) as the first `composeFetch`
argument. See [`examples/logging-and-fetch.ts`](./examples/logging-and-fetch.ts).

## Cancellation

Pass an `AbortSignal` to cancel an in-flight request:

```ts
const controller = new AbortController();

const promise = getInvoicesJson({
  query: { api_key, page: 1, per_page: 50, non_archived: true },
  signal: controller.signal,
});

controller.abort(); // later…
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

Every operation below is implemented and was verified live against an
InvoiceXpress account (see [`scripts/live-check.cjs`](./scripts/live-check.cjs)).

> **Known server-side issue:** updating a guide
> (`PUT /{guides-type}/{document-id}.json`, i.e.
> `guides.putByGuidesTypeByDocumentIdJson`) returns **HTTP 500** for every guide
> type (shippings, transports, devolutions) — even with the exact body that
> `create` accepts. Create / get / change-state all work, so this is an
> InvoiceXpress-side bug, not a client one. The method is shipped for when the
> API is fixed.

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

### Releases

Merging to `main` does **not** cut a release — pushes only run CI. A scheduled
workflow ([`release.yaml`](./.github/workflows/release.yaml)) runs **every 4
hours**: it derives the next version from the commits since the last tag and,
only if there is something new, it

1. creates and pushes the git **tag**,
2. **publishes** the package to both the public npm registry and GitHub Packages, and
3. cuts a **GitHub Release** with the auto-generated changelog.

You can also trigger a release on demand from the Actions tab
(`workflow_dispatch`).

### Testing

The suite under [`test/`](./test) uses Node's built-in test runner (no extra
dependencies) and runs with `pnpm run test`:

- **Smoke** ([`smoke.test.js`](./test/smoke.test.js)) — builds the package and
  asserts it exports a configurable `client` plus a representative operation for
  every resource, guarding against the generator dropping or renaming an
  operation.
- **End-to-end** ([`e2e.test.js`](./test/e2e.test.js)) — drives the SDK through
  its full request pipeline (URL building, query params, JSON body, interceptors
  and the `{ data, error }` result model) against a `fetch` injected via
  `client.setConfig`, so the whole stack is exercised without network access or
  account credentials.
- **Interceptors** ([`interceptors.test.js`](./test/interceptors.test.js)) —
  covers the optional logging helpers and `fetch` decorators (`composeFetch`,
  `withLogging`, `withTimeout`, `withRetry`) against fake transports.

### Live verification

[`scripts/live-check.cjs`](./scripts/live-check.cjs) drives the **built client
against a real account** and reports coverage across every generated operation
(`operation coverage: N/61`). The API key is passed as a **command-line
argument** — never read from an environment variable, a file, or source
control, and nothing is persisted.

```bash
pnpm run build
# read-only (lists + get-by-id + find-by across every resource)
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com
# + reversible create/update/delete cycles that clean up after themselves
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com --write
# + full document lifecycles: finalize, PDF/QR, payments, cancel receipt/invoice,
#   guides, emails, sequences — run only against a disposable/test account
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com --destructive
# + the partner Accounts API (creates a NON-deletable sub-account)
pnpm run test:live <api-key> https://your-account.app.invoicexpress.com --destructive --accounts
```

The `--destructive` tier exercises 56/61 operations end to end (the remaining 5
are the Accounts ops behind `--accounts`). It also documents two server-side
quirks it works around: deleting a treasury movement returns a 500 even though
the deletion is applied, and a document a deleted movement had touched can stay
"paid" and uncancelable.

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
