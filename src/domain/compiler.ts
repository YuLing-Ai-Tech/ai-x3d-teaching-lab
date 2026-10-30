// 语言编译台：把中文或英文的一句描述读成“形状 + 参数”，再翻译成另外三种语言。
// 核心观点：中文、英文、数学、代码只是同一个关系的四种写法。

export type ShapeKind = "sphere" | "helix" | "cone" | "wave" | "torus";

export interface ShapeSpec {
  kind: ShapeKind;
  values: Record<string, number>;
  /** 句子里没说、只能用默认值“猜”的参数 */
  guessed: string[];
}

export interface CompilerToken { text: string; role?: "object" | "relation" | "quantity" | "vague" }

/** 模糊词：说了等于没说，AI 只能替你决定 */
const VAGUE = ["漂亮", "好看", "大大的", "大一点", "小一点", "一些", "差不多", "大概", "随便", "酷炫", "nice", "beautiful", "big", "some", "cool",
  // 课堂常见的“教师用语”式模糊词：只影响标红，不改变读出的形状与参数
  "适当", "合适", "稍微", "有点", "pretty", "large", "small"];

interface ShapeGrammar {
  words: string[];
  params: Array<{ key: string; words: string[]; fallback: number; min: number; max: number; numberFirst?: boolean }>;
}

const GRAMMAR: Record<ShapeKind, ShapeGrammar> = {
  sphere: { words: ["球体", "球", "sphere", "ball"], params: [{ key: "r", words: ["半径", "radius", "r="], fallback: 2, min: .3, max: 4 }] },
  helix: {
    words: ["螺旋线", "螺旋", "helix", "spiral"],
    params: [
      { key: "r", words: ["半径", "radius", "r="], fallback: 2, min: .3, max: 4 },
      { key: "turns", words: ["圈", "turns", "turn"], fallback: 3, min: .5, max: 8, numberFirst: true },
      { key: "rise", words: ["每圈升高", "升高", "rising", "rise", "pitch"], fallback: 1, min: .1, max: 3 },
    ],
  },
  cone: {
    words: ["圆锥", "锥体", "cone"],
    params: [
      { key: "r", words: ["底面半径", "半径", "radius", "r="], fallback: 2, min: .3, max: 4 },
      { key: "h", words: ["高", "height", "tall", "h="], fallback: 3, min: .3, max: 6 },
    ],
  },
  wave: {
    words: ["波浪面", "波浪", "波面", "wave"],
    params: [
      { key: "lambda", words: ["波长", "wavelength"], fallback: 4, min: 1, max: 10 },
      { key: "amp", words: ["振幅", "amplitude"], fallback: .6, min: .05, max: 2 },
    ],
  },
  torus: {
    words: ["圆环", "环面", "甜甜圈", "torus", "donut", "ring"],
    params: [
      { key: "R", words: ["大半径", "major radius", "环半径", "R"], fallback: 2.4, min: .8, max: 4 },
      { key: "r", words: ["粗", "管半径", "tube radius", "tube", "minor radius", "r"], fallback: .7, min: .1, max: 1.5 },
    ],
  },
};

