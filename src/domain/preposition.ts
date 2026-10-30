// 英语 · 介词即空间：把 “The cat is under the table.” 读成 主体 + 空间关系 + 参照物，
// 并给出这个介词的“逻辑式”——介词就是一个空间谓词。

export const NOUNS: Record<string, string> = {
  cat: "猫", ball: "球", bird: "鸟", car: "车", box: "盒子", table: "桌子", tree: "树", house: "房子", tunnel: "隧道", river: "河", chair: "椅子",
  window: "窗户", door: "门",
};

/** 有“开口”的参照物：只有它们才能被 through 穿过 */
export const OPENINGS = ["tunnel", "window", "door"];

export type Relation =
  | "on" | "under" | "in" | "above" | "behind" | "in front of" | "next to" | "between"
  | "through" | "across" | "around" | "over" | "into" | "out of" | "along";

interface RelationInfo { zh: (a: string, b: string, c?: string) => string; logic: string; motion: boolean }

export const RELATIONS: Record<Relation, RelationInfo> = {
  on: { zh: (a, b) => `${a}在${b}上面`, logic: "on(A, B) ⇔ A 的底面贴着 B 的顶面 ∧ A 在 B 的投影范围内", motion: false },
  under: { zh: (a, b) => `${a}在${b}下面`, logic: "under(A, B) ⇔ A 的高度 < B 的底面 ∧ A 在 B 的投影范围内", motion: false },
  in: { zh: (a, b) => `${a}在${b}里面`, logic: "in(A, B) ⇔ A ⊂ B 的内部空间", motion: false },
  above: { zh: (a, b) => `${a}在${b}上方`, logic: "above(A, B) ⇔ A 的高度 > B 的顶面 ∧ A 与 B 不接触", motion: false },
  behind: { zh: (a, b) => `${a}在${b}后面`, logic: "behind(A, B) ⇔ 从观察者看过去，B 挡在 A 前面（取决于你站在哪里！）", motion: false },
  "in front of": { zh: (a, b) => `${a}在${b}前面`, logic: "in_front_of(A, B) ⇔ 从观察者看过去，A 挡在 B 前面", motion: false },
  "next to": { zh: (a, b) => `${a}在${b}旁边`, logic: "next_to(A, B) ⇔ A 与 B 同一高度 ∧ 距离很近", motion: false },
  between: { zh: (a, b, c) => `${a}在${b}和${c}之间`, logic: "between(A, B, C) ⇔ A 位于 B 与 C 的连线上", motion: false },
  through: { zh: (a, b) => `${a}穿过${b}`, logic: "through(A, B) ⇔ B 有开口 ∧ A 的路径从开口一侧进入、从另一侧离开，且不与 B 的实体相交", motion: true },
  across: { zh: (a, b) => `${a}横穿${b}`, logic: "across(A, B) ⇔ A 的路径从 B 的一侧到达另一侧", motion: true },
  around: { zh: (a, b) => `${a}绕着${b}转`, logic: "around(A, B) ⇔ A 的路径是一条包围 B 的闭合曲线", motion: true },
  over: { zh: (a, b) => `${a}越过${b}`, logic: "over(A, B) ⇔ A 的路径在 B 的上方经过", motion: true },
  into: { zh: (a, b) => `${a}进入${b}`, logic: "into(A, B) ⇔ 路径起点在 B 外，终点在 B 内", motion: true },
  "out of": { zh: (a, b) => `${a}离开${b}`, logic: "out_of(A, B) ⇔ 路径起点在 B 内，终点在 B 外", motion: true },
  along: { zh: (a, b) => `${a}沿着${b}走`, logic: "along(A, B) ⇔ A 的路径与 B 的方向平行", motion: true },
};

export interface SpatialSentence {
  subject: string;
  relation: Relation;
  landmarks: string[];
}

export type PrepRole = "subject" | "relation" | "landmark" | "verb";
const VERBS = ["is", "are", "sits", "goes", "walks", "runs", "flies", "jumps", "drives", "rolls", "swims", "hides"];
const RELATION_WORDS = (Object.keys(RELATIONS) as Relation[]).sort((a, b) => b.length - a.length);

