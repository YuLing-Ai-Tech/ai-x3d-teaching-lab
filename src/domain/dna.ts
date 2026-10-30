// DNA 是一门语言：4 个字母、3 个一组成“词”（密码子）、64 个词对应 20 个氨基酸和“句号”。
// 示例：人类 β-珠蛋白基因（HBB）开头 9 个密码子；第 7 个密码子 GAG→GTG 就是镰刀型细胞贫血症的突变。

export const NORMAL_HBB = "ATG GTG CAC CTG ACT CCT GAG GAG AAG";

const CODE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const BASE_INDEX: Record<string, number> = { T: 0, C: 1, A: 2, G: 3 };

export const AMINO: Record<string, { three: string; zh: string; kind: "hydrophobic" | "acidic" | "basic" | "polar" | "stop" }> = {
  M: { three: "Met", zh: "甲硫氨酸", kind: "hydrophobic" }, V: { three: "Val", zh: "缬氨酸", kind: "hydrophobic" },
  L: { three: "Leu", zh: "亮氨酸", kind: "hydrophobic" }, I: { three: "Ile", zh: "异亮氨酸", kind: "hydrophobic" },
  F: { three: "Phe", zh: "苯丙氨酸", kind: "hydrophobic" }, W: { three: "Trp", zh: "色氨酸", kind: "hydrophobic" },
  A: { three: "Ala", zh: "丙氨酸", kind: "hydrophobic" }, P: { three: "Pro", zh: "脯氨酸", kind: "hydrophobic" },
  G: { three: "Gly", zh: "甘氨酸", kind: "hydrophobic" }, E: { three: "Glu", zh: "谷氨酸", kind: "acidic" },
  D: { three: "Asp", zh: "天冬氨酸", kind: "acidic" }, K: { three: "Lys", zh: "赖氨酸", kind: "basic" },
  R: { three: "Arg", zh: "精氨酸", kind: "basic" }, H: { three: "His", zh: "组氨酸", kind: "basic" },
  S: { three: "Ser", zh: "丝氨酸", kind: "polar" }, T: { three: "Thr", zh: "苏氨酸", kind: "polar" },
  N: { three: "Asn", zh: "天冬酰胺", kind: "polar" }, Q: { three: "Gln", zh: "谷氨酰胺", kind: "polar" },
  Y: { three: "Tyr", zh: "酪氨酸", kind: "polar" }, C: { three: "Cys", zh: "半胱氨酸", kind: "polar" },
  "*": { three: "Stop", zh: "终止（句号）", kind: "stop" },
};

export interface Codon { bases: string; amino: string; mutated: boolean }
export type GeneOutcome = "normal" | "silent" | "missense" | "nonsense" | "frameshift" | "other";
export interface Gene { codons: Codon[]; protein: string; outcome: GeneOutcome; changes: Array<{ index: number; from: string; to: string }>; length: number; referenceLength: number }

export const translate = (codon: string) => CODE[BASE_INDEX[codon[0]] * 16 + BASE_INDEX[codon[1]] * 4 + BASE_INDEX[codon[2]]] ?? "?";

export function readGene(text: string): Gene | null {
  const bases = text.toUpperCase().replace(/U/g, "T").replace(/[^ACGT]/g, "");
  if (bases.length < 3) return null;
  const reference = NORMAL_HBB.replace(/ /g, "");
  // 插入 / 删除的碱基数不是 3 的倍数：从改动处起读码框整体错位（移码）
  const codons: Codon[] = [];
  const changes: Gene["changes"] = [];
  for (let index = 0; index + 3 <= bases.length; index += 3) {
    const codon = bases.slice(index, index + 3);
    const ref = reference.slice(index, index + 3);
    const amino = translate(codon);
    const mutated = ref.length === 3 && ref !== codon;
    if (mutated) changes.push({ index: index / 3, from: ref, to: codon });
    codons.push({ bases: codon, amino, mutated });
  }
  const stopAt = codons.findIndex((codon) => codon.amino === "*");
  const protein = codons.slice(0, stopAt < 0 ? codons.length : stopAt).map((codon) => codon.amino).join("");
  const refProtein = [...Array(reference.length / 3)].map((_, i) => translate(reference.slice(i * 3, i * 3 + 3))).join("");
  let outcome: Gene["outcome"] = "other";
  const shifted = bases.length !== reference.length && (bases.length - reference.length) % 3 !== 0;
  if (shifted) outcome = "frameshift";
  else if (!changes.length) outcome = "normal";
  else if (stopAt >= 0) outcome = "nonsense";  // 参考片段里没有终止密码子：出现任何终止都是提前终止
  else if (protein === refProtein.slice(0, protein.length) && protein.length === refProtein.length) outcome = "silent";
  else if (changes.length === 1) outcome = "missense";
  return { codons, protein, outcome, changes, length: bases.length, referenceLength: reference.length };
}

export function tokenizeGene(text: string): Array<{ text: string; role?: "start" | "codon" | "stop" | "mutation" }> {
  const gene = readGene(text);
  if (!gene) return [{ text }];
  const tokens: Array<{ text: string; role?: "start" | "codon" | "stop" | "mutation" }> = [];
  gene.codons.forEach((codon, index) => {
    if (index) tokens.push({ text: " " });
    const role = codon.mutated ? "mutation" : codon.amino === "*" ? "stop" : index === 0 && codon.bases === "ATG" ? "start" : "codon";
    tokens.push({ text: codon.bases, role });
  });
  return tokens;
}

/** 镰刀型细胞贫血症（HbS）：β-珠蛋白第 7 个密码子（含起始 Met；成熟蛋白第 6 位）谷氨酸 → 缬氨酸。只有这一处才这样说。 */
export function isSickle(gene: Gene): boolean {
  return gene.outcome === "missense" && gene.changes.length === 1 && gene.changes[0].index === 6
    && translate(gene.changes[0].from) === "E" && translate(gene.changes[0].to) === "V";
}

const KIND_ZH = { hydrophobic: "疏水", acidic: "酸性（带负电）", basic: "碱性（带正电）", polar: "极性不带电", stop: "终止" } as const;

/** 一个改动的证据：第几个密码子、碱基、氨基酸，以及性质是否改变 */
export function describeChange(change: Gene["changes"][number]): { codon: number; bases: string; amino: string; property: string; propertyChanged: boolean } {
  const from = AMINO[translate(change.from)];
  const to = AMINO[translate(change.to)];
  return {
    codon: change.index + 1,
    bases: `${change.from}→${change.to}`,
    amino: `${from?.zh ?? "?"}→${to?.zh ?? "?"}`,
    property: `${KIND_ZH[from?.kind ?? "polar"]}→${KIND_ZH[to?.kind ?? "polar"]}`,
    propertyChanged: from?.kind !== to?.kind,
  };
}

/** 从第几个密码子开始与正常序列翻译结果不同（1 起；没有不同返回 0） */
export function firstDivergence(gene: Gene): number {
  const reference = NORMAL_HBB.replace(/ /g, "");
  for (let i = 0; i < gene.codons.length; i += 1) {
    const ref = reference.slice(i * 3, i * 3 + 3);
    if (ref.length < 3 || translate(ref) !== gene.codons[i].amino) return i + 1;
  }
  return 0;
}

export const OUTCOME_LABEL: Record<GeneOutcome, string> = { normal: "正常", silent: "同义", missense: "错义", nonsense: "无义", frameshift: "移码", other: "多处或整码改动" };
