/**
 * Observability and custom HTTP transport via the optional helpers exported from
 * `@diogopms/invoice-express-js/interceptors`:
 *   1. attachLogging — one-liner request/response/error logging on the client,
 *   2. composeFetch + middlewares — decorate `fetch` with logging, timeout and
 *      retry, or swap in a different HTTP client entirely.
 *
 * The interceptor helpers and the fetch decorators are independent — use either
 * or both. Interceptors see the `fetch` Request/Response after the client builds
 * them; fetch decorators wrap the transport itself.
 */
import { client, getTaxesJson } from "../src";
import {
  attachLogging,
  composeFetch,
  withLogging,
  withTimeout,
  withRetry,
  type Logger,
} from "../src/interceptors";

const api_key = "your-api-key";

// 1. Logging interceptors — `attachLogging` registers request, response AND
//    error interceptors at once and returns a disposer. `api_key` is redacted
//    from logged URLs by default.
const detach = attachLogging(client, {
  // Bring your own logger (pino/winston/console-compatible); defaults to console.
  logger: console satisfies Logger,
  level: "info",
});

// 2. Custom fetch — compose decorators left-to-right (logging is outermost, so
//    it observes the final outcome including retries) and hand the result to the
//    client. Anything matching `typeof fetch` works here, including undici or a
//    fetch backed by a proxy dispatcher.
client.setConfig({
  baseUrl: "https://your-account.app.invoicexpress.com",
  fetch: composeFetch(
    globalThis.fetch,
    withLogging(),
    withTimeout(10_000),
    withRetry({ retries: 2 }),
  ),
});

async function main(): Promise<void> {
  const { data, error } = await getTaxesJson({ query: { api_key } });
  if (error) {
    console.error("request failed", error);
    return;
  }
  console.log(`${data.taxes.length} taxes`);

  // Stop logging when you no longer need it.
  detach();
}

main();
