// 一句话定义引力：从“引力与距离的平方成反比”这样的句子里读出指数 n 与中心质量。
// a ∝ M / r^n。贝特朗定理：只有 n = 2（平方反比）与 n = −1（正比，胡克力）给出闭合轨道。

export interface GravityLaw {
  exponent: number;
  mass: number;
}

export type GravityRole = "object" | "relation" | "quantity";

const POWERS: Array<[string, number]> = [["平方", 2], ["二次方", 2], ["立方", 3], ["三次方", 3], ["一次方", 1], ["square", 2], ["cube", 3]];
const OBJECTS = ["引力", "距离", "质量", "中心天体", "gravity", "distance", "mass"];
const RELATIONS = ["成反比", "反比", "成正比", "正比", "inversely proportional", "proportional", "加倍", "doubled", "无关"];

export function parseGravity(text: string): { law: GravityLaw | null; tokens: Array<{ text: string; role?: GravityRole }> } {
  const lower = text.toLowerCase();
  const marks: Array<{ start: number; end: number; role: GravityRole }> = [];
  const mark = (word: string, role: GravityRole) => {
    let at = lower.indexOf(word);
    while (at >= 0) {
      if (!marks.some((m) => at < m.end && at + word.length > m.start)) marks.push({ start: at, end: at + word.length, role });
      at = lower.indexOf(word, at + word.length);
    }
  };
  let exponent: number | null = null;
  const numeric = /(\d+(?:\.\d+)?)\s*(次方|次幂|th power|power)/.exec(lower);
  if (numeric) {
    exponent = Number(numeric[1]);
    marks.push({ start: numeric.index, end: numeric.index + numeric[0].length, role: "quantity" });
  }
  for (const [word, value] of POWERS) {
    if (lower.includes(word)) {
      exponent ??= value;
      mark(word, "quantity");
    }
  }
  OBJECTS.forEach((word) => mark(word, "object"));
  RELATIONS.forEach((word) => mark(word, "relation"));
  const direct = /成正比|正比|(?<!inversely )proportional/.test(lower) && !/反比|inversely/.test(lower);
  const independent = /无关|不随距离/.test(lower);
  if (independent) exponent = 0;
  if (direct) exponent = -(exponent ?? 1);
  if (exponent === null && /反比|inversely/.test(lower)) exponent = 1;
  const mass = /加倍|翻倍|doubled|两倍|2\s*倍/.test(lower) ? 2 : /减半|halved/.test(lower) ? .5 : 1;
  if (/加倍|翻倍|两倍|2\s*倍|减半/.test(lower)) mark(/加倍|翻倍|两倍|2\s*倍|减半/.exec(lower)![0], "quantity");

  marks.sort((a, b) => a.start - b.start);
  const tokens: Array<{ text: string; role?: GravityRole }> = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) tokens.push({ text: text.slice(cursor, m.start) });
    tokens.push({ text: text.slice(m.start, m.end), role: m.role });
    cursor = m.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  return { law: exponent === null ? null : { exponent, mass }, tokens };
}

/** 按理论给出“这条定律下宇宙会怎样”——只作教师参考与录像讲解；探究证据必须来自 simulateOrbit() */
export function predictOrbit(law: GravityLaw): { verdict: string; tone: "ok" | "warn" } {
  const n = law.exponent;
  if (Math.abs(n - 2) < 1e-6) return { verdict: "轨道闭合成椭圆，行星年复一年回到原处——这就是我们的太阳系。", tone: "ok" };
  if (Math.abs(n + 1) < 1e-6) return { verdict: "力随距离变大：轨道是以恒星为中心的闭合椭圆（胡克力）。闭合，但不是我们的宇宙。", tone: "ok" };
  if (n >= 3) return { verdict: "轨道不再稳定：行星不是螺旋坠入恒星，就是被甩向深空。", tone: "warn" };
  if (n > 2) return { verdict: "只差一点点：轨道不闭合，每一圈都在转动（进动），画出花瓣。", tone: "warn" };
  if (n <= 0) return { verdict: "引力不随距离减弱：行星被牢牢拉住，轨道不闭合、不断扭转。", tone: "warn" };
  return { verdict: "轨道不闭合：每一圈都错开一个角度，画出玫瑰线。", tone: "warn" };
}

export function formula(law: GravityLaw): string {
  const n = Number(law.exponent.toFixed(2));
  const m = law.mass === 1 ? "M" : `${law.mass}M`;
  return n === 0 ? `F = G·${m}·m` : n < 0 ? `F = k·${m}·m·r${n === -1 ? "" : `^${-n}`}` : `F = G·${m}·m / r${n === 1 ? "" : `^${n}`}`;
}

// —— 可复现的轨道模拟：探究证据只从这里来（场景也用同一个积分器回放） ——
// 中心力 a = M·(r/R0)^(−n)，单位制里 GM = 25（R0 = 5 时与 n 无关）；固定步长蛙跳法（kick-drift-kick，辛积分），
// 不随帧率变化。r < 1 记为坠落，r > 46 记为逃逸。只算平面运动，不考虑行星之间的引力与相对论效应。

export const R0 = 5;
export const CRASH_RADIUS = 1;
export const ESCAPE_RADIUS = 46;
export const SIM_DT = 0.002;
export const PLANET_ORBITS: Array<{ name: string; r: number; boost: number }> = [
  { name: "水星", r: 2.6, boost: 1 },
  { name: "地球", r: 4.2, boost: 0.86 },
  { name: "火星", r: 6, boost: 1.1 },
  { name: "巨行星", r: 8, boost: 0.93 },
  { name: "冰巨星", r: 10.2, boost: 1.04 },
];

