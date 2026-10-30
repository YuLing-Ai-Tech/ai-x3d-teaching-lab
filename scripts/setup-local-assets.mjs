import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);

function findContainer(start) {
  let current = start;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(current, "private-assets", "runtime", "public");
    if (existsSync(candidate)) return { container: current, privatePublic: candidate };
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("找不到 private-assets/runtime/public；请把 worktree 放在 ZhiJing-AI-X3D-Lab 容器内。");
}

const { privatePublic } = findContainer(projectRoot);
const publicRoot = join(projectRoot, "public");
const publicCore = join(projectRoot, "public-core");

rmSync(publicRoot, { recursive: true, force: true });
cpSync(publicCore, publicRoot, { recursive: true });

const mounts = [
  "blender",
  "media",
  "terrain",
  "data/china-hd",
  "data/china-relief",
  "data/long-march",
  "data/china-outline.json",
  "data/china-nine-dash.json",
  "data/china-terrain.json",
  "data/terrain-samples.json",
];

for (const relativePath of mounts) {
  const source = join(privatePublic, relativePath);
  if (!existsSync(source)) throw new Error(`私有资产缺失：${source}`);
  const target = join(publicRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  symlinkSync(source, target);
}

console.log(`local-full assets mounted from ${privatePublic}`);
