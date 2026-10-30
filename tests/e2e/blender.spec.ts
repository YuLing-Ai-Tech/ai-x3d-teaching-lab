import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("steps.json 可加载且包含五个 Blender 导出的步骤", async ({ page }) => {
  const response = await page.request.get("/media/blender/steps.json");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.generatedBy).toContain("Blender");
  expect(payload.steps).toHaveLength(5);
  expect(payload.steps[1].changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "Eruption_Flow.speed", before: 0, after: 160 }),
    expect.objectContaining({ path: "Ballistic_Bombs.count", after: 28 }),
  ]));
  expect(payload.phases.map((phase: { name: string }) => phase.name)).toEqual(["蓄压", "喷口破裂", "闪光与冲击", "高速气灰喷流", "火山弹抛射", "灰柱卷吸膨胀", "灰尘沉降"]);
  expect(payload.timeScale).toBe(5);
  expect(payload.steps[3].labels.length).toBeGreaterThanOrEqual(8);
  for (const label of payload.steps[3].labels) {
    expect(label.anchor.x).toBeGreaterThanOrEqual(0);
    expect(label.anchor.x).toBeLessThanOrEqual(1);
    expect(label.anchor.y).toBeGreaterThanOrEqual(0);
    expect(label.anchor.y).toBeLessThanOrEqual(1);
  }
});

test("按钮聚焦时空格只触发按钮自身行为而不翻步", async ({ page }) => {
  await page.goto("/#/blender");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("ArrowRight");
  await page.locator("#toggle-result-video").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".blender-stage")).toHaveAttribute("data-step", "2");
});

test("剪贴板失败时提示手动复制", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await page.goto("/#/blender");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.locator("#copy-blender-prompt").click();
  await expect(page.locator("#copy-blender-prompt")).toHaveText("请手动复制");
});

test("第四步使用 Blender 导出的 HTML 地层标签", async ({ page }) => {
  await page.goto("/#/blender");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.locator('[data-step-dot="3"]').click();
  await expect(page.locator("#image-labels [data-label-object]")).toHaveCount(11);
  await expect(page.locator("#image-labels")).toContainText("岩墙");
  await page.locator("#image-labels [data-label-object]", { hasText: "岩床" }).click();
  await expect(page.locator("#volcano-observed")).toContainText("岩床");
});

test("翻页笔和键盘可走完五步且进度同步", async ({ page }) => {
  await page.goto("/#/blender");
  const stage = page.locator(".blender-stage");
  await expect(stage).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-step-dot]")).toHaveCount(5);
  for (let step = 2; step <= 5; step += 1) {
    await page.keyboard.press(step === 3 ? "Space" : step === 4 ? "PageDown" : "ArrowRight");
    await expect(stage).toHaveAttribute("data-step", String(step));
    await expect(page.locator(`[data-step-dot="${step - 1}"]`)).toHaveAttribute("aria-current", "step");
  }
  await page.keyboard.press("PageUp");
  await expect(stage).toHaveAttribute("data-step", "4");
});

test("没有弹层时 Esc 交给全站导航返回来源页", async ({ page }) => {
  await page.goto("/#/blender?from=17");
  await expect(page.locator(".case-back")).toContainText("第 17 页");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/deck\?s=17$/);
});

test("完成版、修改版、电影版和五步媒体均可离线读取", async ({ page }) => {
  await page.goto("/#/blender");
  await expect(page.getByRole("link", { name: "播放完成版" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "播放修改版" })).toBeVisible();
  await expect(page.getByRole("link", { name: "播放电影版" })).toBeVisible();
  const paths = ["blender-volcano-demo.mp4", "blender-live-edit-demo.mp4", "volcano-cinematic.mp4", ...Array.from({ length: 5 }, (_, index) => `blender/step-${index + 1}.mp4`)];
  for (const path of paths) {
    const response = await page.request.get(`/media/${path}`);
    expect(response.ok(), path).toBeTruthy();
    expect(response.headers()["content-type"], path).toContain("video/mp4");  // 预览服务器对缺失文件会回退到首页
  }
});

test("手机视口没有横向滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/blender");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("同页 hash 重渲不会残留旧步骤的打字任务", async ({ page }) => {
  const payload = await (await page.request.get("/media/blender/steps.json")).json();
  await page.goto("/#/blender?shot=first");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.locator('[data-step-dot="4"]').click();
  await page.goto("/#/blender?shot=second");
  // 页面按需加载：等新一轮路由渲染完（body 上的 data-loading 消失）再操作
  await expect(page.locator("body")).not.toHaveAttribute("data-loading", /.*/);
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".blender-stage")).toHaveAttribute("data-step", "2");
  await expect(page.locator("#precise-prompt")).toHaveText(payload.steps[1].precise);
});

test("保存三种视口的五步验收截图", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  if (testInfo.project.name !== "投屏-1920") return;
  const directory = ".cache/codex-blender-shots";
  mkdirSync(directory, { recursive: true });
  const payload = await (await page.request.get("/media/blender/steps.json")).json();
  for (const viewport of [{ name: "1920x1080", width: 1920, height: 1080 }, { name: "1366x768", width: 1366, height: 768 }, { name: "390x844", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/#/blender?shot=${viewport.name}`);
    await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
    await page.locator("#blender-console").scrollIntoViewIfNeeded();
    for (let step = 1; step <= 5; step += 1) {
      if (step > 1) await page.keyboard.press("ArrowRight");
      await expect(page.locator(".blender-stage")).toHaveAttribute("data-step", String(step));
      await expect(page.locator("#precise-prompt")).toHaveText(payload.steps[step - 1].precise);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${directory}/${viewport.name}-step-${step}.png`, fullPage: false });
    }
  }
});

test("第二步提供 7 个喷发阶段，点击即跳到对应时刻", async ({ page }) => {
  await page.goto("/#/blender");
  await expect(page.locator(".blender-stage")).toHaveAttribute("aria-busy", "false");
  await page.locator('[data-step-dot="1"]').click();
  const bar = page.locator("#phase-bar");
  await expect(bar).toBeVisible();
  await expect(bar.locator("[data-phase-start]")).toHaveCount(7);
  await bar.locator("[data-phase-start]", { hasText: "火山弹抛射" }).click();
  await expect(page.locator("#step-video-wrap")).toBeVisible();
  await expect(page.locator("#volcano-observed")).toContainText("火山弹抛射");
  await expect(page.locator("#scale-bar")).toBeHidden();  // 2.8 s：喷口近景，没有可靠的 1 km 比例
  await bar.locator("[data-phase-start]", { hasText: "灰柱卷吸膨胀" }).click();
  await expect(page.locator("#scale-bar")).toBeVisible();  // 5.0 s：已切到远景相机
});

test("火山探究：教师提示与学段切换", async ({ page }) => {
  await page.goto("/#/blender");
  await page.locator(".blender-inquiry [data-school=\"初中\"]").click();
  await expect(page.locator("#volcano-inquiry .iq-tasks button")).toHaveCount(2);
  await page.locator("#volcano-teacher").click();
  await expect(page.getByRole("dialog")).toContainText("30 秒失败回退");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
