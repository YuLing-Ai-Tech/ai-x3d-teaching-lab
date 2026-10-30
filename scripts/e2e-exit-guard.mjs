import { execFileSync } from "node:child_process";

// Playwright 退出守卫。偶发现象：全部用例结束后，个别 worker 收不到停止信号，主进程一直等它，
// 汇总不打印、进程不退出（上游已加看门狗：microsoft/playwright#40637，本项目锁定的 1.56.1 尚未包含）。
// 这里在“所有用例都已结束”之后再等 20 秒；正常情况下 onEnd 会先到，守卫什么都不做。
// 只有真卡住时，才按已记录的结果给出退出码，并结束本进程的子进程（worker 与 vite preview）。
const GRACE_MS = 20_000;

export default class ExitGuard {
  total = 0;
  finished = 0;
  failed = 0;
  timer = undefined;

  onBegin(_config, suite) { this.total = suite.allTests().length; }

  onTestEnd(test, result) {
    // 有重试时以最后一次为准：只在最终结果确定后计数
    if (result.status !== "passed" && result.status !== "skipped" && result.retry < test.retries) return;
    this.finished += 1;
    if (result.status !== "passed" && result.status !== "skipped" && test.outcome() === "unexpected") this.failed += 1;
    if (this.finished >= this.total && !this.timer) {
      this.timer = setTimeout(() => this.bail(), GRACE_MS);
      this.timer.unref();
    }
  }

  onEnd() { if (this.timer) clearTimeout(this.timer); }

  bail() {
    process.stderr.write(`\n[exit-guard] ${this.total} 个用例已全部结束 ${GRACE_MS / 1000}s，Playwright 仍未退出：结束残留子进程。失败 ${this.failed} 个。\n`);
    try { execFileSync("pkill", ["-TERM", "-P", String(process.pid)]); } catch { /* 没有残留子进程 */ }
    process.exit(this.failed ? 1 : 0);
  }

  printsToStdio() { return false; }
}
