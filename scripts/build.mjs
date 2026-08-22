import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

const keyPath = resolve(".tauri/signing-key");

if (!existsSync(keyPath)) {
  console.error(`Signing key not found at ${keyPath}`);
  console.error("Run: npx tauri signer generate -w .tauri/signing-key --ci -f");
  process.exit(1);
}

const privateKey = readFileSync(keyPath, "utf-8").trim();

execSync("npx tauri build", {
  stdio: "inherit",
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  },
});
