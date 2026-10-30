import { expect, test } from "@playwright/test";

// 地理：剖面结论从 DEM 采样算出——北纬 35° 是完整三级，北纬 31° 缺第二级，北纬 40° 没有第一级。

test.beforeEach(async ({ page }) => {
  await page.goto("/#/");
  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ai3d-")).forEach((key) => localStorage.removeItem(key)));
});

test("语言页签：讲解卡随纬度给出不同结论", async ({ page }) => {
  await page.goto("/#/geo");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 20_000 });
  await page.locator('[data-lang-tab="language"]').click();
  const explain = page.locator("#lang-explain");
  await page.locator("#lang-input").fill("沿北纬 35° 做一条东西向剖面");
  await expect(explain).toContainText("完整的三级阶梯");
  await page.locator("#lang-input").fill("沿北纬 31° 做一条东西向剖面");
  await expect(explain).toContainText("第二级没有连续出现");
  await page.locator("#lang-input").fill("沿北纬 40° 做一条东西向剖面");
  await expect(explain).toContainText("没有第一级");
  await expect(explain).not.toContainText("完整的三级阶梯");
  await page.locator("#lang-input").fill("海拔 3000 米以上");
  await expect(explain).toContainText("青藏高原");
  await expect(explain).not.toContainText("四川盆地");
});

test("探究：预测前无数据；反例任务需要北纬 40° 与 35° 两行证据", async ({ page }) => {
  await page.goto("/#/geo");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 20_000 });
  await expect(page.locator("#geo-data")).toHaveAttribute("data-ready", "false");
  await expect(page.locator("#lang-explain")).not.toContainText("完整的三级阶梯");
  // 任务 1：北纬 35°
  await page.locator(".iq-option").first().click();
  await page.locator("[data-reason]").fill("西边是青藏高原");
  await page.locator('[data-iq="lock"]').click();
  await expect(page.locator("#geo-data")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#geo-data")).toContainText("北纬35°");
  await expect(page.locator("#geo-data")).toContainText("1→2→3");
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-iq="capture"]').click();
  await page.locator('[data-geo-quick="1"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  // 指令框：自己写一个纬度
  await page.locator("#geo-input").fill("沿北纬 40° 做一条东西向剖面");
  await page.locator(".geo-command button").click();
  await expect(page.locator("#geo-data")).toContainText("北纬40°");
  await expect(page.locator("#geo-data")).toContainText("否");
});
