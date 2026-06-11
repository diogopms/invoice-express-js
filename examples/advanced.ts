/**
 * Cross-cutting client features that aren't tied to one resource:
 *   1. request / response interceptors (middleware on every call),
 *   2. cancellation with an AbortSignal,
 *   3. exception-based flow with `throwOnError`,
 *   4. isolated clients (e.g. one per tenant) passed per call.
 */
import { client, getTaxesJson, getInvoicesJson } from "../src";
// createClient / createConfig live in the client core, not the package root.
import { createClient, createConfig } from "../src/client";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

// 1. Interceptors — inspect or mutate every request and response.
client.interceptors.request.use((request) => {
  request.headers.set("X-Trace-Id", crypto.randomUUID());
  return request;
});
client.interceptors.response.use((response) => {
  console.log("←", response.status, response.url);
  return response;
});

async function main(): Promise<void> {
  // 2. Cancellation — abort an in-flight request via an AbortSignal.
  const controller = new AbortController();
  const pending = getInvoicesJson({
    query: {
      api_key,
      page: 1,
      per_page: 50,
      non_archived: true,
      "type[]": ["Invoice"],
      "status[]": ["draft"],
    },
    signal: controller.signal,
  });
  controller.abort();
  try {
    await pending;
  } catch {
    console.log("request aborted");
  }

  // 3. throwOnError — opt into exceptions instead of the { data, error } tuple.
  try {
    const { data } = await getTaxesJson({
      query: { api_key },
      throwOnError: true,
    });
    console.log(`${data.taxes.length} taxes`);
  } catch (err) {
    console.error("request threw", err);
  }

  // 4. Isolated client — create one per tenant and pass it per call as `client`.
  const tenant = createClient(
    createConfig({ baseUrl: "https://tenant.app.invoicexpress.com" }),
  );
  await getTaxesJson({ client: tenant, query: { api_key } });
}

main();
