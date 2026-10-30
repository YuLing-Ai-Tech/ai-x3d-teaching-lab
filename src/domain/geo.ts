// 地理的语言：经纬度、海拔、剖面——用一句话指挥一张全国三维地形图。

export type GeoQuery =
  | { kind: "profile"; axis: "lat" | "lon"; value: number; from: number; to: number }
  | { kind: "flood"; metres: number }
  | { kind: "above"; metres: number }
  | { kind: "pin"; lon: number; lat: number };

export type GeoRole = "frame" | "number" | "action";

const NUM = "(\\d+(?:\\.\\d+)?)";

export function parseGeo(text: string): { query: GeoQuery | null; tokens: Array<{ text: string; role?: GeoRole }> } {
  const marks: Array<{ start: number; end: number; role: GeoRole }> = [];
  const mark = (pattern: RegExp, role: GeoRole) => {
    for (const match of text.matchAll(new RegExp(pattern.source, "g"))) marks.push({ start: match.index!, end: match.index! + match[0].length, role });
  };
  mark(/北纬|南纬|东经|西经|海拔|海平面/, "frame");
  mark(new RegExp(`${NUM}\\s*(?:°|度|米)?`), "number");
  mark(/剖面|切开|上升|以上|以下|定位/, "action");
  marks.sort((a, b) => a.start - b.start);
  const tokens: Array<{ text: string; role?: GeoRole }> = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) tokens.push({ text: text.slice(cursor, m.start) });
    tokens.push({ text: text.slice(m.start, m.end), role: m.role });
    cursor = m.end;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });

  const lat = new RegExp(`北纬\\s*${NUM}`).exec(text);
  const lons = [...text.matchAll(new RegExp(`东经\\s*${NUM}`, "g"))].map((m) => Number(m[1]));
  const lats = [...text.matchAll(new RegExp(`北纬\\s*${NUM}`, "g"))].map((m) => Number(m[1]));
  const metres = new RegExp(`${NUM}\\s*米`).exec(text);
  let query: GeoQuery | null = null;
  if (/剖面|切开/.test(text)) {
    if (/东西|纬/.test(text) && lat) query = { kind: "profile", axis: "lat", value: Number(lat[1]), from: lons[0] ?? 76, to: lons[1] ?? 122 };
    else if (lons.length) query = { kind: "profile", axis: "lon", value: lons[0], from: lats[0] ?? 21, to: lats[1] ?? 50 };
  } else if (/海平面上升/.test(text) && metres) query = { kind: "flood", metres: Number(metres[1]) };
  else if (/以下/.test(text) && metres) query = { kind: "flood", metres: Number(metres[1]) };
  else if (/以上/.test(text) && metres) query = { kind: "above", metres: Number(metres[1]) };
  else if (lons.length && lats.length) query = { kind: "pin", lon: lons[0], lat: lats[0] };
  return { query, tokens };
}

/** 地形区名称：做为参照地名标在地图上 */
export const LANDFORMS: Array<[string, number, number]> = [
  ["青藏高原", 88, 33], ["塔里木盆地", 83, 39.3], ["内蒙古高原", 111, 42.5], ["黄土高原", 108, 36.6], ["四川盆地", 105.5, 30],
  ["云贵高原", 104, 25.6], ["华北平原", 116, 36.5], ["东北平原", 125, 45.5], ["长江中下游平原", 116, 30.4], ["准噶尔盆地", 86.5, 45],
];

// —— 用数据说话：剖面与阈值的结论从 DEM 采样算出，不写死 ——
// 阶梯的“级”在这里用海拔阈值做操作性定义：≥ 3000 米为第一级，500–3000 米为第二级，< 500 米为第三级。
// 这是教学约定：教材上的分界线是山脉（昆仑—祁连—横断山；大兴安岭—太行山—巫山—雪峰山），不是等高线——这本身就是可以讨论的模型边界。

export const TIER_LIMITS = { first: 3000, second: 500 };
export type Tier = 1 | 2 | 3;
export const tierOf = (metres: number): Tier => (metres >= TIER_LIMITS.first ? 1 : metres >= TIER_LIMITS.second ? 2 : 3);

export interface ProfileSample { at: number; metres: number; inside: boolean }
export interface TierRun { tier: Tier; from: number; to: number; mean: number }
export interface ProfileAnalysis {
  /** 境内陆地采样的最高、平均海拔 */
  max: { at: number; metres: number };
  mean: number;
  /** 合并后的分级区段（只计境内、短于 minRun 度的碎段并入相邻段） */
  runs: TierRun[];
  /** 从西到东（或北到南）依次出现第一、二、三级，且每级至少 minRun 度 */
  staircase: boolean;
  /** 级与级之间的分界位置（度） */
  boundaries: Array<{ from: Tier; to: Tier; at: number }>;
  /** 出现了哪些级 */
  tiers: Tier[];
}

