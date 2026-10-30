// 圆锥截线的真实几何：不再按角度阈值“贴图”，而是直接求平面与双圆锥的交线。
//
// 双圆锥：顶点在原点，轴为 y，半顶角 α：x² + z² = (y·tanα)²。
// 切面：过轴上一点 (0, h, 0)，含水平方向 u = (1,0,0) 和与轴成 β 角的方向 v = (0, cosβ, sinβ)。
// 平面内正交坐标 (s, t)：P = (s, h + t·cosβ, t·sinβ)。代入圆锥得
//   s² + A·t² − 2hk·cosβ·t − h²k = 0，  k = tan²α，  A = sin²β − k·cos²β。
// A > 0 ⇔ β > α：椭圆；A = 0：抛物线；A < 0：双曲线。离心率 e = cosβ / cosα，与 h 无关。

export type ConicKind = "circle" | "ellipse" | "parabola" | "hyperbola";
export type DegenerateKind = "point" | "line" | "line-pair";

export interface ConicInput {
  /** 圆锥半顶角 α（度），母线与轴的夹角 */
  alpha: number;
  /** 切面与圆锥轴的夹角 β（度）；90° 时切面水平 */
  beta: number;
  /** 切面与轴的交点到顶点的距离 h；0 时切面过顶点 */
  h: number;
}

export interface ConicSection {
  input: ConicInput;
  kind: ConicKind;
  degenerate?: DegenerateKind;
  /** 离心率 */
  e: number;
  /** 平面内的对称中心（椭圆/双曲线）或顶点（抛物线）在 t 轴上的位置 */
  center: number;
  /** 半长轴 / 半实轴；抛物线为 0 */
  a: number;
  /** 半短轴 / 半虚轴；抛物线为 0 */
  b: number;
  /** 焦距一半；抛物线为焦点到顶点的距离 p/2 */
  c: number;
  /** 抛物线 s² = 2p(t − 顶点) 中的 p；其他曲线为 0 */
  p: number;
  /** 焦点在 t 轴上的位置（s = 0） */
  foci: number[];
  /** 与各焦点对应的准线 t = 常数 */
  directrices: number[];
}

const EPS = 1e-9;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** 课堂里“临界”只是提示：|β − α| 小于这个角度时说“接近抛物线”，但类型仍按真实几何判定 */
export const NEAR_CRITICAL_DEGREES = 1.5;

export function validateConicInput(input: ConicInput): ConicInput {
  const { alpha, beta, h } = input;
  if (![alpha, beta, h].every(Number.isFinite)) throw new Error("圆锥参数必须是数字");
  if (alpha <= 0 || alpha >= 90) throw new Error("半顶角必须在 0° 与 90° 之间");
  if (beta < 0 || beta > 90) throw new Error("切面与轴的夹角必须在 0° 与 90° 之间");
  return input;
}

export function eccentricity(alpha: number, beta: number): number {
  return Math.cos(rad(beta)) / Math.cos(rad(alpha));
}

export function classify(alpha: number, beta: number): ConicKind {
  if (Math.abs(beta - 90) < EPS) return "circle";
  if (Math.abs(beta - alpha) < EPS) return "parabola";
  return beta > alpha ? "ellipse" : "hyperbola";
}

export function isNearCritical(alpha: number, beta: number): boolean {
  return Math.abs(beta - alpha) < NEAR_CRITICAL_DEGREES;
}

export function solveConic(raw: ConicInput): ConicSection {
  const input = validateConicInput(raw);
  const alpha = rad(input.alpha);
  const beta = rad(input.beta);
  const { h } = input;
  const k = Math.tan(alpha) ** 2;
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);
  const A = sinB * sinB - k * cosB * cosB;
  const kind = classify(input.alpha, input.beta);
  const e = kind === "circle" ? 0 : kind === "parabola" ? 1 : eccentricity(input.alpha, input.beta);
  const base = { input, kind, e };

  if (Math.abs(h) < EPS) {
    const degenerate: DegenerateKind = kind === "parabola" ? "line" : kind === "hyperbola" ? "line-pair" : "point";
    return { ...base, degenerate, center: 0, a: 0, b: 0, c: 0, p: 0, foci: [], directrices: [] };
  }

  if (kind === "parabola") {
    // s² = 2hk·cosβ·t + h²k  →  s² = 2p(t − tv)
    const p = h * k * cosB;
    const vertex = -h / (2 * cosB);
    const c = p / 2;
    return { ...base, center: vertex, a: 0, b: 0, c, p, foci: [vertex + c], directrices: [vertex - c] };
  }

  const center = (h * k * cosB) / A;
  const R = (h * h * k * sinB * sinB) / A;
  if (kind === "circle" || kind === "ellipse") {
    // s²/R + (t − t0)²/(R/A) = 1，长轴沿 t
    const a = Math.sqrt(R / A);
    const b = Math.sqrt(R);
    const c = Math.sqrt(Math.max(0, a * a - b * b));
    const d = e > EPS ? a / e : Infinity;
    return {
      ...base, center, a, b, c, p: 0,
      foci: c > EPS ? [center - c, center + c] : [center],
      directrices: Number.isFinite(d) ? [center - d, center + d] : [],
    };
  }
  // 双曲线：|A|(t − t0)² − s² = |R|，实轴沿 t
  const a = Math.sqrt(Math.abs(R) / Math.abs(A));
  const b = Math.sqrt(Math.abs(R));
  const c = Math.sqrt(a * a + b * b);
  const d = a / e;
  return { ...base, center, a, b, c, p: 0, foci: [center - c, center + c], directrices: [center - d, center + d] };
}

