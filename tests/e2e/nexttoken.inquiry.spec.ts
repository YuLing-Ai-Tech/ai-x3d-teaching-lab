import { expect, test } from "@playwright/test";

// 下一个词：预测锁定前数据卡不出现、讲解卡不给结论；记录 3 句前文后证据有效；“语言”页签与原来一样。

test.beforeEach(async ({ page }) => {
  await page.goto("/#/");
  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ai3d-")).forEach((key) => localStorage.removeItem(key)));
});

test("下一个词：预测前遮住、不给结论；记录 3 句前文后证据有效，判断来自数据", async ({ page }) => {
  await page.goto("/#/next-token");
  const stage = page.locator(".lang-stage");
  await expect(stage).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(stage).toHaveClass(/nt-hold/);
  await expect(page.locator("#nt-data")).toHaveAttribute("data-ready", "false");
  await expect(page.locator("#nt-p1")).toHaveCount(0);
  const explain = page.locator("#lang-explain");
  await expect(explain).toContainText("先在“探究”里写下预测");
  await expect(explain).not.toContainText("99.8");
  await expect(explain.locator("[data-certainty]")).toHaveCount(0);

  await page.locator(".iq-option").first().click();
  await expect(page.locator('[data-iq="lock"]')).toBeDisabled();
  await page.locator("[data-reason]").fill("古诗和公式只有一种写法，开放问题有很多答案");
  await page.locator('[data-iq="lock"]').click();
  await expect(stage).not.toHaveClass(/nt-hold/);
  await expect(page.locator("#nt-data")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#nt-p1")).toHaveText("99.8%");
  await expect(explain.locator("[data-certainty]")).toHaveCount(0);  // 有数据，但结论等证据有效

  await page.locator('[data-iq="go-evidence"]').click();
  for (const index of [0, 3, 5]) {
    await page.locator(`[data-prompt="${index}"]`).click();
    await page.locator('[data-iq="capture"]').click();
  }
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  const rows = page.locator(".iq-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("霜");
  await expect(rows.nth(1)).toContainText("62.3%");
  await expect(rows.nth(2)).toContainText("10.5%");
  await page.locator('[data-iq="go-explain"]').click();
  await expect(page.locator(".iq-verdict")).toHaveClass(/ok/);
  await expect(page.locator(".iq-reflection")).toBeVisible();
  await expect(explain.locator("[data-certainty]")).toHaveAttribute("data-certainty", "unsure");
  await page.locator('[data-prompt="0"]').click();
  await expect(explain.locator("[data-certainty]")).toHaveAttribute("data-certainty", "sure");
});

test("下一个词：温度只在高中出现；同一句 T = 0.5 与 1.5 才算有效证据", async ({ page }) => {
  await page.goto("/#/next-token");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator('[data-task="temperature"]').click();
  await page.locator(".iq-option").first().click();
  await page.locator("[data-reason]").fill("温度高会更随机");
  await page.locator('[data-iq="lock"]').click();
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-prompt="3"]').click();
  await page.locator('[data-temp="0.5"]').click();
  await page.locator('[data-iq="capture"]').click();
  await page.locator('[data-prompt="5"]').click();
  await page.locator('[data-temp="1.5"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "false");
  await page.locator('[data-prompt="3"]').click();
  await expect(page.locator("#nt-hot")).toContainText("56.5%");
  await expect(page.locator("#nt-hot")).toContainText("近似");
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");

  await page.locator('.lang-tabs [data-school="初中"]').click();
  await expect(page.locator("#nt-temp")).toBeHidden();
  await expect(page.locator(".iq-tasks button")).toHaveCount(2);
});

test("下一个词：“语言”页签照常给结论、预设可切换；探究页签里方向键不换前文", async ({ page }) => {
  await page.goto("/#/next-token");
  const stage = page.locator(".lang-stage");
  await expect(stage).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  const input = page.locator("#lang-input");
  await page.locator("body").press("ArrowRight");
  await expect(input).toHaveValue("床前明月光，疑是地上");

  await page.locator('[data-lang-tab="language"]').click();
  await expect(stage).not.toHaveClass(/nt-hold/);
  const explain = page.locator("#lang-explain");
  await expect(explain.locator("[data-certainty]")).toHaveAttribute("data-certainty", "sure");
  await page.locator('[data-variant="3"]').click();
  await expect(input).toHaveValue("The capital of France is");
  await expect(explain).toContainText("Paris");
  await expect(explain.locator("[data-certainty]")).toHaveAttribute("data-certainty", "lean");
  await page.locator("body").press("ArrowRight");
  await expect(input).toHaveValue("勾股定理：直角三角形中，a² + b² =");
  await page.locator('[data-variant="5"]').click();
  await expect(explain.locator("[data-certainty]")).toHaveAttribute("data-certainty", "unsure");
});
