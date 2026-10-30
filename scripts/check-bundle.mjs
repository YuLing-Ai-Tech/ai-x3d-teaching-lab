import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// 首屏体积守门：index.html 直接加载（含 modulepreload）的 JS 合计不超过 250 KB，且不得包含三大依赖块。
const dist = "dist";
const html = readFileSync(join(dist, "index.html"), "utf8");
const initial = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((match) => match[1]);
const heavy = initial.filter((file) => /vendor-(three|maplibre|deckgl)/.test(file));
const bytes = initial.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
const limit = 250 * 1024;
console.log(`首屏 JS：${initial.join(", ")} = ${(bytes / 1024).toFixed(1)} KB（上限 ${limit / 1024} KB）`);
if (heavy.length) { console.error(`首屏不应加载：${heavy.join(", ")}`); process.exit(1); }
if (bytes > limit) { console.error("首屏 JS 超出上限"); process.exit(1); }
console.log("bundle verification passed");
