import { createClient } from "@hey-api/openapi-ts";
import { execSync } from "node:child_process";

await createClient({
  input: "./openapi.yaml",
  output: { path: "./src" },
  plugins: [
    { name: "@hey-api/client-fetch", exportFromIndex: true },
    "@hey-api/sdk",
    "@hey-api/typescript",
  ],
});

// hey-api's built-in prettier post-processor spawns `prettier` from PATH (not
// available here); format the output ourselves instead.
execSync("pnpm exec prettier --write ./src", { stdio: "inherit" });