export function analyzeProfile(samples: ProfileSample[], minRun = 1.5): ProfileAnalysis {
  const land = samples.filter((sample) => sample.inside);
  const max = land.reduce((best, sample) => (sample.metres > best.metres ? sample : best), land[0] ?? { at: 0, metres: 0 });
  const mean = land.length ? land.reduce((sum, sample) => sum + sample.metres, 0) / land.length : 0;
  const raw: TierRun[] = [];
  for (const sample of land) {
    const tier = tierOf(sample.metres);
    const last = raw[raw.length - 1];
    if (last && last.tier === tier) { last.to = sample.at; last.mean += sample.metres; (last as TierRun & { n: number }).n += 1; }
    else raw.push(Object.assign({ tier, from: sample.at, to: sample.at, mean: sample.metres }, { n: 1 }));
  }
  raw.forEach((run) => { run.mean /= (run as TierRun & { n: number }).n; });
  // 碎段并入前一段（例如盆地里的一座孤山），避免把噪声当成“台阶”
  const runs: TierRun[] = [];
  for (const run of raw) {
    const last = runs[runs.length - 1];
    if (last && (Math.abs(run.to - run.from) < minRun || last.tier === run.tier)) { last.to = run.to; continue; }
    runs.push({ ...run });
  }
  const merged: TierRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.tier === run.tier) last.to = run.to; else merged.push(run);
  }
  const tiers = [...new Set(merged.map((run) => run.tier))].sort() as Tier[];
  const order = merged.map((run) => run.tier);
  const staircase = order.length >= 3 && order[0] === 1 && order.includes(2) && order[order.length - 1] === 3
    && order.every((tier, index) => index === 0 || tier >= order[index - 1]);
  const boundaries = merged.slice(1).map((run, index) => ({ from: merged[index].tier, to: run.tier, at: run.from }));
  return { max, mean, runs: merged, staircase, boundaries, tiers };
}

type Ring = number[][];
interface OutlineFeature { geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] } }
export interface Outline { features: OutlineFeature[] }

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLon, currentLat] = ring[current];
    const [previousLon, previousLat] = ring[previous];
    if ((currentLat > lat) !== (previousLat > lat)
      && lon < (previousLon - currentLon) * (lat - currentLat) / (previousLat - currentLat) + currentLon) inside = !inside;
  }
  return inside;
}

/** 是否在国界轮廓内（DataV 轮廓，与地图一致） */
export function insideOutline(outline: Outline, lon: number, lat: number): boolean {
  return outline.features.some((feature) => {
    const polygons = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][];
    return polygons.some((rings) => pointInRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => pointInRing(lon, lat, hole)));
  });
}

/** 给定海拔阈值，各地形区代表点在其上还是其下（代表点海拔取自同一份 DEM） */
export function landformsVersus(threshold: number, elevationAt: (lon: number, lat: number) => number): Array<{ name: string; metres: number; above: boolean }> {
  return LANDFORMS.map(([name, lon, lat]) => {
    const metres = Math.round(elevationAt(lon, lat));
    return { name, metres, above: metres >= threshold };
  });
}

/** 国界内陆地网格（经纬度格点 + 纬度余弦面积权重）：只算一次，供面积占比使用 */
export function landGrid(outline: Outline, step = 0.5): Array<{ lon: number; lat: number; weight: number }> {
  const boxes = outline.features.flatMap((feature) =>
    ((feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][]).map((rings) => {
      const lons = rings[0].map((point) => point[0]), lats = rings[0].map((point) => point[1]);
      return { rings, west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
    }));
  const grid: Array<{ lon: number; lat: number; weight: number }> = [];
  for (let lat = 17 + step / 2; lat < 54; lat += step) {
    for (let lon = 73 + step / 2; lon < 135; lon += step) {
      const hit = boxes.some((box) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north
        && pointInRing(lon, lat, box.rings[0]) && !box.rings.slice(1).some((hole) => pointInRing(lon, lat, hole)));
      if (hit) grid.push({ lon, lat, weight: Math.cos(lat * Math.PI / 180) });
    }
  }
  return grid;
}

/** 海拔不低于 threshold 的陆地面积占比（0–1） */
export function shareAbove(grid: Array<{ lon: number; lat: number; weight: number }>, threshold: number, elevationAt: (lon: number, lat: number) => number): number {
  let total = 0, above = 0;
  for (const cell of grid) {
    total += cell.weight;
    if (elevationAt(cell.lon, cell.lat) >= threshold) above += cell.weight;
  }
  return total ? above / total : 0;
}
