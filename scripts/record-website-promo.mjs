import {spawnSync} from "node:child_process";
import {mkdir, rename, rm, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "@playwright/test";

const outputDir = resolve("videos/ai-3d-showcase/website-capture");
const tempDir = resolve(".cache/website-promo-recording");
const baseUrl = "http://127.0.0.1:4173";
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

await rm(tempDir, {recursive: true, force: true});
await mkdir(tempDir, {recursive: true});
await mkdir(outputDir, {recursive: true});

const browser = await chromium.launch({channel: "chrome", headless: true});
const context = await browser.newContext({
  viewport: {width: 1920, height: 1080},
  recordVideo: {dir: tempDir, size: {width: 1920, height: 1080}},
  colorScheme: "dark",
});

await context.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const cursor = document.createElement("div");
    cursor.id = "promo-cursor";
    cursor.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "width:24px",
      "height:24px",
      "border:3px solid #fff",
      "border-radius:50%",
      "box-shadow:0 0 0 5px rgba(87,216,255,.3),0 0 28px rgba(87,216,255,.9)",
      "pointer-events:none",
      "transform:translate(-50%,-50%)",
      "left:50%",
      "top:50%",
      "transition:width .12s,height .12s,border-color .12s",
    ].join(";");
    document.body.append(cursor);
    window.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    window.addEventListener("mousedown", () => {
      cursor.style.width = "34px";
      cursor.style.height = "34px";
      cursor.style.borderColor = "#57d8ff";
    });
    window.addEventListener("mouseup", () => {
      cursor.style.width = "24px";
      cursor.style.height = "24px";
      cursor.style.borderColor = "#fff";
    });
  });
});

const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();
const marks = [];

const mark = (id, note) => {
  marks.push({id, note, seconds: Number(((Date.now() - startedAt) / 1000).toFixed(3))});
};

const open = async (route, id, note, hold = 850) => {
  await page.goto(`${baseUrl}/#/${route}`, {waitUntil: "domcontentloaded"});
  await page.waitForSelector("main");
  await wait(180);
  mark(id, note);
  await wait(hold);
};

const clickButton = async (name, hold = 900) => {
  const button = page.getByRole("button", {name, exact: true});
  const box = await button.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 18});
  await button.click();
  await wait(hold);
};

await open("", "home", "课程首页", 2200);

await open("embedding", "embedding", "词向量宇宙");
await clickButton("king − man + woman", 850);

await open("next-token", "next-token", "下一个词");
await clickButton("开放 · 在人工智能时代，…", 850);

await open("compiler", "compiler", "语言编译台");
await clickButton("圆锥", 1000);

await open("poem", "poem", "古诗即几何");
await clickButton("直 → 斜", 950);

await open("preposition", "preposition", "介词即空间");
await clickButton("through 隧道", 950);

await open("gravity", "gravity", "一句话定义引力");
await clickButton("立方", 1050);

await open("molecule", "molecule", "分子也有语言");
await clickButton("二甲醚 COC", 1050);

await open("dna", "dna", "DNA，最古老的语言");
await clickButton("镰刀型 GAG→GTG", 1050);

await open("geo", "geo", "用坐标说话", 900);
await clickButton("3000 米以上", 1300);

await open("conic", "conic", "圆锥曲线", 700);
for (const value of [62, 30, 12]) {
  const slider = page.locator("#cv-beta");
  const box = await slider.boundingBox();
  if (box) await page.mouse.move(box.x + box.width * (value / 90), box.y + box.height / 2, {steps: 15});
  await slider.fill(String(value));
  await slider.dispatchEvent("input");
  await wait(700);
}

await open("membrane", "membrane", "细胞膜运输", 700);
await page.selectOption("#transport-mode", "active");
await page.locator("#outside-concentration").fill("25");
await page.locator("#inside-concentration").fill("80");
await page.locator("#channel-count").fill("7");
await page.locator("#atp-toggle").setChecked(true);
await page.locator("#inside-concentration").dispatchEvent("input");
const atp = page.locator("#atp-toggle");
const atpBox = await atp.boundingBox();
if (atpBox) await page.mouse.move(atpBox.x + atpBox.width / 2, atpBox.y + atpBox.height / 2, {steps: 20});
await wait(1800);

await open("workshop", "workshop", "六格任务单", 1000);
const firstField = page.getByLabel("学生最后应理解什么");
await firstField.fill("理解变量改变与结果之间的关系");
await clickButton("生成制作提示词", 1100);

await open("blender", "blender", "Codex + Blender", 1800);
mark("end", "录制结束");

await context.close();
const source = await video.path();
const webm = resolve(outputDir, "website-tour.webm");
await rename(source, webm);
const mp4 = resolve(outputDir, "website-tour.mp4");
const encoded = spawnSync(
  "ffmpeg",
  ["-y", "-i", webm, "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
  {stdio: "inherit"},
);
if (encoded.status !== 0) throw new Error("ffmpeg failed for website tour");
await writeFile(resolve(outputDir, "timings.json"), `${JSON.stringify(marks, null, 2)}\n`);
await rm(webm, {force: true});
await browser.close();
console.log(JSON.stringify({mp4, duration: marks.at(-1)?.seconds, marks}, null, 2));
