import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/conic");
  await page.evaluate(() => { localStorage.removeItem("ai3d-inquiry:conic"); localStorage.removeItem("ai3d-stage:conic"); });
  await page.reload();
});

test("切面角度决定曲线类型，抛物线跟着母线走", async ({ page }) => {
  const stage = page.locator("#stage");
  await expect(stage).toHaveAttribute("data-conic", "ellipse");
  await page.locator('[data-preset="critical"]').click();
  await expect(stage).toHaveAttribute("data-conic", "parabola");
  await expect(page.locator("#cv-equation")).toContainText("y² =");
  await page.locator('[data-preset="steep"]').click();
  await expect(stage).toHaveAttribute("data-conic", "hyperbola");
  await page.locator('[data-preset="apex"]').click();
  await expect(stage).toHaveAttribute("data-conic", "line-pair");
  await page.locator('[data-preset="flat"]').click();
  await expect(stage).toHaveAttribute("data-conic", "point");
});

test("探究流程：先预测才能操作，记录证据后才能解释", async ({ page }) => {
  await expect(page.locator('[data-phase="operate"]')).toBeDisabled();
  await page.locator(".iq-option").first().click();
  await page.locator('[data-iq="lock"]').click();
  await expect(page.locator('[data-phase="explain"]')).toBeDisabled();
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-iq="capture"]').click();
  await page.locator('[data-preset="critical"]').click();
  await page.keyboard.press("r");
  await expect(page.locator(".iq-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".iq-table tbody tr").nth(1)).toContainText("抛物线");
  await page.locator('[data-iq="go-explain"]').click();
  await expect(page.locator(".iq-verdict")).toHaveClass(/ok/);
  await page.reload();
  await expect(page.locator(".iq-verdict")).toBeVisible();
});

test("高中可开双球与动点，距离和等于 2a；初中隐藏这些控件", async ({ page }) => {
  await page.locator('[data-toggle="foci"]').click();
  await page.locator('[data-toggle="point"]').click();
  const metrics = page.locator(".lx-metrics");
  await expect(metrics).toContainText("和");
  const read = async (label: string) => Number(await metrics.locator("div", { hasText: label }).locator("dd").first().textContent());
  expect(await read("和")).toBeCloseTo(2 * await read("a"), 1);
  await page.locator('[data-school="初中"]').click();
  await expect(page.locator('[data-toggle="spheres"]')).toBeHidden();
  await expect(page.locator("#cv-alpha")).toBeHidden();
});

test("教师提示可打开，Esc 只关闭弹层不离开页面", async ({ page }) => {
  await page.locator("#lx-teacher").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("30 秒失败回退");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#\/conic/);
});


test("任务预设只在进入操作时执行一次：学生关掉的双球不会被记录证据重新打开", async ({ page }) => {
  await page.locator('[data-task="focus"]').click();
  await page.locator(".iq-option").nth(1).click();
  await page.locator('[data-iq="lock"]').click();
  await expect(page.locator('[data-toggle="spheres"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-toggle="spheres"]').click();
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator('[data-toggle="spheres"]')).toHaveAttribute("aria-pressed", "false");
});
