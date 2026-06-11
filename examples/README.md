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

These import the client from `../src` so they are type-checked against the
generated types in CI (`pnpm run typecheck:examples`). Replace `BASE` with your
account URL and `apiKey` with your API key before running one for real.
