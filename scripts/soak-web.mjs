import { spawn } from "node:child_process";
import { chromium } from "playwright";

const durationMinutes = Number(process.env.SOAK_MINUTES ?? "20");
const durationMs = durationMinutes * 60_000;
const origin = "http://127.0.0.1:4173";
const server = spawn("npm", ["run", "preview"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch { /* server is still starting */ }
  await sleep(250);
}

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-precise-memory-info"] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const routes = ["long-march", "conic", "membrane"];
const pages = [];
const failures = [];

for (const route of routes) {
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && failures.push(`${route}: ${message.text()}`));
  page.on("pageerror", (error) => failures.push(`${route}: ${error.message}`));
  await page.goto(`${origin}/#/${route}`);
  pages.push([route, page]);
}

await sleep(5000);
const heap = async (page) => page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
const initial = Object.fromEntries(await Promise.all(pages.map(async ([route, page]) => [route, await heap(page)])));
const deadline = Date.now() + durationMs;
let step = 0;

while (Date.now() < deadline) {
  const historyIndex = step % 10;
  await pages[0][1].locator(`[data-node="${historyIndex}"]`).click();
  await pages[1][1].locator("#cv-beta").fill(String((step * 7) % 91));
  await pages[2][1].locator("#outside-concentration").fill(String((step * 11) % 101));
  await pages[2][1].locator("#inside-concentration").fill(String((step * 17) % 101));
  step += 1;
  await sleep(10_000);
}

const final = Object.fromEntries(await Promise.all(pages.map(async ([route, page]) => [route, await heap(page)])));
for (const route of routes) {
  const growthMiB = (final[route] - initial[route]) / 1024 / 1024;
  console.log(`${route}: ${(initial[route] / 1024 / 1024).toFixed(1)} → ${(final[route] / 1024 / 1024).toFixed(1)} MiB (${growthMiB >= 0 ? "+" : ""}${growthMiB.toFixed(1)})`);
  if (growthMiB > 80) failures.push(`${route}: heap grew by ${growthMiB.toFixed(1)} MiB`);
}

await browser.close();
server.kill("SIGTERM");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`web soak passed: three cases ran concurrently for ${durationMinutes} minutes`);
process.exit(0);
