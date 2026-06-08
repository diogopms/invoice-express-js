import { createClient } from "@hey-api/openapi-ts";

async function main() {
  await createClient({
    input: "./openapi.yaml",
    output: {
      format: "prettier",
      lint: "eslint",
      path: "./src",
    },
    client: "fetch",
    name: "InvoiceExpressClient",
    useOptions: true,
  });
}

// eslint-disable-next-line no-floating-promise/no-floating-promise
main();