export interface OrbitState { x: number; y: number; vx: number; vy: number; t: number }
export type OrbitFate = "stable" | "crash" | "escape";

export function initialOrbit(index: number, speedFactor = 1): OrbitState {
  const planet = PLANET_ORBITS[index];
  const angle = index * 2.1;
  const speed = Math.sqrt(25 / planet.r) * planet.boost * speedFactor;  // 平方反比下的圆轨道速度 × boost
  return { x: Math.cos(angle) * planet.r, y: Math.sin(angle) * planet.r, vx: -Math.sin(angle) * speed, vy: Math.cos(angle) * speed, t: 0 };
}

export function accelerationMagnitude(law: GravityLaw, r: number): number {
  return law.mass * Math.pow(Math.max(r, 0.25) / R0, -law.exponent);
}

/** 一步蛙跳：半步加速 → 整步移动 → 半步加速 */
export function stepOrbit(state: OrbitState, law: GravityLaw, dt = SIM_DT): void {
  const kick = (h: number) => {
    const r = Math.hypot(state.x, state.y);
    const a = accelerationMagnitude(law, r) / Math.max(r, 1e-9);
    state.vx -= a * state.x * h;
    state.vy -= a * state.y * h;
  };
  kick(dt / 2);
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  kick(dt / 2);
  state.t += dt;
}

/** 势能（与 a 对应），用于检查数值误差 */
export function potential(law: GravityLaw, r: number): number {
  const n = law.exponent;
  const k = law.mass * Math.pow(R0, n);
  return Math.abs(n - 1) < 1e-9 ? k * Math.log(r) : (k * Math.pow(r, 1 - n)) / (1 - n);
}

export interface OrbitReport {
  fate: OrbitFate;
  /** 结局发生（或模拟结束）的时刻，模型时间单位 */
  time: number;
  /** 经过近日点的次数 */
  periapses: number;
  perihelion?: number;
  aphelion?: number;
  /** 相邻两次近日点之间转过的角度（度）；360 表示每圈回到原处 */
  apsidalAdvance?: number;
  /** 每圈进动 = apsidalAdvance − 360（度）；正为与公转同向 */
  precession?: number;
  /** 能量相对误差（数值误差的指标） */
  energyError: number;
  /** 近圆轨道下的理论进动（度）：360/√(3−n) − 360，仅 n < 3 */
  theoryPrecession?: number;
}

export function theoryPrecession(exponent: number): number | undefined {
  return exponent < 3 ? 360 / Math.sqrt(3 - exponent) - 360 : undefined;
}

export function simulateOrbit(law: GravityLaw, index: number, speedFactor = 1, options: { maxTime?: number; maxPeriapses?: number; dt?: number } = {}): OrbitReport {
  const dt = options.dt ?? SIM_DT;
  const maxTime = options.maxTime ?? 400;
  const maxPeriapses = options.maxPeriapses ?? 10;
  const state = initialOrbit(index, speedFactor);
  const energy = () => 0.5 * (state.vx ** 2 + state.vy ** 2) + potential(law, Math.hypot(state.x, state.y));
  const e0 = energy();
  let energyError = 0;
  let previousR = Math.hypot(state.x, state.y);
  let previousDr = 0;
  let angle = Math.atan2(state.y, state.x);
  let lastAngle = angle;
  const periAngles: number[] = [];
  const periR: number[] = [];
  const apoR: number[] = [];
  let fate: OrbitFate = "stable";
  while (state.t < maxTime && periAngles.length < maxPeriapses + 1) {
    stepOrbit(state, law, dt);
    const r = Math.hypot(state.x, state.y);
    const current = Math.atan2(state.y, state.x);
    let delta = current - lastAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    angle += delta;
    lastAngle = current;
    const dr = r - previousR;
    if (previousDr < 0 && dr >= 0) { periAngles.push(angle); periR.push(previousR); }
    if (previousDr > 0 && dr <= 0) apoR.push(previousR);
    previousDr = dr;
    previousR = r;
    energyError = Math.max(energyError, Math.abs(energy() - e0) / Math.max(Math.abs(e0), 1e-9));
    if (r < CRASH_RADIUS) { fate = "crash"; break; }
    if (r > ESCAPE_RADIUS) { fate = "escape"; break; }
  }
  const steps = periAngles.slice(1).map((value, i) => (value - periAngles[i]) * 180 / Math.PI);
  const advance = steps.length ? steps.reduce((sum, value) => sum + value, 0) / steps.length : undefined;
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  const nearlyCircular = periR.length > 0 && apoR.length > 0 && (mean(apoR)! - mean(periR)!) / mean(apoR)! < 0.002;
  return {
    fate, time: state.t, periapses: periAngles.length,
    perihelion: mean(periR), aphelion: mean(apoR),
    apsidalAdvance: nearlyCircular ? undefined : advance,
    precession: nearlyCircular || advance === undefined ? undefined : advance - 360,
    energyError, theoryPrecession: theoryPrecession(law.exponent),
  };
}

export const FATE_LABEL: Record<OrbitFate, string> = { stable: "稳定绕行", crash: "坠入恒星", escape: "逃逸" };
