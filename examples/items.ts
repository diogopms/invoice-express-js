/**
 * Manage reusable catalog items: list → create → get → update → delete.
 *
 * NOTE: the /items.json endpoint expects `unit_price` as a *string* ("100"); a
 * numeric value is rejected with a 422 "unit price is not valid" error. (Items
 * embedded in a document body use a numeric `unit_price` — only this endpoint
 * differs.)
 */
import {
  client,
  getItemsJson,
  postItemsJson,
  getItemsByItemIdJson,
  putItemsByItemIdJson,
  deleteItemsByItemIdJson,
  type ItemRequest,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

// The id of an existing item — copy it from the InvoiceXpress UI or a list call.
const itemId = 12345;

async function main(): Promise<void> {
  // List all items.
  const { data: list } = await getItemsJson({ query: { api_key } });
  console.log(`${list?.items.length ?? 0} items`);

  // Create an item.
  const newItem: ItemRequest = {
    item: {
      name: "Consulting",
      description: "Hourly consulting",
      unit_price: "100", // string — see the note above
      unit: "hour",
      tax: { name: "IVA23" },
    },
  };
  const { data: created, error } = await postItemsJson({
    query: { api_key },
    body: newItem,
  });
  if (error) {
    console.error("create failed", error);
    return;
  }
  console.log("created item", created?.item?.name);

  // Get, update, then delete an existing item by id.
  await getItemsByItemIdJson({
    path: { "item-id": itemId },
    query: { api_key },
  });
  const itemUpdate: ItemRequest = {
    item: { name: "Consulting", unit_price: "120" },
  };
  await putItemsByItemIdJson({
    path: { "item-id": itemId },
    query: { api_key },
    body: itemUpdate,
  });
  await deleteItemsByItemIdJson({
    path: { "item-id": itemId },
    query: { api_key },
  });
}

main();
