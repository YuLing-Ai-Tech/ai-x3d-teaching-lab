import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const roots = ["src", "scripts", "tests", "blender"];
const extensions = new Set([".ts", ".js", ".mjs", ".py", ".html"]);
const over = [];

function visit(directory) {
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, name.name);
    if (name.isDirectory()) visit(path);
    else if ([...extensions].some((extension) => name.name.endsWith(extension))) {
      const lines = readFileSync(path, "utf8").split("\n").length;
      if (lines > 800) over.push(`${path}: ${lines}`);
      else if (lines >= 400) console.warn(`review responsibility split: ${path} (${lines} lines)`);
    }
  }
}

roots.filter((root) => statSync(root, { throwIfNoEntry: false })?.isDirectory()).forEach(visit);
if (over.length) {
  console.error("手写程序文件超过 800 行：\n" + over.join("\n"));
  process.exit(1);
}
console.log("file length verification passed");