export function parseSentence(text: string): { sentence: SpatialSentence | null; tokens: Array<{ text: string; role?: PrepRole }>; message?: string } {
  const lower = text.toLowerCase();
  const marks: Array<{ start: number; end: number; role: PrepRole }> = [];
  const overlaps = (start: number, end: number) => marks.some((m) => start < m.end && end > m.start);
  let relation: Relation | null = null;
  let relationAt = -1;
  for (const word of RELATION_WORDS) {
    const match = new RegExp(`\\b${word}\\b`).exec(lower);
    if (match && !overlaps(match.index, match.index + word.length)) {
      relation = word;
      relationAt = match.index;
      marks.push({ start: match.index, end: match.index + word.length, role: "relation" });
      break;
    }
  }
  const nouns: Array<{ word: string; at: number }> = [];
  for (const match of lower.matchAll(/\b([a-z]+)\b/g)) {
    const word = match[1];
    if (NOUNS[word]) nouns.push({ word, at: match.index! });
    if (VERBS.includes(word)) marks.push({ start: match.index!, end: match.index! + word.length, role: "verb" });
  }
  const subject = nouns.find((noun) => noun.at < relationAt);
  const landmarks = nouns.filter((noun) => noun.at > relationAt);
  if (subject) marks.push({ start: subject.at, end: subject.at + subject.word.length, role: "subject" });
  landmarks.forEach((noun) => marks.push({ start: noun.at, end: noun.at + noun.word.length, role: "landmark" }));
  marks.sort((a, b) => a.start - b.start);
  const tokens: Array<{ text: string; role?: PrepRole }> = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) tokens.push({ text: text.slice(cursor, m.start) });
    tokens.push({ text: text.slice(m.start, m.end), role: m.role });
    cursor = m.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  if (!relation) return { sentence: null, tokens, message: "没有找到介词。试试 on / under / in / above / behind / between / through / across / around / over / into。" };
  if (!subject || !landmarks.length) return { sentence: null, tokens, message: `认识的名词：${Object.keys(NOUNS).join(", ")}。句子需要“主体 + 介词 + 参照物”。` };
  if (relation === "through" && !OPENINGS.includes(landmarks[0].word)) {
    return { sentence: null, tokens, message: `through 要求参照物有“开口”——${NOUNS[landmarks[0].word]}没有开口，穿过去就是穿墙。试试 through the tunnel / window / door。` };
  }
  if (relation === "between" && landmarks.length < 2) return { sentence: null, tokens, message: "between 需要两个参照物：between the box and the tree。" };
  return { sentence: { subject: subject.word, relation, landmarks: landmarks.map((noun) => noun.word).slice(0, 2) }, tokens };
}

// —— 空间谓词的几何判定：探究证据来自场景里真实的包围盒与路径，不是预设文字 ——
// 约定：y 向上；每个物体立在自己的底面上；参照物自身的“前方”是 +z（默认镜头所在一侧）。

export type Vec3 = [number, number, number];
export interface Box { min: Vec3; max: Vec3 }
export interface SpatialMeasure {
  /** 主体在静态介词下的最终位置；动态介词取路径起点 */
  subject: Box;
  /** 主体中心的路径（动态介词）；静态介词为空 */
  path: Vec3[];
  landmarks: Box[];
  /** 参照物是否有可穿过的开口及开口的高度范围 */
  openings: Array<{ bottom: number; top: number } | undefined>;
  /** 观察者（镜头）位置 */
  viewer: Vec3;
}
export interface Check { label: string; pass: boolean }
export interface Judgement { holds: boolean; checks: Check[]; frame?: "observer" | "intrinsic" }

const centre = (box: Box): Vec3 => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
const within = (value: number, low: number, high: number, slack = 0.05) => value >= low - slack && value <= high + slack;
const inFootprint = (point: Vec3, box: Box, slack = 0.05) => within(point[0], box.min[0], box.max[0], slack) && within(point[2], box.min[2], box.max[2], slack);
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** behind / in front of 的两种参照系：以观察者为准（会随视角改变），以参照物自身的前方为准（不变） */
export function frontBack(relation: "behind" | "in front of", measure: SpatialMeasure): { observer: Judgement; intrinsic: Judgement } {
  const a = centre(measure.subject);
  const b = measure.landmarks[0];
  const bc = centre(b);
  const toA = sub3(a, measure.viewer);
  const toB = sub3(bc, measure.viewer);
  const farther = len3(toA) > len3(toB);
  const nearer = len3(toA) < len3(toB);
  const cos = (toA[0] * toB[0] + toA[1] * toB[1] + toA[2] * toB[2]) / (len3(toA) * len3(toB));
  const radius = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2 + 0.6;
  const aligned = Math.acos(Math.min(1, cos)) < Math.atan(radius / len3(toB)) * 1.6;
  const observerHolds = relation === "behind" ? farther && aligned : nearer && aligned;
  const intrinsicHolds = relation === "behind" ? a[2] < b.min[2] : a[2] > b.max[2];
  return {
    observer: { frame: "observer", holds: observerHolds, checks: [
      { label: relation === "behind" ? "从观察者看，A 比 B 远" : "从观察者看，A 比 B 近", pass: relation === "behind" ? farther : nearer },
      { label: "A 与 B 大致在同一视线上（会被挡住 / 挡住 B）", pass: aligned },
    ] },
    intrinsic: { frame: "intrinsic", holds: intrinsicHolds, checks: [
      { label: relation === "behind" ? "A 在 B 自身“背面”一侧（−z）" : "A 在 B 自身“正面”一侧（+z）", pass: intrinsicHolds },
    ] },
  };
}

