import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/compiler");
  await page.evaluate(() => { localStorage.removeItem("ai3d-inquiry:compiler"); localStorage.removeItem("ai3d-stage:compiler"); });
  await page.reload();
});

const lock = async (page: import("@playwright/test").Page, task: string, option = 1) => {
  await page.locator(`[data-task="${task}"]`).click();
  await page.locator(".iq-option").nth(option).click();
  await page.locator('textarea[data-reason]').fill("因为句子里没有写出数量");
  await page.locator('[data-iq="lock"]').click();
};

test("数据卡在锁定预测前隐藏，讲解卡不给结论", async ({ page }) => {
  await expect(page.locator("#cp-data")).toBeHidden();
  await expect(page.locator("#cp-locked")).toBeVisible();
  await page.locator('[data-cp-text="一个漂亮的球"]').click();
  await expect(page.locator("#lang-explain")).not.toContainText("只能猜");
  await expect(page.locator("#lang-explain")).not.toContainText("x²");
  await lock(page, "vague");
  const card = page.locator("#cp-data");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-guessed", "1");
  await expect(card).toContainText("机器用默认值 2");
  await expect(card).toContainText("漂亮");
  await expect(page.locator("#lang-explain")).not.toContainText("只能猜");
});

test("T2：先记录有被猜参数的一行，再改写到 0 个被猜，证据才有效", async ({ page }) => {
  await lock(page, "rewrite");
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator("#cp-mine").fill("一个大一点的圆锥");
  await page.locator("#cp-apply").click();
  await expect(page.locator("#cp-data")).toHaveAttribute("data-guessed", "2");
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "false");
  await page.locator("#cp-mine").fill("一个底面半径 3、高 5 的圆锥");
  await page.locator("#cp-apply").click();
  await expect(page.locator("#cp-data")).toHaveAttribute("data-guessed", "0");
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".iq-table tbody tr").nth(1)).toContainText("0 个被猜参数");
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  await page.locator('[data-iq="go-explain"]').click();
  await expect(page.locator(".iq-verdict")).toHaveClass(/ok/);
  await expect(page.locator("#lang-explain")).toContainText("每个数量都说清楚了");
});

test("T3：钉住中文句，英文版判定为同一个世界，A ball 只是看似相同", async ({ page }) => {
  await lock(page, "world");
  await page.locator('[data-cp-text="一个半径为 2 的球"]').click();
  await page.locator("#cp-pin").click();
  await page.locator('[data-cp-text="A sphere of radius 2"]').click();
  await expect(page.locator("#cp-data")).toHaveAttribute("data-world", "same");
  await page.locator('[data-cp-text="A ball"]').click();
  await expect(page.locator("#cp-data")).toHaveAttribute("data-world", "same-by-default");
});

test("“语言”页签的预设按钮照常工作，讲解卡给出完整结论", async ({ page }) => {
  await page.locator('[data-lang-tab="language"]').click();
  const input = page.locator("#lang-input");
  await page.locator('[data-variant="6"]').click();
  await expect(input).toHaveValue("一个漂亮的球");
  await expect(page.locator('[data-variant="6"]')).toHaveClass(/active/);
  await expect(page.locator("#lang-explain")).toContainText("只能猜 2");
  await expect(page.locator(".lang-token[data-role=vague]")).toHaveText("漂亮");
  await page.locator('[data-variant="3"]').click();
  await expect(input).toHaveValue("一个底面半径 2、高 4 的圆锥");
  await expect(page.locator("#lang-explain")).toContainText("cone({ radius: 2, height: 4 })");
  await page.keyboard.press("ArrowRight");
  await expect(input).toHaveValue("一张波长 3、振幅 0.8 的波浪面");
});
