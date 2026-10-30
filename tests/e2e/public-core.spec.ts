import { expect, test } from "@playwright/test";

test("公开模式缺少私有资产时给出明确说明", async ({ page }) => {
  test.skip(process.env.PUBLIC_CORE_E2E !== "1", "只在 public-core 生产构建验收中运行");
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  for (const route of ["long-march", "blender", "geo"]) {
    await page.goto(`/#/${route}`);
    await expect(page.locator(".asset-required")).toBeVisible();
    await expect(page.locator(".asset-required")).toContainText("本地资产未挂载");
    await expect(page.locator(".brand img")).toBeVisible();
  }
  expect(failedRequests).toEqual([]);
});
