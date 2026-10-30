// 古诗即几何：逐字读诗句，每个字都可能是“构图指令”。
// 王维“大漠孤烟直，长河落日圆”：直 = 垂线，圆 = 圆，长河与地平线 = 水平线。

export type PoemRole = "scene" | "shape" | "count" | "time";

export interface PoemWorld {
  ground: "desert" | "snow" | "grass";
  smokeCount: number;
  smokeShape: "straight" | "slant" | "chaos";
  river: boolean;
  body: "sun" | "moon";
  phase: "setting" | "rising" | "high";
  disc: "full" | "broken" | "half";
}

interface Rule { role: PoemRole; apply: (world: PoemWorld) => void }

const RULES: Record<string, Rule> = {
  漠: { role: "scene", apply: (w) => { w.ground = "desert"; } },
  沙: { role: "scene", apply: (w) => { w.ground = "desert"; } },
  雪: { role: "scene", apply: (w) => { w.ground = "snow"; } },
  草: { role: "scene", apply: (w) => { w.ground = "grass"; } },
  烟: { role: "scene", apply: () => undefined },
  河: { role: "scene", apply: (w) => { w.river = true; } },
  江: { role: "scene", apply: (w) => { w.river = true; } },
  日: { role: "scene", apply: (w) => { w.body = "sun"; } },
  月: { role: "scene", apply: (w) => { w.body = "moon"; } },
  孤: { role: "count", apply: (w) => { w.smokeCount = 1; } },
  双: { role: "count", apply: (w) => { w.smokeCount = 2; } },
  群: { role: "count", apply: (w) => { w.smokeCount = 5; } },
  万: { role: "count", apply: (w) => { w.smokeCount = 9; } },
  直: { role: "shape", apply: (w) => { w.smokeShape = "straight"; } },
  斜: { role: "shape", apply: (w) => { w.smokeShape = "slant"; } },
  乱: { role: "shape", apply: (w) => { w.smokeShape = "chaos"; } },
  散: { role: "shape", apply: (w) => { w.smokeShape = "chaos"; } },
  圆: { role: "shape", apply: (w) => { w.disc = "full"; } },
  缺: { role: "shape", apply: (w) => { w.disc = "broken"; } },
  残: { role: "shape", apply: (w) => { w.disc = "broken"; } },
  半: { role: "shape", apply: (w) => { w.disc = "half"; } },
  落: { role: "time", apply: (w) => { w.phase = "setting"; } },
  旭: { role: "time", apply: (w) => { w.phase = "rising"; } },
  升: { role: "time", apply: (w) => { w.phase = "rising"; } },
  烈: { role: "time", apply: (w) => { w.phase = "high"; } },
  高: { role: "time", apply: (w) => { w.phase = "high"; } },
};

export function parsePoem(text: string): { world: PoemWorld; tokens: Array<{ text: string; role?: PoemRole }>; recognised: number } {
  const world: PoemWorld = { ground: "desert", smokeCount: 1, smokeShape: "straight", river: false, body: "sun", phase: "setting", disc: "full" };
  let recognised = 0;
  const tokens = [...text].map((char) => {
    const rule = RULES[char];
    if (!rule) return { text: char };
    rule.apply(world);
    recognised += 1;
    return { text: char, role: rule.role };
  });
  return { world, tokens, recognised };
}

const SHAPE_WORDS: Record<PoemWorld["smokeShape"], string> = { straight: "直 → 一条垂直线", slant: "斜 → 一条倾斜线（有风）", chaos: "乱 → 没有几何秩序" };
const DISC_WORDS: Record<PoemWorld["disc"], string> = { full: "圆 → 一个完整的圆", broken: "缺 → 圆被打破", half: "半 → 半圆压在地平线上" };

export function describePoem(world: PoemWorld): string {
  return [
    `<b>横</b>　${world.river ? "长河 + 地平线 → 水平线" : "地平线 → 水平线"}`,
    `<b>竖</b>　${SHAPE_WORDS[world.smokeShape]}`,
    `<b>圆</b>　${DISC_WORDS[world.disc]}`,
  ].join("<br>");
}
