// SMILES：化学家写给计算机的分子语言。CCO 是乙醇，COC 是二甲醚——同样的原子，不同的语序。

export interface Molecule {
  smiles: string;
  name: string;
  note: string;
  aliases: string[];
  formula: string;
  atoms: Array<[string, number, number, number]>;
  bonds: Array<[number, number, number]>;
}

export type SmilesRole = "atom" | "bond" | "branch" | "ring";

const TOKEN = /Cl|Br|\[[^\]]*\]|[BCNOPSFI]|[cnops]|[=#]|[()]|%\d\d|\d|./g;

export function tokenizeSmiles(text: string): Array<{ text: string; role?: SmilesRole }> {
  return [...text.matchAll(TOKEN)].map(([token]) => {
    if (/^(Cl|Br|\[.*\]|[BCNOPSFI]|[cnops])$/.test(token)) return { text: token, role: "atom" as const };
    if (/^[=#]$/.test(token)) return { text: token, role: "bond" as const };
    if (/^[()]$/.test(token)) return { text: token, role: "branch" as const };
    if (/^(%\d\d|\d)$/.test(token)) return { text: token, role: "ring" as const };
    return { text: token };
  });
}

export function findMolecule(library: Molecule[], text: string): Molecule | undefined {
  const key = text.trim();
  return library.find((molecule) => molecule.smiles === key || molecule.aliases.includes(key));
}

export const prettyFormula = (formula: string) => formula.replace(/(\d+)/g, "<sub>$1</sub>");

// —— 结构证据：全部从离线三维数据（RDKit ETKDG + MMFF）现场计算，不靠预设结论 ——

export interface MoleculeAnalysis {
  formula: string;
  heavyAtoms: number;
  hydrogens: number;
  bonds: number;
  /** 重原子之间的键：单 / 双 / 三 / 芳香 */
  bondOrders: { single: number; double: number; triple: number; aromatic: number };
  /** 氧的连接方式 */
  oxygen: string;
  /** 最长碳链（主链）的碳原子数 */
  mainChain: number;
  /** 连着 3 个及以上碳的碳原子数（支链点） */
  branchPoints: number;
  /** 碳碳键长（Å），按键级 */
  ccLengths: { single?: number; double?: number; triple?: number };
  /** 关键键角（度） */
  angle?: { label: string; value: number };
  /** 所有原子是否共面 / 共线 */
  shape: "线形" | "平面" | "立体";
  /** 连接方式指纹：相同 ⇔ 原子连接完全相同 */
  signature: string;
}

type Vec = [number, number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec) => Math.sqrt(dot(a, a));
const angleAt = (centre: Vec, a: Vec, b: Vec) => {
  const u = sub(a, centre);
  const v = sub(b, centre);
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v))))) * 180) / Math.PI;
};
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined);

