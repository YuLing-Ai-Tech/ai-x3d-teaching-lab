import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 4173);

// 构建不放进 webServer（由 verify 先构建），这里只直接启动 vite，少两层 npm/npx 进程。
// 偶发“全部通过后不退出”：由 scripts/run-e2e.mjs（stdin 不继承管道）与 scripts/e2e-exit-guard.mjs（看门狗）处理。
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  reporter: [[process.env.CI ? "dot" : "list"], ["./scripts/e2e-exit-guard.mjs"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: process.env.PW_REUSE === "1",
    gracefulShutdown: { signal: "SIGTERM", timeout: 3_000 },
  },
  projects: [
    { name: "投屏-1920", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "手机-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
