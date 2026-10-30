import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("dist");
const violations = [];

function visit(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else if (/\.(html|css|js)$/i.test(name)) {
      const content = readFileSync(path, "utf8");
      const forbidden = [
        /(?:src|srcset)=["']https?:\/\//gi,
        /url\(["']?https?:\/\//gi,
        /fetch\(["']https?:\/\//gi,
        /new\s+WebSocket\(["']wss?:\/\//gi,
        /import\(["']https?:\/\//gi,
      ];
      forbidden.forEach((pattern) => {
        if (pattern.test(content)) violations.push(`${path}: ${pattern}`);
      });
    }
  }
}

visit(root);
if (violations.length) {
  console.error("发现运行时外部资源请求：\n" + violations.join("\n"));
  process.exit(1);
}
console.log("offline verification passed: no external runtime resources");
