/**
 * Manage taxes: list → create → get → update → delete.
 *
 * NOTE: `value` is sent as a *string* ("23.0") and `region` is required (e.g.
 * "PT"); the API returns "region is empty" otherwise.
 */
import {
  client,
  getTaxesJson,
  postTaxesJson,
  getTaxesByTaxIdJson,
  putTaxesByTaxIdJson,
  deleteTaxesByTaxIdJson,
  type TaxRequest,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // List all taxes.
  const { data: list } = await getTaxesJson({ query: { api_key } });
  console.log(`${list?.taxes.length ?? 0} taxes`);

  // Create a tax.
  const newTax: TaxRequest = {
    tax: { name: "IVA13", value: "13.0", region: "PT" },
  };
  const { data: created, error } = await postTaxesJson({
    query: { api_key },
    body: newTax,
  });
  if (error || !created?.tax?.id) {
    console.error("create failed", error);
    return;
  }
  const taxId = created.tax.id;

  // Get, update, then delete it.
  await getTaxesByTaxIdJson({ path: { "tax-id": taxId }, query: { api_key } });
  const taxUpdate: TaxRequest = {
    tax: { name: "IVA13", value: "13.0", region: "PT", default_tax: false },
  };
  await putTaxesByTaxIdJson({
    path: { "tax-id": taxId },
    query: { api_key },
    body: taxUpdate,
  });
  await deleteTaxesByTaxIdJson({
    path: { "tax-id": taxId },
    query: { api_key },
  });
}

main();