export function analyzeMolecule(molecule: Molecule): MoleculeAnalysis {
  const atoms = molecule.atoms;
  const position = (index: number): Vec => [atoms[index][1], atoms[index][2], atoms[index][3]];
  const element = (index: number) => atoms[index][0];
  const neighbours = atoms.map(() => [] as Array<{ atom: number; order: number }>);
  for (const [a, b, order] of molecule.bonds) {
    neighbours[a].push({ atom: b, order });
    neighbours[b].push({ atom: a, order });
  }
  const heavy = atoms.map((_, index) => index).filter((index) => element(index) !== "H");
  const orders = { single: 0, double: 0, triple: 0, aromatic: 0 };
  const lengths: Record<"single" | "double" | "triple", number[]> = { single: [], double: [], triple: [] };
  for (const [a, b, order] of molecule.bonds) {
    if (element(a) === "H" || element(b) === "H") continue;
    const kind = order === 1.5 ? "aromatic" : order >= 3 ? "triple" : order >= 2 ? "double" : "single";
    orders[kind] += 1;
    if (element(a) === "C" && element(b) === "C" && kind !== "aromatic") lengths[kind].push(norm(sub(position(a), position(b))));
  }

  const oxygens = heavy.filter((index) => element(index) === "O");
  const oxygen = oxygens.length === 0 ? "无氧原子" : oxygens.map((index) => {
    const around = neighbours[index];
    const hasH = around.some((item) => element(item.atom) === "H");
    const carbons = around.filter((item) => element(item.atom) === "C");
    if (around.some((item) => item.order >= 2)) return "C=O（羰基）";
    if (hasH && carbons.length === 1) return "C–O–H（羟基）";
    if (carbons.length === 2) return "C–O–C（醚键）";
    return hasH ? "O–H" : "其他";
  }).join("、");

  const carbons = heavy.filter((index) => element(index) === "C");
  const carbonNeighbours = (index: number) => neighbours[index].filter((item) => element(item.atom) === "C").map((item) => item.atom);
  let mainChain = carbons.length ? 1 : 0;
  const walk = (current: number, seen: Set<number>): void => {
    mainChain = Math.max(mainChain, seen.size);
    for (const next of carbonNeighbours(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next, seen);
      seen.delete(next);
    }
  };
  if (carbons.length <= 24) carbons.forEach((start) => walk(start, new Set([start])));
  const branchPoints = carbons.filter((index) => carbonNeighbours(index).length >= 3).length;

  // 关键键角：三键 → H–C≡C；双键 → H–C=C；否则以碳为中心的 H–C–H 或 C–O–C / C–O–H
  let angle: MoleculeAnalysis["angle"];
  const multiple = molecule.bonds.find(([a, b, order]) => element(a) === "C" && element(b) === "C" && order >= 2 && order !== 1.5);
  if (multiple) {
    const [a, b, order] = multiple;
    const h = neighbours[a].find((item) => item.atom !== b);
    if (h) angle = { label: order >= 3 ? `${element(h.atom)}–C≡C` : `${element(h.atom)}–C=C`, value: angleAt(position(a), position(h.atom), position(b)) };
  } else if (oxygens.length) {
    const o = oxygens[0];
    const [first, second] = neighbours[o];
    if (first && second) angle = { label: `${element(first.atom)}–O–${element(second.atom)}`, value: angleAt(position(o), position(first.atom), position(second.atom)) };
  } else if (carbons.length) {
    const c = carbons.find((index) => neighbours[index].filter((item) => element(item.atom) === "H").length >= 2) ?? carbons[0];
    const hs = neighbours[c].filter((item) => element(item.atom) === "H");
    if (hs.length >= 2) angle = { label: "H–C–H", value: angleAt(position(c), position(hs[0].atom), position(hs[1].atom)) };
  }

  // 形状：所有原子到首两原子连线的最大距离（线形），到最佳三点平面的最大距离（平面）
  let shape: MoleculeAnalysis["shape"] = "立体";
  if (atoms.length >= 3) {
    const p0 = position(0);
    const axis = sub(position(1), p0);
    const lineDeviation = Math.max(...atoms.map((_, index) => norm(cross(sub(position(index), p0), axis)) / norm(axis)));
    if (lineDeviation < 0.05) shape = "线形";
    else {
      let best = Infinity;
      for (let k = 2; k < atoms.length; k += 1) {
        const normal = cross(axis, sub(position(k), p0));
        if (norm(normal) < 1e-6) continue;
        const deviation = Math.max(...atoms.map((_, index) => Math.abs(dot(sub(position(index), p0), normal)) / norm(normal)));
        best = Math.min(best, deviation);
      }
      if (best < 0.05) shape = "平面";
    }
  }

  // 连接指纹：元素 + 邻居（含键级）迭代 3 次（Weisfeiler–Lehman），排序后拼接
  let labels = atoms.map((atom) => atom[0]);
  for (let round = 0; round < 3; round += 1) {
    labels = labels.map((label, index) => `${label}(${neighbours[index].map((item) => `${item.order}${labels[item.atom]}`).sort().join(",")})`);
  }
  const signature = [...labels].sort().join("|");

  const ccLengths = { single: average(lengths.single), double: average(lengths.double), triple: average(lengths.triple) };
  return {
    formula: molecule.formula, heavyAtoms: heavy.length, hydrogens: atoms.length - heavy.length, bonds: molecule.bonds.length,
    bondOrders: orders, oxygen, mainChain, branchPoints, ccLengths, angle, shape, signature,
  };
}

export type MoleculeRelation = "same" | "isomer" | "different";

/** 两个分子的关系：同一物质（连接相同）/ 同分异构体（分子式相同、连接不同）/ 分子式不同 */
export function relation(a: Molecule, b: Molecule): MoleculeRelation {
  if (a.formula !== b.formula) return "different";
  return analyzeMolecule(a).signature === analyzeMolecule(b).signature ? "same" : "isomer";
}

export const RELATION_LABEL: Record<MoleculeRelation, string> = { same: "同一物质（连接方式相同）", isomer: "同分异构体（分子式相同、连接不同）", different: "分子式不同" };

export interface MoleculeProperty { name: string; cas: string; boilingK: number; uncertaintyK: number; state25C: string; url: string; note: string }
export interface PropertyTable { conditions: string; source: string; accessed: string; items: Record<string, MoleculeProperty> }
