import { spawn } from "node:child_process";
import process from "node:process";

// 用 stdin = ignore 启动 Playwright：当调用方的 stdin 是一根不关闭的管道（ssh、Codex、其他自动化工具）时，
// 不让子进程继承这根管道。另一类偶发不退出由 scripts/e2e-exit-guard.mjs 兜底。
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: ["ignore", "inherit", "inherit"],
});
const forward = (signal) => child.kill(signal);
process.on("SIGINT", forward);
process.on("SIGTERM", forward);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
