import { expect, test } from "@playwright/test";

// 词向量宇宙：预测锁定前数据卡隐藏；记录足够的词对后证据有效；“语言”页签的预设照常可用。

test.beforeEach(async ({ page }) => {
  await page.goto("/#/");
  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ai3d-")).forEach((key) => localStorage.removeItem(key)));
});

const lock = async (page: import("@playwright/test").Page, option: number) => {
  await page.locator(".iq-option").nth(option).click();
  await page.locator("[data-reason]").fill("同义词应该更近，不相关的词更远");
  await page.locator('[data-iq="lock"]').click();
};

test("词向量：锁定预测前数据卡隐藏、讲解卡不给邻居；记录三组词对后证据有效", async ({ page }) => {
  await page.goto("/#/embedding");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(page.locator("#em-data")).toBeHidden();
  await expect(page.locator("#lang-explain")).not.toContainText("近邻");
  await lock(page, 3);
  await expect(page.locator("#em-data")).toBeVisible();
  await expect(page.locator("#em-data")).toContainText("1024 维");
  await page.locator('[data-iq="go-evidence"]').click();
  for (const pair of ["猫|cat", "猫|狗"]) {
    await page.locator(`[data-pair="${pair}"]`).first().click();
    await page.locator('[data-iq="capture"]').click();
  }
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "false");
  await expect(page.locator(".iq-validity")).toContainText("猫–数学");
  await page.locator('[data-pair="猫|数学"]').first().click();
  await expect(page.locator("#em-sim")).toHaveText(/^0\.\d{3}$/);
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  const rows = page.locator(".iq-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("猫–cat");
  await expect(rows.nth(2)).toContainText("约等于平均");
  await page.locator('[data-iq="go-explain"]').click();
  await expect(page.locator(".iq-verdict")).toHaveClass(/ok/);
  await expect(page.locator(".iq-reflection")).toBeVisible();
  await expect(page.locator("#lang-explain")).toContainText("近邻");
});

test("词向量：类比任务按期望答案的名次判断，未命中也算有效证据", async ({ page }) => {
  await page.goto("/#/embedding");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator('.iq-tasks [data-task="analogy"]').click();
  await expect(page.locator("#em-analogy-box")).toBeVisible();
  await expect(page.locator("#em-run")).toBeDisabled();
  await lock(page, 1);
  await page.locator('[data-iq="go-evidence"]').click();
  for (const expr of ["国王 − 男人 + 女人", "king − man + woman", "巴黎 − 法国 + 日本"]) {
    await page.locator("[data-analogy]", { hasText: expr }).click();
    await page.locator('[data-iq="capture"]').click();
  }
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  const rows = page.locator(".iq-table tbody tr");
  await expect(rows.nth(0)).toContainText("未命中");
  await expect(rows.nth(1)).toContainText("命中");
  await expect(page.locator("#em-rank")).toContainText("第 3 名");
});

test("词向量：“语言”页签的预设按钮照常切换，并给出结论", async ({ page }) => {
  await page.goto("/#/embedding");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator('[data-lang-tab="language"]').click();
  const variants = page.locator(".lang-variants button");
  await variants.filter({ hasText: "国王 − 男人 + 女人" }).click();
  await expect(variants.filter({ hasText: "国王 − 男人 + 女人" })).toHaveClass(/active/);
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok");
  await expect(page.locator("#lang-explain")).toContainText("王后");
  await expect(page.locator("#lang-explain .lang-warn")).toBeVisible();
  await variants.filter({ hasText: "king − man + woman" }).click();
  await expect(page.locator("#lang-explain .lang-ok")).toContainText("queen");
  await variants.filter({ hasText: /^猫$/ }).click();
  await expect(page.locator("#lang-explain")).toContainText(/任意两个词平均 0\.\d\d/);
});
