// 词向量宇宙：AI 把每个词变成一个 1024 维的点；意思相近的词方向相近，中文和英文共享同一个意义空间。
// 数据由 scripts/build-embeddings.py 用本机 bge-m3 预先计算：三维坐标（t-SNE 投影，只用来画图）
// + 每个词的 1024 维向量（int8 量化，每向量一个缩放系数，base64）。
// 这里的相似度、近邻、类比全部在 1024 维里算，不是看三维图。纯函数，可单元测试。

export interface WordPoint { text: string; group: string; xyz: [number, number, number]; near: number[] }
export interface Analogy {
  a: number; b: number; c: number;
  result: number; runnerUp: number; score: number;
  /** 期望答案（人写下的，例如 国王 − 男人 + 女人 → 王后）；没有就是“只看 AI 给什么” */
  expected?: number;
  /** 期望答案在候选词中的名次（1 = 命中）；期望答案就是 A/B/C 之一时为 null */
  expectedRank?: number | null;
}
export interface EmbeddingVectors { dim: number; encoding?: string; scales: number[]; data: string[] }
export interface EmbeddingData {
  model: string;
  words: WordPoint[];
  pairs: Array<{ zh: number; en: number; similarity: number }>;
  analogies: Analogy[];
  /** 全部词对的平均余弦相似度（构建脚本算的，供核对） */
  meanSimilarity?: number;
  vectors?: EmbeddingVectors;
}

export type EmbeddingQuery = { kind: "word"; index: number } | { kind: "analogy"; analogy: Analogy };

// —— 量化：与 build-embeddings.py 一致（q = round(v / s)，s = max|v| / 127；还原后重新归一化） ——

export function quantise(vector: ArrayLike<number>): { q: Int8Array; scale: number } {
  let max = 0;
  for (let i = 0; i < vector.length; i++) max = Math.max(max, Math.abs(vector[i]));
  const scale = max / 127 || 1;
  const q = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(vector[i] / scale)));
  return { q, scale };
}

