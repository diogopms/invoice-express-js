# Examples

Runnable, type-checked usage examples for `@diogopms/invoice-express-js`.

| File                                         | Shows                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| [`quickstart.ts`](./quickstart.ts)           | Construct the client, list and create clients, handle errors.              |
| [`clients.ts`](./clients.ts)                 | Find a client by name / code / id, update it, list its invoices.           |
| [`invoice-receipt.ts`](./invoice-receipt.ts) | Issue an invoice receipt: create → finalize → email → PDF.                 |
| [`invoices.ts`](./invoices.ts)               | Invoice lifecycle: list, create → update → finalize, payment, PDF/QR, cancel. |
| [`estimates.ts`](./estimates.ts)             | Quotes/proformas/fee notes: create → update → finalize → email.            |
| [`guides.ts`](./guides.ts)                   | Transport/shipping/devolution guides: create → finalize → email.           |
| [`items.ts`](./items.ts)                     | Catalog items: list, create, get, update, delete.                          |
| [`taxes.ts`](./taxes.ts)                     | Taxes: list, create, get, update, delete.                                  |
| [`sequences.ts`](./sequences.ts)             | Numbering sequences: create, get, register, set current.                   |
| [`treasury.ts`](./treasury.ts)               | Client balance, initial balance, regularizations, treasury movements.      |
| [`accounts.ts`](./accounts.ts)               | Partner Accounts API: create, get, update, AT communication.               |
| [`saft.ts`](./saft.ts)                       | Export a SAF-T file, polling until the download URL is ready.              |
| [`advanced.ts`](./advanced.ts)               | Interceptors, AbortSignal cancellation, `throwOnError`, isolated clients.  |
| [`logging-and-fetch.ts`](./logging-and-fetch.ts) | `attachLogging` + composable `fetch` decorators (logging, timeout, retry). |

These import the client from `../src` so they are type-checked against the
generated types in CI (`pnpm run typecheck:examples`). Replace `BASE` with your
account URL and `apiKey` with your API key before running one for real.

Each request body is declared as an explicitly-typed constant so you can see the
exact shape an endpoint expects at a glance — named request types where one
exists (e.g. `InvoiceRequest`, `ClientRequest`, `TaxRequest`), or the per-operation
indexed type for inline bodies (e.g.
`PutInvoicesByDocumentIdChangeStateJsonData["body"]`). All of these types are
exported from the package root, so you can import and reuse them in your own code.
The annotations are optional in practice — the SDK functions already infer and
check the body type — but they make the examples self-documenting.
