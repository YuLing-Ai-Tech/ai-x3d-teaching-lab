import { expect, test } from "@playwright/test";

test("YuLing AI 品牌在桌面和手机页面可见", async ({ page }) => {
  await page.goto("/#/conic");
  const brand = page.locator(".brand");
  await expect(brand).toBeVisible();
  await expect(brand.locator("img")).toBeVisible();
  await expect(brand).toHaveAttribute("aria-label", /YuLing AI/);
});

test("主页列出全天全部案例", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /说清楚/ })).toBeVisible();
  await expect(page.locator("[data-case-link]")).toHaveCount(15);
});

const LANG_LABS = ["compiler", "poem", "preposition", "gravity", "molecule", "dna", "embedding", "next-token", "geo"];
for (const route of LANG_LABS) {
  test(`${route} 语言→世界：预设可切换、无控制台错误`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/#/${route}`);
    const stage = page.locator(".lang-stage");
    await expect(stage).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
    await expect(page.locator(".lang-variants button.active")).toHaveCount(1);
    // 引力、分子有探究页签，预设在“语言”页签里
    if (await page.locator('[data-lang-tab="language"]').count()) await page.locator('[data-lang-tab="language"]').click();
    await page.locator(".lang-variants button").nth(1).click();
    await expect(page.locator(".lang-variants button").nth(1)).toHaveClass(/active/);
    await expect(stage).toHaveAttribute("data-parse", "ok");
    await page.waitForTimeout(600);
    expect(errors).toEqual([]);
  });
}