export function dequantise(q: Int8Array, scale: number): Float64Array {
  const v = new Float64Array(q.length);
  let norm = 0;
  for (let i = 0; i < q.length; i++) { v[i] = q[i] * scale; norm += v[i] * v[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < q.length; i++) v[i] /= norm;
  return v;
}

const fromBase64 = (text: string): Int8Array => {
  const binary = atob(text);
  const bytes = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = (binary.charCodeAt(i) << 24) >> 24;
  return bytes;
};

export const toBase64 = (q: Int8Array): string => {
  let binary = "";
  for (let i = 0; i < q.length; i++) binary += String.fromCharCode(q[i] & 0xff);
  return btoa(binary);
};

export function decodeVectors(vectors: EmbeddingVectors): Float64Array[] {
  return vectors.data.map((text, index) => dequantise(fromBase64(text), vectors.scales[index]));
}

export function cosine(u: ArrayLike<number>, v: ArrayLike<number>): number {
  let dot = 0, nu = 0, nv = 0;
  for (let i = 0; i < u.length; i++) { dot += u[i] * v[i]; nu += u[i] * u[i]; nv += v[i] * v[i]; }
  return dot / (Math.sqrt(nu * nv) || 1);
}

export interface PairReport {
  a: number; b: number;
  /** 1024 维余弦相似度 */
  similarity: number;
  /** b 在 a 的 1024 维近邻表里排第几（1 = 最近）；反过来同理 */
  rankAB: number; rankBA: number;
  /** 三维图（t-SNE）上的直线距离，和在 a 的三维近邻里排第几 */
  distance: number; rank3dAB: number; rank3dBA: number;
}

export interface AnalogyReport extends Analogy {
  /** 排除 A、B、C 后按相似度从高到低的候选词 */
  ranked: Array<{ index: number; score: number }>;
  expectedScore?: number;
}

export interface EmbeddingSpace {
  size: number;
  index: (word: string) => number;
  similarity: (a: number, b: number) => number;
  /** 1024 维近邻（不含自己），从近到远 */
  neighbours: (a: number, k?: number) => Array<{ index: number; score: number }>;
  distance3d: (a: number, b: number) => number;
  pair: (a: number, b: number) => PairReport;
  analogy: (a: number, b: number, c: number, expected?: number) => AnalogyReport;
  /** 全部 n(n−1)/2 个词对的平均相似度 */
  meanSimilarity: number;
  /** 中英文同义词对的平均相似度 */
  pairMean: number;
}

const findIndex = (data: EmbeddingData, word: string) => data.words.findIndex((point) => point.text.toLowerCase() === word.trim().toLowerCase());

/** 排名：比 score 严格更高的个数 + 1（与构建脚本的稳定排序一致：同分时序号小的在前） */
const rankIn = (scores: number[], self: number, target: number, higherIsCloser: boolean) => {
  let rank = 1;
  for (let k = 0; k < scores.length; k++) {
    if (k === self || k === target) continue;
    const better = higherIsCloser ? scores[k] > scores[target] : scores[k] < scores[target];
    const tie = scores[k] === scores[target] && k < target;
    if (better || tie) rank++;
  }
  return rank;
};

export function createSpace(data: EmbeddingData, vectors: Float64Array[] = data.vectors ? decodeVectors(data.vectors) : []): EmbeddingSpace {
  if (vectors.length !== data.words.length) throw new Error(`词向量数据缺失：${vectors.length} 个向量，${data.words.length} 个词`);
  const n = vectors.length;
  const dot = (u: Float64Array, v: Float64Array) => { let s = 0; for (let i = 0; i < u.length; i++) s += u[i] * v[i]; return s; };
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let total = 0;
  for (let i = 0; i < n; i++) {
    matrix[i][i] = dot(vectors[i], vectors[i]);
    for (let j = i + 1; j < n; j++) { const s = dot(vectors[i], vectors[j]); matrix[i][j] = matrix[j][i] = s; total += s; }
  }
  const xyz = data.words.map((word) => word.xyz);
  const distance3d = (a: number, b: number) => Math.hypot(xyz[a][0] - xyz[b][0], xyz[a][1] - xyz[b][1], xyz[a][2] - xyz[b][2]);
  const distanceRow = (a: number) => xyz.map((_, k) => distance3d(a, k));
  const neighbours = (a: number, k = n - 1) => matrix[a].map((score, index) => ({ index, score }))
    .filter((item) => item.index !== a).sort((x, y) => y.score - x.score || x.index - y.index).slice(0, k);
  const pairMean = data.pairs.reduce((sum, pair) => sum + matrix[pair.zh][pair.en], 0) / Math.max(1, data.pairs.length);
  return {
    size: n,
    index: (word) => findIndex(data, word),
    similarity: (a, b) => matrix[a][b],
    neighbours,
    distance3d,
    pair: (a, b) => ({
      a, b, similarity: matrix[a][b],
      rankAB: rankIn(matrix[a], a, b, true), rankBA: rankIn(matrix[b], b, a, true),
      distance: distance3d(a, b), rank3dAB: rankIn(distanceRow(a), a, b, false), rank3dBA: rankIn(distanceRow(b), b, a, false),
    }),
    analogy: (a, b, c, expected) => {
      const target = new Float64Array(vectors[a].length);
      for (let i = 0; i < target.length; i++) target[i] = vectors[a][i] - vectors[b][i] + vectors[c][i];
      const norm = Math.sqrt(dot(target, target)) || 1;
      const scores = vectors.map((v) => dot(v, target) / norm);
      const ranked = scores.map((score, index) => ({ index, score }))
        .filter((item) => item.index !== a && item.index !== b && item.index !== c)
        .sort((x, y) => y.score - x.score || x.index - y.index);
      const position = expected === undefined ? -1 : ranked.findIndex((item) => item.index === expected);
      return {
        a, b, c, ranked,
        result: ranked[0].index, runnerUp: ranked[1].index, score: Math.round(ranked[0].score * 1000) / 1000,
        ...(expected === undefined ? {} : { expected, expectedRank: position >= 0 ? position + 1 : null, expectedScore: scores[expected] }),
      };
    },
    meanSimilarity: total / (n * (n - 1) / 2),
    pairMean,
  };
}

/** 预设类比里记录的期望答案（A、B、C 完全一致才算） */
export const presetExpected = (data: EmbeddingData, a: number, b: number, c: number) =>
  data.analogies.find((item) => item.a === a && item.b === b && item.c === c)?.expected;

export function parseQuery(data: EmbeddingData, text: string, space?: EmbeddingSpace): { query: EmbeddingQuery | null; tokens: Array<{ text: string; role?: "word" | "op" | "unknown" }>; message?: string } {
  const analogy = /^\s*(\S+)\s*[-−–]\s*(\S+)\s*\+\s*(\S+)\s*$/.exec(text);
  if (analogy) {
    const [a, b, c] = [analogy[1], analogy[2], analogy[3]].map((word) => findIndex(data, word));
    const tokens = [
      { text: analogy[1], role: a >= 0 ? "word" as const : "unknown" as const }, { text: " − ", role: "op" as const },
      { text: analogy[2], role: b >= 0 ? "word" as const : "unknown" as const }, { text: " + ", role: "op" as const },
      { text: analogy[3], role: c >= 0 ? "word" as const : "unknown" as const },
    ];
    if (a < 0 || b < 0 || c < 0) return { query: null, tokens, message: "有的词不在这个宇宙里（标红的那个）。换成下方预设里出现过的词试试。" };
    if (new Set([a, b, c]).size < 3) return { query: null, tokens, message: "A、B、C 要是三个不同的词。" };
    if (space) return { query: { kind: "analogy", analogy: space.analogy(a, b, c, presetExpected(data, a, b, c)) }, tokens };
    const preset = data.analogies.find((item) => item.a === a && item.b === b && item.c === c);
    return preset ? { query: { kind: "analogy", analogy: preset }, tokens } : { query: null, tokens, message: "没有向量数据时只能查预设类比。" };
  }
  const index = findIndex(data, text);
  return index >= 0
    ? { query: { kind: "word", index }, tokens: [{ text: text.trim(), role: "word" }] }
    : { query: null, tokens: [{ text, role: "unknown" }], message: `宇宙里有 ${data.words.length} 个中英文词，例如：猫、cat、数学、爱、北京、Tokyo、诗、code。` };
}