/** 平面坐标 (s, t) → 三维坐标 */
export function planeToWorld(input: ConicInput, s: number, t: number): [number, number, number] {
  const beta = rad(input.beta);
  return [s, input.h + t * Math.cos(beta), t * Math.sin(beta)];
}

/** 曲线点必须同时在圆锥上：用于单元测试与画面自检 */
export function coneResidual(alpha: number, point: [number, number, number]): number {
  const [x, y, z] = point;
  return Math.hypot(x, z) - Math.abs(y) * Math.tan(rad(alpha));
}

/**
 * 截线采样（平面坐标），按圆锥高度 |y| ≤ height 截断。
 * 返回若干段折线：椭圆 1 段（闭合），抛物线 1 段，双曲线 2 支。
 */
export function sampleConic(section: ConicSection, height: number, samples = 160): Array<Array<[number, number]>> {
  const { input } = section;
  const cosB = Math.cos(rad(input.beta));
  const inside = (t: number) => Math.abs(input.h + t * cosB) <= height + EPS;
  const keep = (points: Array<[number, number]>) => {
    const runs: Array<Array<[number, number]>> = [];
    let run: Array<[number, number]> = [];
    for (const point of points) {
      if (inside(point[1])) run.push(point);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    return runs.filter((segment) => segment.length > 1);
  };

  if (section.degenerate === "point") return [];
  if (section.degenerate) {
    // 过顶点：一条母线（抛物线退化）或两条母线（双曲线退化），在平面内是过原点的直线 s = ±m·t
    const k = Math.tan(rad(input.alpha)) ** 2;
    const A = Math.sin(rad(input.beta)) ** 2 - k * cosB * cosB;
    const slope = Math.sqrt(Math.max(0, -A));
    const span = height / Math.max(cosB, 0.05);
    const line = (sign: number) => keep(Array.from({ length: samples }, (_, i) => {
      const t = -span + (2 * span * i) / (samples - 1);
      return [sign * slope * t, t] as [number, number];
    }));
    return section.degenerate === "line" ? line(0) : [...line(1), ...line(-1)];
  }

  if (section.kind === "circle" || section.kind === "ellipse") {
    const points = Array.from({ length: samples + 1 }, (_, i) => {
      const theta = (i / samples) * Math.PI * 2;
      return [section.b * Math.sin(theta), section.center + section.a * Math.cos(theta)] as [number, number];
    });
    return keep(points);
  }

  if (section.kind === "parabola") {
    // 沿 s 采样；t = tv + s²/(2p)
    const vertex = section.center;
    const tMax = (height - input.h) / cosB;
    const sMax = Math.sqrt(Math.max(0, 2 * section.p * (tMax - vertex)));
    return keep(Array.from({ length: samples }, (_, i) => {
      const s = -sMax + (2 * sMax * i) / (samples - 1);
      return [s, vertex + (s * s) / (2 * section.p)] as [number, number];
    }));
  }

  // 双曲线两支：t = t0 ± a·cosh u，s = b·sinh u
  const uMax = Math.acosh(Math.max(1.0001, (height * 4) / Math.max(section.a, 1e-3)));
  const branch = (sign: number) => keep(Array.from({ length: samples }, (_, i) => {
    const u = -uMax + (2 * uMax * i) / (samples - 1);
    return [section.b * Math.sinh(u), section.center + sign * section.a * Math.cosh(u)] as [number, number];
  }));
  return [...branch(1), ...branch(-1)];
}

export interface DandelinSphere {
  /** 球心在轴上的 y 坐标 */
  y: number;
  radius: number;
  /** 与切面的切点在平面坐标中的 t（s = 0），即焦点 */
  focusT: number;
  /** 球与圆锥相切的圆所在的高度 */
  contactY: number;
  /** 切圆平面与切面的交线：平面坐标中的 t，即准线 */
  directrixT: number;
}

/**
 * Dandelin 双球：既与圆锥相切、又与切面相切的球。
 * 球心 (0, y, 0)，半径 r = |y|·sinα；到切面的距离 sinβ·|y − h| = r。
 * 抛物线只有一个球（另一个在无穷远）。
 */
export function dandelinSpheres(raw: ConicInput): DandelinSphere[] {
  const input = validateConicInput(raw);
  const sinA = Math.sin(rad(input.alpha));
  const sinB = Math.sin(rad(input.beta));
  const cosA = Math.cos(rad(input.alpha));
  const cosB = Math.cos(rad(input.beta));
  if (Math.abs(input.h) < EPS) return [];
  const spheres: DandelinSphere[] = [];
  for (const denominator of [sinB + sinA, sinB - sinA]) {
    if (Math.abs(denominator) < EPS) continue;
    const y = (input.h * sinB) / denominator;
    const radius = Math.abs(y) * sinA;
    // 切点：球心沿切面法向 n = (0, −sinβ, cosβ) 投影到平面；平面坐标 t = (X − C)·v
    const focusT = (y - input.h) * cosB;
    const contactY = y * cosA * cosA;
    const directrixT = cosB > EPS ? (contactY - input.h) / cosB : Infinity;
    spheres.push({ y, radius, focusT, contactY, directrixT });
  }
  return spheres.sort((first, second) => first.focusT - second.focusT);
}

export interface PointMeasure {
  s: number;
  t: number;
  /** 到每个焦点的距离 */
  toFoci: number[];
  /** 到对应准线的距离（与第一个焦点配对） */
  toDirectrix: number;
  /** 椭圆：距离和；双曲线：距离差的绝对值；抛物线：|PF| − d */
  invariant: number;
  /** |PF| / d，应等于离心率 */
  ratio: number;
}

/** 曲线上参数 u ∈ [0, 1) 的点及其“定义量”的实测值，用作课堂证据 */
export function measurePoint(section: ConicSection, u: number): PointMeasure | undefined {
  if (section.degenerate || section.kind === "circle" && section.a < EPS) return undefined;
  let s: number;
  let t: number;
  if (section.kind === "circle" || section.kind === "ellipse") {
    const theta = u * Math.PI * 2;
    s = section.b * Math.sin(theta);
    t = section.center + section.a * Math.cos(theta);
  } else if (section.kind === "parabola") {
    s = (u - 0.5) * 4 * Math.sqrt(section.p * 2);
    t = section.center + (s * s) / (2 * section.p);
  } else {
    const v = (u - 0.5) * 2.4;
    s = section.b * Math.sinh(v);
    t = section.center + section.a * Math.cosh(v);
  }
  const toFoci = section.foci.map((focus) => Math.hypot(s, t - focus));
  const nearest = section.kind === "hyperbola" ? 1 : 0;
  const focusIndex = Math.min(nearest, toFoci.length - 1);
  const directrix = section.directrices[section.kind === "hyperbola" ? 1 : 0];
  const toDirectrix = directrix === undefined ? Infinity : Math.abs(t - directrix);
  const invariant = section.kind === "ellipse" || section.kind === "circle"
    ? toFoci.reduce((sum, value) => sum + value, 0)
    : section.kind === "hyperbola"
      ? Math.abs(toFoci[0] - toFoci[1])
      : toFoci[0] - toDirectrix;
  return { s, t, toFoci, toDirectrix, invariant, ratio: toFoci[focusIndex] / toDirectrix };
}

export const conicLabels: Record<ConicKind, { title: string; equation: string; definition: string; insight: string }> = {
  circle: {
    title: "圆", equation: "x² + y² = r²",
    definition: "到圆心距离等于定长的点",
    insight: "切面垂直于轴，处处与母线等角，截线是圆，e = 0。",
  },
  ellipse: {
    title: "椭圆", equation: "x²/a² + y²/b² = 1（a > b > 0）",
    definition: "到两个焦点距离之和为定值 2a 的点",
    insight: "切面比母线“平”（β > α），只穿过一个锥面，截线闭合，0 < e < 1。",
  },
  parabola: {
    title: "抛物线", equation: "y² = 2px（p > 0）",
    definition: "到焦点与到准线距离相等的点",
    insight: "切面恰好与一条母线平行（β = α），闭合曲线在无穷远处打开，e = 1。",
  },
  hyperbola: {
    title: "双曲线", equation: "x²/a² − y²/b² = 1",
    definition: "到两个焦点距离之差的绝对值为定值 2a 的点",
    insight: "切面比母线“陡”（β < α），同时穿过上下两个锥面，得到两支，e > 1。",
  },
};

export const degenerateLabels: Record<DegenerateKind, string> = {
  point: "切面过顶点且只碰到顶点：退化为一个点",
  line: "切面过顶点并沿母线贴住圆锥：退化为一条直线",
  "line-pair": "切面过顶点并穿过两个锥面：退化为两条相交直线",
};
