// 下一个词：从离线保存的“前 8 个候选及其概率”算出学生要记录的证据。
// 纯函数、无 DOM，单元测试见 tests/next-token.test.ts。
//
// 数据边界（页面必须讲清楚）：
// - 文件里只存了每一步概率最高的 8 个候选，概率四舍五入到 4 位小数（小于 0.00005 的记为 0）；
// - “熵”与“温度”都只在这 8 个候选里重新归一后计算，是近似值：前 8 名之外的概率被忽略了。

export interface Candidate { token: string; p: number }

export interface StepStats {
  top: Candidate;
  second: Candidate | undefined;
  /** 第一名概率（原始，T = 1） */
  p1: number;
  /** 第一名减第二名 */
  margin: number;
  /** 前 8 名概率之和：数据覆盖了多少概率 */
  covered: number;
  /** 前 8 名重新归一后的熵（比特），最大 log2(8) = 3 */
  entropy: number;
  /** 前 8 名重新归一后的第一名概率 */
  q1: number;
}

export type Certainty = "sure" | "lean" | "unsure";

/** 判定阈值：只看数据，不按句子写死结论 */
export const SURE_P1 = 0.9;
export const LEAN_P1 = 0.5;

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  sure: "几乎确定",
  lean: "有明显倾向",
  unsure: "犹豫不决",
};

/** 把概率重新归一（总和为 1）；全为 0 时返回均匀分布 */
export function renormalise(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > 0)) return values.map(() => 1 / values.length);
  return values.map((value) => Math.max(0, value) / total);
}

/** 熵（比特）：H = −Σ q·log2 q，先重新归一；0·log 0 记为 0 */
export function entropyBits(values: number[]): number {
  return renormalise(values).reduce((sum, q) => (q > 0 ? sum - q * Math.log2(q) : sum), 0);
}

/**
 * 温度：q_i ∝ p_i^(1/T)，只在给出的候选里重新归一。
 * 因为 p_i ∝ exp(z_i)，这等于 softmax(z/T) 限制在这 8 个候选上——候选之间的比例是准确的，
 * 近似之处在于忽略了前 8 名以外的词（T 越大，它们本该分走越多概率）。
 * 存成 0 的候选（四舍五入后）在任何温度下都仍是 0。
 */
export function applyTemperature(candidates: Candidate[], temperature: number): Candidate[] {
  if (!(temperature > 0)) throw new RangeError("温度必须大于 0");
  const raw = candidates.map((candidate) => (candidate.p > 0 ? Math.exp(Math.log(candidate.p) / temperature) : 0));
  // 先除以最大值再归一，避免 T 很小时下溢
  const max = Math.max(...raw);
  const scaled = renormalise(raw.map((value) => (max > 0 ? value / max : value)));
  return candidates.map((candidate, index) => ({ token: candidate.token, p: scaled[index] }));
}

export function stepStats(candidates: Candidate[]): StepStats {
  if (!candidates.length) throw new RangeError("没有候选词");
  const sorted = [...candidates].sort((a, b) => b.p - a.p);
  const covered = sorted.reduce((sum, candidate) => sum + candidate.p, 0);
  const normalised = renormalise(sorted.map((candidate) => candidate.p));
  return {
    top: sorted[0],
    second: sorted[1],
    p1: sorted[0].p,
    margin: sorted[0].p - (sorted[1]?.p ?? 0),
    covered,
    entropy: entropyBits(sorted.map((candidate) => candidate.p)),
    q1: normalised[0],
  };
}

/** 确定程度：只由第一名的原始概率决定（阈值见 SURE_P1、LEAN_P1） */
export function certainty(stats: Pick<StepStats, "p1">): Certainty {
  if (stats.p1 > SURE_P1) return "sure";
  if (stats.p1 >= LEAN_P1) return "lean";
  return "unsure";
}

/** 按第一步的 p1 从高到低排：最确定的在前，最犹豫的在后 */
export function rankByCertainty<T extends { steps: Candidate[][] }>(prompts: T[]): T[] {
  return [...prompts].sort((a, b) => stepStats(b.steps[0]).p1 - stepStats(a.steps[0]).p1);
}

export const percent = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 1 : 2)}%`;
export const bits = (h: number) => `${h.toFixed(2)} 比特`;
/** 换行、空格等看不见的词显示成符号 */
export const showToken = (token: string) => token.replace(/\n/g, "↵").replace(/^ /, "␣") || "␣";