export function judge(sentence: SpatialSentence, measure: SpatialMeasure): Judgement {
  const A = measure.subject;
  const [B, C] = measure.landmarks;
  const a = centre(A);
  const path = measure.path;
  const start = path[0];
  const end = path[path.length - 1];
  const result = (checks: Check[]): Judgement => ({ holds: checks.every((check) => check.pass), checks });
  switch (sentence.relation) {
    case "on": return result([
      { label: "A 的底面贴着 B 的顶面", pass: Math.abs(A.min[1] - B.max[1]) < 0.08 },
      { label: "A 在 B 的投影范围内", pass: inFootprint(a, B) },
    ]);
    case "under": return result([
      { label: "A 低于 B 的顶面", pass: A.max[1] < B.max[1] - 0.05 },
      { label: "A 在 B 的投影范围内", pass: inFootprint(a, B) },
    ]);
    case "in": return result([
      { label: "A 的每一边都在 B 的内部", pass: [0, 1, 2].every((k) => A.min[k] >= B.min[k] - 0.05 && A.max[k] <= B.max[k] + 0.05) },
    ]);
    case "above": return result([
      { label: "A 的底面高于 B 的顶面", pass: A.min[1] > B.max[1] + 0.05 },
      { label: "A 与 B 不接触", pass: A.min[1] - B.max[1] > 0.2 },
    ]);
    case "next to": {
      const gap = Math.max(B.min[0] - A.max[0], A.min[0] - B.max[0], B.min[2] - A.max[2], A.min[2] - B.max[2]);
      return result([
        { label: "A 与 B 在同一高度", pass: Math.abs(A.min[1] - B.min[1]) < 0.3 },
        { label: "A 与 B 很近但不重叠（间隙 0–1.2）", pass: gap > 0 && gap < 1.2 },
      ]);
    }
    case "between": {
      const b = centre(B);
      const c = centre(C);
      const bc = sub3(c, b);
      const t = ((a[0] - b[0]) * bc[0] + (a[2] - b[2]) * bc[2]) / (bc[0] ** 2 + bc[2] ** 2);
      const offset = Math.hypot(a[0] - (b[0] + t * bc[0]), a[2] - (b[2] + t * bc[2]));
      return result([
        { label: "A 在 B 与 C 的连线上", pass: offset < 0.8 },
        { label: "A 位于 B、C 两者之间（不在外侧）", pass: t > 0.1 && t < 0.9 },
      ]);
    }
    case "behind":
    case "in front of": return frontBack(sentence.relation, measure).observer;
    case "through": {
      const opening = measure.openings[0];
      const inside = path.filter((p) => within(p[0], B.min[0], B.max[0], 0));
      return result([
        { label: "B 有开口", pass: Boolean(opening) },
        { label: "路径从 B 的一侧进入、从另一侧离开", pass: (start[0] < B.min[0] && end[0] > B.max[0]) || (start[0] > B.max[0] && end[0] < B.min[0]) },
        { label: "穿行时始终在开口的高度范围内", pass: Boolean(opening) && inside.length > 0 && inside.every((p) => p[1] >= opening!.bottom - 0.05 && p[1] <= opening!.top + 0.05) },
      ]);
    }
    case "across": return result([
      { label: "路径从 B 的一侧到达另一侧", pass: (start[2] > B.max[2] && end[2] < B.min[2]) || (start[2] < B.min[2] && end[2] > B.max[2]) },
    ]);
    case "around": {
      const b = centre(B);
      let turn = 0;
      for (let i = 1; i < path.length; i += 1) {
        let d = Math.atan2(path[i][2] - b[2], path[i][0] - b[0]) - Math.atan2(path[i - 1][2] - b[2], path[i - 1][0] - b[0]);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        turn += d;
      }
      return result([
        { label: "路径绕 B 转满一圈（≥ 330°）", pass: Math.abs(turn) * 180 / Math.PI >= 330 },
        { label: "路径始终不穿过 B", pass: path.every((p) => !inFootprint(p, B, -0.05)) },
      ]);
    }
    case "over": {
      const above = path.filter((p) => within(p[0], B.min[0], B.max[0], 0));
      return result([
        { label: "经过 B 时路径高于 B 的顶面", pass: above.length > 0 && above.every((p) => p[1] > B.max[1]) },
        { label: "起点和终点在 B 的两侧", pass: (start[0] < B.min[0] && end[0] > B.max[0]) || (start[0] > B.max[0] && end[0] < B.min[0]) },
      ]);
    }
    case "into":
    case "out of": {
      const inB = (p: Vec3) => inFootprint(p, B) && within(p[1], B.min[1], B.max[1]);
      const entering = !inB(start) && inB(end);
      const leaving = inB(start) && !inB(end);
      return result([
        { label: sentence.relation === "into" ? "起点在 B 外，终点在 B 内" : "起点在 B 内，终点在 B 外", pass: sentence.relation === "into" ? entering : leaving },
      ]);
    }
    case "along": {
      const longX = B.max[0] - B.min[0] >= B.max[2] - B.min[2];
      const d = sub3(end, start);
      const angle = Math.atan2(longX ? Math.abs(d[2]) : Math.abs(d[0]), longX ? Math.abs(d[0]) : Math.abs(d[2])) * 180 / Math.PI;
      return result([
        { label: "路径方向与 B 的长边平行（夹角 < 15°）", pass: angle < 15 },
      ]);
    }
  }
}
