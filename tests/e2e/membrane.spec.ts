import { expect, test } from "@playwright/test";

test("细胞膜：两个方向都在计数，主动运输关掉 ATP 即停止", async ({ page }) => {
  await page.goto("/#/membrane");
  await page.locator('[data-speed="10"]').click();
  await expect.poll(async () => Number(await page.locator("#mb-outward").textContent()), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.locator("#mb-inward").textContent())).toBeGreaterThan(0);
  await page.locator('[data-mode="active"]').click();
  await expect.poll(async () => Number(await page.locator("#mb-atp-used").textContent()), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.locator("#mb-atp").uncheck();
  await page.waitForTimeout(400);
  const frozen = await page.locator("#mb-inward").textContent();
  await page.waitForTimeout(1500);
  await expect(page.locator("#mb-inward")).toHaveText(frozen ?? "");
  await expect(page.locator("#mb-readout")).toContainText("没有 ATP");
});

test("细胞膜：焦点在 ATP 复选框上时，空格勾选复选框而不是暂停", async ({ page }) => {
  await page.goto("/#/membrane");
  const atp = page.locator("#mb-atp");
  await expect(atp).toBeChecked();
  await atp.focus();
  await page.keyboard.press("Space");
  await expect(atp).not.toBeChecked();
  await expect(page.locator("#mb-pause")).toHaveText("暂停");
});
