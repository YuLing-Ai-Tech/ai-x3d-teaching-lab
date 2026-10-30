import { moleculeLesson } from "../content/lessons/molecule";
import { RELATION_LABEL, analyzeMolecule, findMolecule, prettyFormula, relation, tokenizeSmiles, type Molecule, type MoleculeAnalysis, type PropertyTable } from "../domain/molecule";
import { mountMolecule } from "../scenes/molecule";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";

// 化学 · 分子也有语言：SMILES 的“语序”决定连接方式。
// 探究层：结构证据由 analyzeMolecule() 从离线三维数据计算；沸点等性质只来自带来源的实验数据（NIST，S14）。

const COMPARE = [["CCO", "COC"], ["CCCC", "CC(C)C"], ["CC", "C=C", "C#C"]];
const fmt = (value: number | undefined, digits = 3) => (value === undefined ? "—" : value.toFixed(digits));
const ccText = (a: MoleculeAnalysis) => [a.ccLengths.single && `C–C ${fmt(a.ccLengths.single)}`, a.ccLengths.double && `C=C ${fmt(a.ccLengths.double)}`, a.ccLengths.triple && `C≡C ${fmt(a.ccLengths.triple)}`].filter(Boolean).join("；") || "无碳碳键";

export async function renderMolecule(): Promise<() => void> {
  const [libraryResponse, propertyResponse] = await Promise.all([fetch("./data/molecules.json"), fetch("./data/molecule-properties.json")]);
  const library = (libraryResponse.ok ? await libraryResponse.json() : []) as Molecule[];
  const properties = (propertyResponse.ok ? await propertyResponse.json() : { conditions: "", source: "", accessed: "", items: {} }) as PropertyTable;
  const fallback = library[0];
  let pinned: Molecule | undefined;
  let unlocked = false;
  let apiRef: LangLabApi<Molecule> | undefined;

  const propertyLine = (molecule: Molecule) => {
    const item = properties.items[molecule.smiles];
    if (!item) return "离线数据表中没有这个分子的实验数据——不能只凭模型下结论。";
    return `标准沸点 ${item.boilingK} ± ${item.uncertaintyK} K（${(item.boilingK - 273.15).toFixed(1)} °C）· 25 °C 时为${item.state25C}`;
  };

  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#mol-compare");
    if (!box || !apiRef) return;
    const current = apiRef.current().params;
    const a = analyzeMolecule(current);
    const b = pinned ? analyzeMolecule(pinned) : undefined;
    const row = (label: string, left: string, right?: string) => `<tr><th>${label}</th><td>${left}</td>${b ? `<td>${right ?? ""}</td>` : ""}</tr>`;
    box.innerHTML = `
      <table class="mol-table">
        <thead><tr><th></th><th>当前 <code>${current.smiles}</code></th>${b ? `<th>对照 <code>${pinned!.smiles}</code></th>` : ""}</tr></thead>
        <tbody>
          ${row("分子式", prettyFormula(a.formula), b && prettyFormula(b.formula))}
          ${row("原子 / 键", `${a.heavyAtoms} 重原子 + ${a.hydrogens} H / ${a.bonds} 键`, b && `${b.heavyAtoms} 重原子 + ${b.hydrogens} H / ${b.bonds} 键`)}
          ${row("氧的连接", a.oxygen, b?.oxygen)}
          ${row("主链 / 支链点", `${a.mainChain} / ${a.branchPoints}`, b && `${b.mainChain} / ${b.branchPoints}`)}
          ${row("碳碳键长 Å", ccText(a), b && ccText(b))}
          ${row("关键键角", a.angle ? `${a.angle.label} ${a.angle.value.toFixed(1)}°` : "—", b && (b.angle ? `${b.angle.label} ${b.angle.value.toFixed(1)}°` : "—"))}
          ${row("形状", a.shape, b?.shape)}
        </tbody>
      </table>
      ${b && unlocked ? `<p class="mol-relation" data-relation="${relation(current, pinned!)}">关系：${RELATION_LABEL[relation(current, pinned!)]}</p>` : b ? `<p class="mol-relation">锁定预测后显示两者的关系判定。</p>` : `<p class="mol-relation">点“设为对照”，再换一个分子来比较。</p>`}
      <div class="mol-data" ${unlocked ? "" : "hidden"}><small>实验数据（不是从模型推出的）· NIST WebBook · 101.325 kPa 纯物质</small><p id="mol-property">${propertyLine(current)}</p>${properties.items[current.smiles] ? `<a href="${properties.items[current.smiles].url}" target="_blank" rel="noreferrer">查看来源</a>` : ""}</div>`;
    document.querySelector<HTMLButtonElement>("#mol-pin")!.textContent = pinned ? `对照：${pinned.name}（点此换成当前）` : "设为对照";
  };

  const controls = (api: LangLabApi<Molecule>) => {
    apiRef = api;
    return {
      html: `
        <div class="mol-controls">
          ${COMPARE.map((group) => `<div class="lx-segment" role="group" aria-label="比较">${group.map((smiles) => `<button data-smiles="${smiles}">${smiles}</button>`).join("")}</div>`).join("")}
          <button id="mol-pin" class="mol-pin">设为对照</button>
          <div id="mol-compare" aria-live="polite"></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.smiles) api.setText(button.dataset.smiles);
          if (button.id === "mol-pin") { pinned = api.current().params; refresh(); }
        };
        root.addEventListener("click", onClick);
        return () => root.removeEventListener("click", onClick);
      },
      refresh,
    };
  };

  return renderLangLab<Molecule>({
    id: "molecule",
    subject: "化学",
    title: "分子也有语言",
    subtitle: "SMILES 是化学家写给计算机的语言：C 是碳，O 是氧，= 是双键，括号是支链，数字是成环。同样的字母，换一个顺序就是另一种连接方式。",
    accent: "#3fffb0",
    language: "SMILES · 分子的语言",
    roles: {
      atom: { label: "原子", color: "#9fe8ff" },
      bond: { label: "双键 / 三键", color: "#ffd38a" },
      branch: { label: "支链", color: "#c58bff" },
      ring: { label: "成环", color: "#3fffb0" },
    },
    variants: [
      { label: "乙醇 CCO", text: "CCO" },
      { label: "二甲醚 COC", text: "COC" },
      { label: "乙烯 C=C", text: "C=C" },
      { label: "乙炔 C#C", text: "C#C" },
      { label: "正丁烷", text: "CCCC" },
      { label: "异丁烷", text: "CC(C)C" },
      { label: "苯", text: "c1ccccc1" },
      { label: "阿司匹林", text: "CC(=O)Oc1ccccc1C(=O)O" },
      { label: "咖啡因", text: "Cn1cnc2c1c(=O)n(C)c(=O)n2C" },
    ],
    parse: (text) => {
      const tokens = tokenizeSmiles(text.trim());
      const molecule = findMolecule(library, text);
      return molecule
        ? { ok: true, params: molecule, tokens }
        : { ok: false, params: fallback, tokens, message: `语法可以读，但这个分子不在离线分子库里。课前已用 RDKit 生成 ${library.length} 个分子的三维结构：乙醇、二甲醚、苯、乙酸、葡萄糖、阿司匹林、咖啡因……` };
    },
    mount: mountMolecule,
    explain: ({ params }, reveal) => {
      const analysis = analyzeMolecule(params);
      const facts = `<p>${analysis.heavyAtoms} 个重原子 + ${analysis.hydrogens} 个氢 · ${analysis.bonds} 根化学键 · 氧：${analysis.oxygen} · 形状：${analysis.shape}</p>`;
      if (!reveal) return { title: `${params.name} · ${prettyFormula(params.formula)}`, body: `${facts}<p>它和别的分子是什么关系？先预测，再用对照表找证据。</p>` };
      const isomers = library.filter((other) => other !== params && relation(other, params) === "isomer");
      return {
        title: `${params.name} · ${prettyFormula(params.formula)}`,
        body: `${params.note ? `<p>${params.note}</p>` : ""}${facts}${isomers.length
          ? `<p class="lang-warn">与 ${isomers.map((other) => `${other.name}（<code>${other.smiles}</code>）`).join("、")} 分子式相同、连接方式不同——互为同分异构体。</p>`
          : `<p class="lang-ok">全部由一行 <code>${params.smiles}</code> 决定。</p>`}`,
      };
    },
    question: "CCO 与 COC 原子完全相同，只是连接顺序不同：一个有 O–H，一个是 C–O–C。室温下乙醇是液体、二甲醚是气体——差异来自结构，但数值要靠实验数据证实。",
    disclaimer: "三维构象由 RDKit（ETKDG + MMFF）课前离线计算，是一种低能量构象，球棍比例为示意；沸点与状态来自 NIST WebBook（101.325 kPa，纯物质，来源 S14）。",
    fallbackVideo: "media/molecule-demo.mp4",
    rows: 1,
    inquiry: {
      design: moleculeLesson,
      columns: (task) => task.id === "bonds"
        ? [{ key: "smiles", label: "SMILES" }, { key: "cc", label: "碳碳键长 Å" }, { key: "angle", label: "键角" }, { key: "shape", label: "形状" }]
        : task.id === "branch"
          ? [{ key: "smiles", label: "SMILES" }, { key: "formula", label: "分子式" }, { key: "main", label: "主链" }, { key: "branch", label: "支链点" }]
          : task.id === "property"
            ? [{ key: "smiles", label: "SMILES" }, { key: "oxygen", label: "氧" }, { key: "chain", label: "主链/支链" }, { key: "bp", label: "沸点 K" }, { key: "state", label: "25 °C" }]
            : [{ key: "smiles", label: "SMILES" }, { key: "formula", label: "分子式" }, { key: "oxygen", label: "氧的连接" }, { key: "bonds", label: "键数" }, { key: "relation", label: "与对照" }],
      capture: ({ params }) => {
        const a = analyzeMolecule(params);
        const item = properties.items[params.smiles];
        return {
          smiles: params.smiles, name: params.name, formula: a.formula, oxygen: a.oxygen, bonds: String(a.bonds),
          chain: `${a.mainChain}/${a.branchPoints}`, main: String(a.mainChain), branch: String(a.branchPoints),
          cc: ccText(a), angle: a.angle ? `${a.angle.label} ${a.angle.value.toFixed(1)}°` : "—", shape: a.shape,
          bp: item ? `${item.boilingK}±${item.uncertaintyK}` : "无数据", state: item?.state25C ?? "—",
          relation: pinned && pinned !== params ? RELATION_LABEL[relation(params, pinned)] : "—",
        };
      },
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refresh(); },
    },
  });
}
