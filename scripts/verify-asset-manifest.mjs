import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync("assets/manifest.json", "utf8"));
const failures = [];

for (const entry of manifest.assets) {
  if (entry.storage !== "repository") continue;
  const path = resolve(entry.path);
  let actual;
  try {
    if (!statSync(path).isFile()) throw new Error("not a file");
    actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch (error) {
    failures.push(`${entry.id}: missing (${String(error)})`);
    continue;
  }
  if (actual !== entry.sha256) failures.push(`${entry.id}: sha256 ${actual} != ${entry.sha256}`);
  if (!entry.source || !entry.license || entry.redistributable !== true) failures.push(`${entry.id}: incomplete public license record`);
}

if (failures.length) {
  console.error(`asset manifest verification failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`asset manifest verification passed: ${manifest.assets.length} records`);