test("主课件可翻页并跳转到案例", async ({ page }) => {
  await page.goto("/#/deck");
  await expect(page.locator("#slide-number")).toHaveText("1");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#slide-number")).toHaveText("3");
  await expect(page).toHaveURL(/#\/deck\?s=3$/);
  await page.locator(".slide.active .case-jump").first().click();
  await expect(page).toHaveURL(/#\/embedding\?from=3$/);
});

test("从第 N 页进入案例，返回按钮 / 浏览器后退 / Esc 都回到第 N 页", async ({ page }) => {
  await page.goto("/#/deck?s=9");
  await expect(page.locator("#slide-number")).toHaveText("9");
  await page.locator(".slide.active .case-jump").first().click();
  await expect(page).toHaveURL(/#\/gravity\?from=9$/);
  await expect(page.locator(".case-back")).toHaveText(/第 9 页/);
  await page.locator(".case-back").click();
  await expect(page.locator("#slide-number")).toHaveText("9");
  await page.locator(".slide.active .case-jump").first().click();
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.goBack();
  await expect(page.locator("#slide-number")).toHaveText("9");
  await page.locator(".slide.active .case-jump").first().click();
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Escape");
  await expect(page.locator("#slide-number")).toHaveText("9");
});

test("案例页“下一个”按讲课顺序走，且返回目标随之更新", async ({ page }) => {
  await page.goto("/#/poem?from=6");
  await page.locator(".case-next").click();
  await expect(page).toHaveURL(/#\/preposition\?from=7$/);
  await expect(page.locator(".case-back")).toHaveText(/第 7 页/);
});

for (const route of ["long-march", "conic", "membrane", "blender"]) {
  test(`${route} 页面无控制台错误`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(`/#/${route}`);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });
}

for (const route of ["long-march", "conic", "membrane"]) {
  test(`${route} 案例可一键切换备用录像`, async ({ page }) => {
    await page.goto(`/#/${route}`);
    const fallback = page.getByRole("link", { name: "播放备用录像" });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", /media\/.+-demo\.mp4$/);
  });
}

test("Blender 页提供完成版与现场修改版录像", async ({ page }) => {
  await page.goto("/#/blender");
  await expect(page.getByRole("link", { name: "播放完成版" })).toBeVisible();
  await expect(page.getByRole("link", { name: "播放修改版" })).toBeVisible();
});

test("长征旗舰场景默认全景并提供天气与 2D/3D 控制", async ({ page }) => {
  await page.goto("/#/long-march");
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-view", "overview");
  await expect(stage).toHaveAttribute("data-terrain", "dem-relief");
  await expect(stage).toHaveAttribute("data-terrain-finish", "baked-hillshade");
  await expect(stage).toHaveAttribute("data-edge-contrast", "high");
  await expect(stage).toHaveAttribute("data-engine", "three-relief");
  await expect(stage).toHaveAttribute("data-terrain-renderer", "mesh-dem");
  await expect(stage).toHaveAttribute("data-terrain-cutout", "region-block");
  await expect(stage).toHaveAttribute("data-side-profile", "stratified");
  await expect(stage).toHaveAttribute("data-route-flow", "draped-progress");
  await expect(page.locator(".lm-event")).toHaveCount(10);
  await expect(stage).toHaveAttribute("data-camera-mode", "overview");
  await expect(stage).toHaveAttribute("data-label-mode", "overview");
  await expect(stage).toHaveAttribute("data-weather", "running");
  await expect(stage).toHaveAttribute("data-continent-coverage", "complete", { timeout: 6_000 });
  await expect(page.getByRole("button", { name: "恢复全景" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭天气" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "俯视地图" }).click();
  await expect(stage).toHaveAttribute("data-dimension", "2d");
  await expect(stage).toHaveAttribute("data-view", "overview");
  await expect(stage).toHaveAttribute("data-camera-mode", "top-down");
  await expect(stage).toHaveAttribute("data-weather", "paused");
  await expect(stage).toHaveAttribute("data-cutaway", "hidden");
  await expect(page.getByRole("button", { name: "关闭天气" })).toBeDisabled();
});

test("长征按钮状态一致：巡航可停、键盘翻页、再点放大、Esc 关闭", async ({ page }) => {
  await page.goto("/#/long-march");
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-engine", "three-relief");
  const tour = page.locator("#tour-button");
  if (await tour.isVisible()) { // 手机端不提供自动巡航
    await tour.click();
    await expect(tour).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-node="0"]')).toHaveAttribute("aria-pressed", "true");
    await tour.click();
    await expect(tour).toHaveAttribute("aria-pressed", "false");
  } else {
    await page.locator('[data-node="0"]').click();
  }
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-node="1"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("PageUp");
  await expect(page.locator('[data-node="0"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-node="0"]').click();
  const dialog = page.getByRole("dialog", { name: "历史事件详情" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(stage).toHaveAttribute("data-view", "overview");
  await expect(page.locator("#open-event")).toHaveText("从起点开始");
});

test("长征事件可放大并播放本地媒体", async ({ page }) => {
  await page.goto("/#/long-march");
  await page.locator('[data-node="3"]').click();
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-view", "event");
  await expect(stage).toHaveAttribute("data-camera-mode", "event-context");
  await expect(stage).toHaveAttribute("data-label-mode", "focus");
  await page.getByRole("button", { name: "放大事件" }).click();
  const dialog = page.getByRole("dialog", { name: "历史事件详情" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".story-slide.active img")).toHaveAttribute("src", /media\/long-march\/.+\.jpg$/);
  await page.keyboard.press("End");
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
  await expect(dialog.locator(".story-slide.active")).toHaveClass(/story-text/);
  await expect(dialog.locator(".story-slide.active")).toContainText("课堂问题");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("任务单只写入浏览器本地存储", async ({ page }) => {
  await page.goto("/#/workshop");
  await page.getByLabel("学生最后应理解什么").fill("理解变量改变与结果之间的关系");
  await page.getByRole("button", { name: "生成制作提示词" }).click();
  await expect(page.locator("#generated-prompt")).toContainText("理解变量改变");
  const saved = await page.evaluate(() => localStorage.getItem("ai3d-workshop"));
  expect(saved).toContain("理解变量改变");
});

test("工作坊：载入示例生成提示词，并标出模糊词", async ({ page }) => {
  await page.goto("/#/workshop");
  await page.getByRole("button", { name: /物理 · 平抛运动/ }).click();
  await expect(page.locator("#generated-prompt")).toContainText("x = v₀·t");
  await expect(page.locator("#ws-meter")).toContainText("模糊词 0 个");
  await page.getByLabel("学生最后应理解什么").fill("做一个漂亮的课件");
  await expect(page.locator('.ws-vague[data-for="goal"]')).toContainText("漂亮");
  await expect(page.locator("#ws-meter")).toContainText("模糊词 1 个");
});
