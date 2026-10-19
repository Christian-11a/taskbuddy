// Re-copies the app's legal text into the site. Read-only on mobile/.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "..", "mobile", "src", "lib", "legalText.ts");
const target = resolve(root, "src", "lib", "legalText.ts");
const header =
  "// Copied from mobile/src/lib/legalText.ts by scripts/sync-legal-text.mjs: do not edit by hand\n";

writeFileSync(target, header + readFileSync(source, "utf8"));
console.log(`Synced ${source} -> ${target}`);
