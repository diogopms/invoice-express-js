/**
 * Treasury operations for a client: read the balance, set an initial balance,
 * create / list / delete regularizations, and create / delete treasury movements.
 *
 * Dates here use the YYYY-MM-DD format (document dates elsewhere use dd/mm/yyyy).
 */
import {
  client,
  getApiV3ClientsByClientIdBalanceJson,
  putApiV3ClientsByClientIdInitialBalanceJson,
  getApiV3ClientsByClientIdRegularizationJson,
  postApiV3ClientsByClientIdRegularizationJson,
  deleteApiV3ClientsByClientIdRegularizationByIdJson,
  postApiV3ClientsByClientIdTreasuryMovementsJson,
  deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

// The id of an existing client — copy it from the InvoiceXpress UI or a list call.
const clientId = 12345;

async function main(): Promise<void> {
  // Read the current balance.
  const { data: balance } = await getApiV3ClientsByClientIdBalanceJson({
    path: { "client-id": clientId },
    query: { api_key },
  });
  console.log("balance", balance?.balance);

  // Set the client's initial balance.
  await putApiV3ClientsByClientIdInitialBalanceJson({
    path: { "client-id": clientId },
    query: { api_key },
    body: { initial_balance: { value: 250, date: "2026-01-01" } },
  });

  // Create a regularization, then list and delete it.
  const { data: reg, error } =
    await postApiV3ClientsByClientIdRegularizationJson({
      path: { "client-id": clientId },
      query: { api_key },
      body: {
        regularization: {
          value: 123.45,
          date: "2026-06-11",
          observation: "Adjust",
        },
      },
    });
  if (error) {
    console.error("regularization failed", error);
    return;
  }
  const regId = reg?.regularization?.[0]?.id;

  await getApiV3ClientsByClientIdRegularizationJson({
    path: { "client-id": clientId },
    query: { api_key },
  });
  if (regId) {
    await deleteApiV3ClientsByClientIdRegularizationByIdJson({
      path: { "client-id": clientId, id: regId },
      query: { api_key },
    });
  }

  // Create a treasury movement, then delete it. NOTE: the delete call returns
  // HTTP 500 even though the movement is actually removed — an InvoiceXpress
  // server-side quirk; treat that 500 as success here.
  const { data: movement } =
    await postApiV3ClientsByClientIdTreasuryMovementsJson({
      path: { "client-id": clientId },
      query: { api_key },
      body: {
        treasury_movement: {
          value: 100,
          movement_type: "Payment",
          payment_method: "TB",
          date: "2026-06-11",
        },
      },
    });
  const movementId = movement?.treasury_movement?.id;
  if (movementId) {
    await deleteApiV3ClientsByClientIdTreasuryMovementsByIdJson({
      path: { "client-id": clientId, id: movementId },
      query: { api_key },
    });
  }
}

main();
