# Examples

Runnable, type-checked usage examples for `@diogopms/invoice-express-js`.

| File                                         | Shows                                                         |
| -------------------------------------------- | ------------------------------------------------------------- |
| [`quickstart.ts`](./quickstart.ts)           | Construct the client, list and create clients, handle errors. |
| [`invoice-receipt.ts`](./invoice-receipt.ts) | Issue an invoice receipt: create → finalize → email → PDF.    |

These import the client from `../src` so they are type-checked against the
generated types in CI (`pnpm run typecheck:examples`). Replace `BASE` with your
account URL and `apiKey` with your API key before running one for real.
