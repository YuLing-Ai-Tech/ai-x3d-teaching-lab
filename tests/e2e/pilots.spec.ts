import { expect, test } from "@playwright/test";

// 试点：引力、分子。先预测（含理由）才运行 / 才判定；证据有效才开放解释；结论不提前出现。

test.beforeEach(async ({ page }) => {
  await page.goto("/#/");
  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ai3d-")).forEach((key) => localStorage.removeItem(key)));
});

test("引力：预测前不运行、不给结论；有效证据后才能解释", async ({ page }) => {
  await page.goto("/#/gravity");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(page.locator("#gv-data")).toHaveAttribute("data-ready", "false");
  await expect(page.locator("#lang-explain")).not.toContainText("闭合成椭圆");
  await page.locator(".iq-option").nth(1).click();
  await expect(page.locator('[data-iq="lock"]')).toBeDisabled();
  await page.locator("[data-reason]").fill("力随距离变化不同，轨道形状应该不同");
  await page.locator('[data-iq="lock"]').click();
  await expect(page.locator("#gv-data")).toHaveAttribute("data-ready", "true");
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-law="2"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator('[data-iq="go-explain"]')).toBeDisabled();
  await expect(page.locator(".iq-validity")).toContainText("包含 2.1");
  for (const law of ["2.1", "3"]) {
    await page.locator(`[data-law="${law}"]`).click();
    await page.locator('[data-iq="capture"]').click();
  }
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  const rows = page.locator(".iq-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("稳定绕行");
  await expect(rows.nth(2)).toContainText(/坠入恒星|逃逸/);
  await page.locator('[data-iq="go-explain"]').click();
  await expect(page.locator(".iq-verdict")).toHaveClass(/ok/);
  await expect(page.locator(".iq-reflection")).toBeVisible();
});

test("引力：2.1 次方的实测进动约 20°，接近理论值", async ({ page }) => {
  await page.goto("/#/gravity");
  await page.locator(".iq-option").first().click();
  await page.locator("[data-reason]").fill("先随便猜一个");
  await page.locator('[data-iq="lock"]').click();
  await page.locator('[data-law="2.1"]').click();
  await expect(page.locator("#gv-precession")).toHaveText(/^1[89]\.\d°$|^20\.\d°$/);
});

