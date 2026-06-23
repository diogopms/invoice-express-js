/**
 * Partner / reseller Accounts API: create a sub-account (for a brand-new user or
 * an existing one), read and update it, and submit its Tax Authority (AT)
 * communication credentials.
 *
 * These endpoints require a partner API key. Created accounts cannot be deleted
 * via the API, so run this against a disposable setup only.
 */
import {
  client,
  postApiAccountsCreateJson,
  postApiAccountsCreateAlreadyUserJson,
  getApiAccountsByAccountIdGetJson,
  putApiAccountsByAccountIdUpdateJson,
  postApiV3AccountsAtCommunicationJson,
  type AccountRequest,
  type AtCommunicationRequest,
} from "../src";

client.setConfig({ baseUrl: "https://your-account.app.invoicexpress.com" });

const api_key = "your-api-key";

async function main(): Promise<void> {
  // Create an account for a new user (a password is required in this case).
  const newAccount: AccountRequest = {
    account: {
      organization_name: "Acme, Lda",
      email: "ada@acme.example",
      first_name: "Ada",
      last_name: "Lovelace",
      password: "set-a-strong-password",
      tax_country: "PT",
      language: "pt",
      terms: "1",
    },
  };
  const { data: created, error } = await postApiAccountsCreateJson({
    query: { api_key },
    body: newAccount,
  });
  if (error || !created?.account?.id) {
    console.error("create failed", error);
    return;
  }
  const accountId = created.account.id;

  // Create an account for a user that already exists (no password needed).
  const existingUserAccount: AccountRequest = {
    account: {
      organization_name: "Beta, Lda",
      email: "ada@acme.example",
      tax_country: "PT",
    },
  };
  await postApiAccountsCreateAlreadyUserJson({
    query: { api_key },
    body: existingUserAccount,
  });

  // Read and update the account.
  await getApiAccountsByAccountIdGetJson({
    path: { "account-id": accountId },
    query: { api_key },
  });
  const accountUpdate: AccountRequest = {
    account: {
      organization_name: "Acme, Lda",
      email: "billing@acme.example",
    },
  };
  await putApiAccountsByAccountIdUpdateJson({
    path: { "account-id": accountId },
    query: { api_key },
    body: accountUpdate,
  });

  // Submit the account's AT (Tax Authority) communication credentials.
  const atCommunication: AtCommunicationRequest = {
    at_communication: { login: "500000000/1", password: "at-password" },
  };
  await postApiV3AccountsAtCommunicationJson({
    query: { api_key },
    body: atCommunication,
  });
}

main();
