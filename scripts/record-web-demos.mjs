import { spawn, spawnSync } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const project = resolve(".");
const media = resolve("public/media");
const temp = resolve(".cache/video-recordings");
const stepMs = Number(process.env.VIDEO_STEP_MS ?? 5000);
const demoFilter = process.env.DEMO_FILTER;
const port = Number(process.env.PORT ?? 4188);
const origin = `http://127.0.0.1:${port}`;
await mkdir(media, { recursive: true });
await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: project, stdio: "ignore" });
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(origin);
    if (response.ok) break;
  } catch { /* server is still starting */ }
  await wait(250);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const scenarios = [
  {
    name: "long-march-demo",
    route: "long-march",
    run: async (page) => {
      for (let index = 0; index < 10; index += 1) {
        await page.locator(`[data-node="${index}"]`).click();
        await wait(stepMs);
      }
      await wait(stepMs * 2);
    },
  },
  {
    name: "conic-demo",
    route: "conic",
    run: async (page) => {
      const beta = page.locator("#cv-beta");
      const set = async (locator, value) => { await locator.fill(String(value)); await locator.dispatchEvent("input"); await wait(stepMs); };
      await page.evaluate(() => localStorage.removeItem("ai3d-inquiry:conic"));
      await page.locator(".iq-option").first().click();
      await page.locator('[data-iq="lock"]').click();
      for (const value of [90, 75, 62, 45, 34, 31]) await set(beta, value);
      await page.locator('[data-preset="critical"]').click();
      await wait(stepMs * 2);
      for (const value of [29, 20, 12]) await set(beta, value);
      await set(beta, 62);
      for (const name of ["spheres", "foci", "point"]) { await page.locator(`[data-toggle="${name}"]`).click(); await wait(stepMs / 2); }
      const u = page.locator("#cv-u");
      for (const value of [0.1, 0.3, 0.5, 0.7, 0.9]) await set(u, value);
      await page.locator("#cv-look").click();
      await wait(stepMs * 2);
    },
  },
  {
    name: "membrane-demo",
    route: "membrane",
    run: async (page) => {
      const steps = [
        ["diffusion", 80, 20, 0, false], ["diffusion", 50, 50, 0, false],
        ["facilitated", 80, 20, 0, false], ["facilitated", 80, 20, 4, false],
        ["facilitated", 80, 20, 8, false], ["active", 80, 20, 4, false],
        ["active", 80, 20, 4, true], ["active", 60, 40, 6, true],
        ["active", 20, 80, 6, true], ["diffusion", 20, 80, 0, false],
        ["facilitated", 20, 80, 5, false], ["active", 75, 25, 4, true],
      ];
      for (const [mode, outside, inside, channels, atp] of steps) {
        await page.selectOption("#transport-mode", String(mode));
        await page.locator("#outside-concentration").fill(String(outside));
        await page.locator("#inside-concentration").fill(String(inside));
        await page.locator("#channel-count").fill(String(channels));
        await page.locator("#atp-toggle").setChecked(Boolean(atp));
        await page.locator("#inside-concentration").dispatchEvent("input");
        await wait(stepMs);
      }
    },
  },
];

// 语言实验室案例：依次点每个预设，再悬停图例让 3D 高亮，录成备用录像。
const langLabs = ["embedding", "next-token", "compiler", "poem", "preposition", "gravity", "molecule", "dna", "geo"];
for (const route of langLabs) {
  scenarios.push({
    name: `${route}-demo`,
    route,
    run: async (page) => {
      const variants = page.locator("[data-variant]");
      const count = await variants.count();
      for (let index = 0; index < count; index += 1) {
        await variants.nth(index).click();
        await wait(stepMs);
      }
      const roles = page.locator(".lang-legend [data-role]");
      for (let index = 0; index < Math.min(await roles.count(), 3); index += 1) {
        await roles.nth(index).hover();
        await wait(stepMs / 2);
      }
    },
  });
}

for (const scenario of scenarios.filter((entry) => !demoFilter || entry.name === demoFilter)) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: temp, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  await page.goto(`${origin}/#/${scenario.route}`);
  await wait(stepMs);
  const video = page.video();
  await scenario.run(page);
  await context.close();
  const source = await video.path();
  const target = resolve(media, `${scenario.name}.webm`);
  await rename(source, target);
  const mp4 = resolve(media, `${scenario.name}.mp4`);
  const encoded = spawnSync("ffmpeg", ["-y", "-i", target, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  if (encoded.status !== 0) throw new Error(`ffmpeg failed for ${scenario.name}`);
  await rm(target, { force: true });
  console.log(`recorded ${mp4}`);
}

await browser.close();
server.kill("SIGTERM");
