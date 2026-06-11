/**
 * Export a SAF-T file for a given month. Generation is asynchronous: the
 * endpoint returns HTTP 202 with a `message` while the file is still being
 * built, and HTTP 200 with a download `url` once it is ready — so you poll
 * until you get the url.
 */
import { client, getApiExportSaftJson } from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // Request the SAF-T for June 2026, polling until it resolves to a 200 + url.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error, response } = await getApiExportSaftJson({
      query: { api_key, month: "6", years: "2026" },
    });
    if (error) {
      console.error("export failed", error);
      return;
    }
    if (response?.status === 200 && data && "url" in data) {
      console.log("SAF-T ready:", data.url);
      return;
    }
    console.log("still generating, retrying…");
    await sleep(3000);
  }
  console.error("timed out waiting for the SAF-T file");
}

main();