test("分子：对照判定在锁定预测后出现；实验数据带来源；不再说“能喝”", async ({ page }) => {
  await page.goto("/#/molecule");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(page.locator(".lang-question")).not.toContainText("能喝");
  await page.locator('[data-smiles="CCO"]').click();
  await page.locator("#mol-pin").click();
  await page.locator('[data-smiles="COC"]').click();
  await expect(page.locator(".mol-relation")).not.toContainText("同分异构体");
  await page.locator(".iq-option").nth(1).click();
  await page.locator("[data-reason]").fill("原子一样但是连接不同");
  await page.locator('[data-iq="lock"]').click();
  await expect(page.locator(".mol-relation")).toContainText("同分异构体");
  await expect(page.locator("#mol-property")).toContainText("248.3");
  await expect(page.locator(".mol-data a")).toHaveAttribute("href", /webbook\.nist\.gov/);
  await page.locator('[data-iq="go-evidence"]').click();
  await page.locator('[data-iq="capture"]').click();
  await page.locator('[data-smiles="CCO"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  await expect(page.locator(".iq-table")).toContainText("C–O–H（羟基）");
});

test("初中模式隐藏高中控件与高中任务", async ({ page }) => {
  await page.goto("/#/gravity");
  await page.locator('.lang-tabs [data-school="初中"]').click();
  await expect(page.locator("#gv-exponent")).toBeHidden();
  await expect(page.locator(".iq-tasks button")).toHaveCount(2);
});

test("引力：“语言”页签和原来一样持续运动、照常给结论；“探究”页签预测前暂停", async ({ page }) => {
  await page.goto("/#/gravity");
  const stage = page.locator(".lang-stage");
  await expect(stage).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-running", "false");
  await page.locator('[data-lang-tab="language"]').click();
  await expect(stage).toHaveAttribute("data-running", "true");
  await expect(page.locator("#lang-explain")).toContainText("闭合成椭圆");
  await page.locator(".lang-variants button").nth(2).click();
  await expect(stage).toHaveAttribute("data-running", "true");
  await page.locator('[data-lang-tab="inquiry"]').click();
  await expect(stage).toHaveAttribute("data-running", "false");
  await expect(page.locator("#lang-explain")).not.toContainText("不再稳定");
});

test("引力：记录证据不重置模型；探究页签里方向键不换定律；语言页签不带探究的高亮", async ({ page }) => {
  await page.goto("/#/gravity");
  const stage = page.locator(".lang-stage");
  await expect(stage).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-tracked", "2");
  await page.locator(".iq-option").nth(1).click();
  await page.locator("[data-reason]").fill("力随距离变化不同");
  await page.locator('[data-iq="lock"]').click();
  await page.locator('[data-iq="go-evidence"]').click();
  const resets = await stage.getAttribute("data-resets");
  await page.locator('[data-iq="capture"]').click();
  await page.locator('[data-iq="capture"]').click();
  await expect(stage).toHaveAttribute("data-resets", resets!);
  const law = await page.locator("#lang-input").inputValue();
  await stage.click({ position: { x: 20, y: 20 } });  // 让焦点离开面板里的按钮
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#lang-input")).toHaveValue(law);
  await page.locator('[data-lang-tab="language"]').click();
  await expect(stage).toHaveAttribute("data-tracked", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#lang-input")).not.toHaveValue(law);
  await page.locator('[data-lang-tab="inquiry"]').click();
  await expect(stage).toHaveAttribute("data-tracked", "2");
});

test("DNA：别处的错义突变不说“镰刀型”；三种结果都记录后才能解释", async ({ page }) => {
  await page.goto("/#/dna");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator('[data-lang-tab="language"]').click();
  await page.locator("#lang-input").fill("ATG GTG CAC GTG ACT CCT GAG GAG AAG");
  await expect(page.locator("#lang-explain")).toContainText("换了一个氨基酸");
  await expect(page.locator("#lang-explain")).not.toContainText("镰刀");
  await page.locator(".lang-variants button").nth(2).click();
  await expect(page.locator("#lang-explain")).toContainText("镰刀");
  await page.locator('[data-lang-tab="inquiry"]').click();
  await expect(page.locator("#dna-data")).toHaveAttribute("data-ready", "false");
  await page.locator(".iq-option").nth(1).click();
  await page.locator("[data-reason]").fill("密码子有重复的");
  await page.locator('[data-iq="lock"]').click();
  await page.locator('[data-iq="go-evidence"]').click();
  for (const preset of ["1", "2", "3"]) {
    await page.locator(`[data-dna-preset="${preset}"]`).click();
    await page.locator('[data-iq="capture"]').click();
  }
  await expect(page.locator(".iq-validity")).toHaveAttribute("data-valid", "true");
  await expect(page.locator(".iq-table")).toContainText("无义");
});

test("介词：判定卡给出逐条条件；behind 同时给出两种参照系；through the box 被拒绝", async ({ page }) => {
  await page.goto("/#/preposition");
  await expect(page.locator(".lang-stage")).toHaveAttribute("data-parse", "ok", { timeout: 15_000 });
  await page.locator(".iq-option").nth(1).click();
  await page.locator("[data-reason]").fill("要贴着桌面");
  await page.locator('[data-iq="lock"]').click();
  await page.locator('[data-prep="0"]').click();
  await expect(page.locator("#prep-judge")).toHaveAttribute("data-holds", "true");
  await expect(page.locator("#prep-judge")).toContainText("A 的底面贴着 B 的顶面");
  await page.locator('[data-prep="3"]').click();
  await page.waitForTimeout(1600);
  await page.locator("#prep-rejudge").click();
  await expect(page.locator("#prep-judge")).toContainText("以参照物自身前后为准");
  await page.locator('[data-lang-tab="language"]').click();
  await page.locator("#lang-input").fill("The car goes through the box.");
  await expect(page.locator("#lang-explain")).toContainText("开口");
});
