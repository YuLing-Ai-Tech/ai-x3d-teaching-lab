import { execFileSync, spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import process from "node:process";
import qrcode from "qrcode-terminal";

const project = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.CLASSROOM_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`无效 CLASSROOM_PORT：${process.env.CLASSROOM_PORT}`);
console.log("开课前检查：正在重建离线站点并验证媒体……");
execFileSync("npm", ["run", "build:local"], { cwd: project, stdio: "inherit" });
execFileSync("npm", ["run", "verify:offline"], { cwd: project, stdio: "inherit" });
execFileSync("npm", ["run", "verify:media"], { cwd: project, stdio: "inherit" });

const candidates = Object.values(networkInterfaces()).flat().filter((entry) =>
  entry && entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254."),
);
const address = candidates[0]?.address ?? "127.0.0.1";
const url = `http://${address}:${port}/`;

console.log(`\n课堂入口：${url}`);
console.log("请让手机与本机连接同一 Wi-Fi；此服务只读取 dist 目录。\n");
qrcode.generate(url, { small: true });

const server = spawn("npm", ["run", "preview", "--", "--port", String(port), "--strictPort"], { cwd: project, stdio: "inherit" });
if (process.env.CLASSROOM_NO_OPEN !== "1") {
  setTimeout(() => spawn("open", [url], { stdio: "ignore", detached: true }).unref(), 1400);
}

const shutdown = () => server.kill("SIGTERM");
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", (code) => process.exit(code ?? 0));