const DIGITS: Record<string, string> = { 零: "0", 一: "1", 二: "2", 两: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10", 半: "0.5" };
const NUMBER = "(\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十半])";
const toNumber = (value: string) => Number(DIGITS[value] ?? value);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Match { start: number; end: number; role: NonNullable<CompilerToken["role"]> }

export function parseShape(text: string): { spec: ShapeSpec | null; tokens: CompilerToken[] } {
  const { spec, tokens } = readShape(text);
  return { spec, tokens };
}

/** parseShape 的内部版本：多给出“句子里原本写的数”（夹到范围之前），供精确度报告判断机器有没有改动你的数 */
function readShape(text: string): { spec: ShapeSpec | null; tokens: CompilerToken[]; raw: Record<string, number> } {
  const lower = text.toLowerCase();
  const matches: Match[] = [];
  let kind: ShapeKind | null = null;
  let kindAt = Infinity;
  for (const [candidate, grammar] of Object.entries(GRAMMAR) as Array<[ShapeKind, ShapeGrammar]>) {
    for (const word of grammar.words) {
      const at = lower.indexOf(word);
      if (at >= 0 && at < kindAt) { kind = candidate; kindAt = at; }
    }
  }
  if (!kind) return { spec: null, tokens: [{ text }], raw: {} };
  const grammar = GRAMMAR[kind];
  const kindWord = grammar.words.find((word) => lower.indexOf(word) === kindAt)!;
  matches.push({ start: kindAt, end: kindAt + kindWord.length, role: "object" });
  const values: Record<string, number> = {};
  const guessed: string[] = [];
  const raw: Record<string, number> = {};
  for (const param of grammar.params) {
    for (const word of param.words) {
      const pattern = param.numberFirst
        ? new RegExp(`${NUMBER}\\s*(${escape(word)})`)
        : new RegExp(`(${escape(word)})\\s*(?:为|是|=|of|is|:)?\\s*${NUMBER}`);
      // 单个字母（圆环的 R 与 r）区分大小写，在原文上匹配；其余词不区分大小写
      const found = pattern.exec(word.length === 1 ? text : lower);
      if (!found || matches.some((match) => found.index < match.end && found.index + found[0].length > match.start)) continue;
      const [numberText, wordText] = param.numberFirst ? [found[1], found[2]] : [found[2], found[1]];
      raw[param.key] = toNumber(numberText);
      values[param.key] = Math.min(param.max, Math.max(param.min, raw[param.key]));
      const wordAt = found.index + found[0].indexOf(wordText);
      const numberAt = found.index + found[0].lastIndexOf(numberText);
      matches.push({ start: wordAt, end: wordAt + wordText.length, role: "relation" });
      matches.push({ start: numberAt, end: numberAt + numberText.length, role: "quantity" });
      break;
    }
    if (values[param.key] === undefined) {
      values[param.key] = param.fallback;
      guessed.push(param.key);
    }
  }
  for (const word of VAGUE) {
    const at = lower.indexOf(word);
    if (at >= 0 && !matches.some((match) => at < match.end && at + word.length > match.start)) matches.push({ start: at, end: at + word.length, role: "vague" });
  }
  matches.sort((a, b) => a.start - b.start);
  const tokens: CompilerToken[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) tokens.push({ text: text.slice(cursor, match.start) });
    tokens.push({ text: text.slice(match.start, match.end), role: match.role });
    cursor = match.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  return { spec: { kind, values, guessed }, tokens, raw };
}

const fmt = (value: number) => Number(value.toFixed(2)).toString();

/** 同一个世界的四种写法 */
export function translate(spec: ShapeSpec): { zh: string; en: string; math: string; code: string } {
  const v = spec.values;
  switch (spec.kind) {
    case "sphere":
      return { zh: `一个半径为 ${fmt(v.r)} 的球`, en: `A sphere of radius ${fmt(v.r)}`, math: `x² + y² + z² = ${fmt(v.r)}²`, code: `sphere({ radius: ${fmt(v.r)} })` };
    case "helix":
      return {
        zh: `一条半径 ${fmt(v.r)} 的螺旋线，绕 ${fmt(v.turns)} 圈，每圈升高 ${fmt(v.rise)}`,
        en: `A helix of radius ${fmt(v.r)}, ${fmt(v.turns)} turns, rising ${fmt(v.rise)} per turn`,
        math: `(${fmt(v.r)}cos t, ${fmt(v.rise)}·t/2π, ${fmt(v.r)}sin t), 0 ≤ t ≤ ${fmt(v.turns * 2)}π`,
        code: `for (t = 0; t <= ${fmt(v.turns)} * 2*PI; t += dt)\n  point(${fmt(v.r)}*cos(t), ${fmt(v.rise)}*t/(2*PI), ${fmt(v.r)}*sin(t))`,
      };
    case "cone":
      return {
        zh: `一个底面半径 ${fmt(v.r)}、高 ${fmt(v.h)} 的圆锥`, en: `A cone with base radius ${fmt(v.r)} and height ${fmt(v.h)}`,
        math: `x² + z² = (${fmt(v.r)}·(1 − y/${fmt(v.h)}))², 0 ≤ y ≤ ${fmt(v.h)}`, code: `cone({ radius: ${fmt(v.r)}, height: ${fmt(v.h)} })`,
      };
    case "wave":
      return {
        zh: `一张波长 ${fmt(v.lambda)}、振幅 ${fmt(v.amp)} 的波浪面`, en: `A wave surface with wavelength ${fmt(v.lambda)} and amplitude ${fmt(v.amp)}`,
        math: `y = ${fmt(v.amp)}·sin(2πx / ${fmt(v.lambda)})`, code: `surface((x, z) => ${fmt(v.amp)} * sin(2*PI*x / ${fmt(v.lambda)}))`,
      };
    case "torus":
      return {
        zh: `一个大半径 ${fmt(v.R)}、管半径 ${fmt(v.r)} 的圆环`, en: `A torus with major radius ${fmt(v.R)} and tube radius ${fmt(v.r)}`,
        math: `(√(x² + z²) − ${fmt(v.R)})² + y² = ${fmt(v.r)}²`, code: `torus({ R: ${fmt(v.R)}, r: ${fmt(v.r)} })`,
      };
  }
}

/** 在形状表面/曲线上均匀取 count 个点（世界坐标，物体立在 y=0 的网格上） */
export function sampleShape(spec: ShapeSpec, count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const v = spec.values;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const u = (i + .5) / count;
    let x = 0, y = 0, z = 0;
    if (spec.kind === "sphere") {
      const yy = 1 - 2 * u;
      const radius = Math.sqrt(1 - yy * yy);
      x = Math.cos(i * golden) * radius * v.r; z = Math.sin(i * golden) * radius * v.r; y = yy * v.r + v.r + .3;
    } else if (spec.kind === "helix") {
      const t = u * v.turns * Math.PI * 2;
      const jitter = .09;
      x = v.r * Math.cos(t) + (Math.random() - .5) * jitter; z = v.r * Math.sin(t) + (Math.random() - .5) * jitter;
      y = v.rise * t / (Math.PI * 2) + .3 + (Math.random() - .5) * jitter;
    } else if (spec.kind === "cone") {
      const side = Math.hypot(v.r, v.h);
      const onBase = Math.random() < v.r / (v.r + side);
      const angle = Math.random() * Math.PI * 2;
      if (onBase) { const rr = v.r * Math.sqrt(Math.random()); x = rr * Math.cos(angle); z = rr * Math.sin(angle); y = .3; }
      else { const s = Math.sqrt(Math.random()); const rr = v.r * s; x = rr * Math.cos(angle); z = rr * Math.sin(angle); y = .3 + v.h * (1 - s); }
    } else if (spec.kind === "wave") {
      const columns = Math.ceil(Math.sqrt(count));
      const gx = (i % columns) / (columns - 1) - .5;
      const gz = Math.floor(i / columns) / (columns - 1) - .5;
      x = gx * 10; z = gz * 10; y = 2.2 + v.amp * Math.sin(Math.PI * 2 * x / v.lambda);
    } else {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI * 2;
      x = (v.R + v.r * Math.cos(b)) * Math.cos(a); z = (v.R + v.r * Math.cos(b)) * Math.sin(a); y = v.r * Math.sin(b) + v.r + .4;
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

// —— 精确度报告：一句话里哪些是你说的，哪些是机器替你决定的 ——

export const SHAPE_LABEL: Record<ShapeKind, string> = { sphere: "球", helix: "螺旋线", cone: "圆锥", wave: "波浪面", torus: "圆环" };
export const PARAM_LABEL: Record<string, string> = { r: "半径", turns: "圈数", rise: "每圈升高", h: "高", lambda: "波长", amp: "振幅", R: "大半径" };
/** 圆环的 r 是管半径，与球、圆锥、螺旋线的“半径”不是同一个量 */
export const paramLabel = (kind: ShapeKind, key: string) => (kind === "torus" && key === "r" ? "管半径" : PARAM_LABEL[key] ?? key);

export interface ParamReport {
  key: string;
  label: string;
  /** 机器最终用的值 */
  value: number;
  /** 句子里写出来了 */
  stated: boolean;
  /** 没写时机器用的默认值 */
  fallback: number;
  /** 句子里原本写的数（夹到范围之前） */
  raw?: number;
  /** 写了，但超出解析器范围，被机器改成了边界值 */
  clamped: boolean;
  range: [number, number];
}

export interface PrecisionReport {
  ok: boolean;
  kind: ShapeKind | null;
  spec: ShapeSpec | null;
  params: ParamReport[];
  stated: ParamReport[];
  guessed: ParamReport[];
  clamped: ParamReport[];
  /** 识别到的模糊词（与标红的词一致） */
  vague: string[];
  /** 交给机器的决定：被猜的 + 被改动的参数个数 */
  decisions: number;
}

export function precisionReport(text: string): PrecisionReport {
  const { spec, tokens, raw } = readShape(text);
  const vague = tokens.filter((token) => token.role === "vague").map((token) => token.text);
  if (!spec) return { ok: false, kind: null, spec: null, params: [], stated: [], guessed: [], clamped: [], vague, decisions: 0 };
  const params = GRAMMAR[spec.kind].params.map((param): ParamReport => {
    const stated = !spec.guessed.includes(param.key);
    return {
      key: param.key, label: paramLabel(spec.kind, param.key), value: spec.values[param.key], stated, fallback: param.fallback,
      raw: stated ? raw[param.key] : undefined, clamped: stated && raw[param.key] !== spec.values[param.key], range: [param.min, param.max],
    };
  });
  const guessed = params.filter((param) => !param.stated);
  const clamped = params.filter((param) => param.clamped);
  return { ok: true, kind: spec.kind, spec, params, stated: params.filter((param) => param.stated), guessed, clamped, vague, decisions: guessed.length + clamped.length };
}

export type WorldVerdict = "same" | "same-by-default" | "different-values" | "different-shape" | "unreadable";

export const WORLD_LABEL: Record<WorldVerdict, string> = {
  same: "同一个世界",
  "same-by-default": "看似相同（靠机器默认值）",
  "different-values": "形状相同、数不同",
  "different-shape": "不是同一种形状",
  unreadable: "有一句读不懂",
};

/** 两句话是不是描述同一个世界：形状相同且每个参数都相同；若有参数是猜的，只能算“看似相同” */
export function sameWorld(a: ShapeSpec | null, b: ShapeSpec | null): { verdict: WorldVerdict; differences: Array<{ key: string; label: string; a: number; b: number }> } {
  if (!a || !b) return { verdict: "unreadable", differences: [] };
  if (a.kind !== b.kind) return { verdict: "different-shape", differences: [] };
  const differences = Object.keys(a.values)
    .filter((key) => Math.abs(a.values[key] - b.values[key]) > 1e-9)
    .map((key) => ({ key, label: paramLabel(a.kind, key), a: a.values[key], b: b.values[key] }));
  if (differences.length) return { verdict: "different-values", differences };
  return { verdict: a.guessed.length || b.guessed.length ? "same-by-default" : "same", differences };
}

export type LanguageForm = "中文" | "English" | "代码式" | "数学式";

/** 粗分这句话是用哪种“语言”写的（课堂记录用） */
export function languageForm(text: string): LanguageForm {
  if (/[一-鿿]/.test(text)) return "中文";
  if (/[²³√π]|\b(?:sin|cos)\b|^[\sxyzt\d+\-*/^=().,²]+$/i.test(text)) return "数学式";
  if (/[({}=;]|\w\s*:/.test(text)) return "代码式";
  return "English";
}
