import { dnaLesson } from "../content/lessons/dna";
import { AMINO, NORMAL_HBB, OUTCOME_LABEL, describeChange, firstDivergence, isSickle, readGene, tokenizeGene, translate, type Gene } from "../domain/dna";
import { mountDna } from "../scenes/dna";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";

// 生物 · DNA 是最古老的语言：同义词、错别字、提前的句号、错位——四种语言现象，四种生命后果。
// 结论只对真正的情形说：“镰刀型”只属于第 7 个密码子 Glu→Val；其他错义突变给出它自己的性质变化。

const PRESETS: Array<[string, string]> = [
  ["正常", NORMAL_HBB],
  ["同义 GAG→GAA", "ATG GTG CAC CTG ACT CCT GAA GAG AAG"],
  ["镰刀型 GAG→GTG", "ATG GTG CAC CTG ACT CCT GTG GAG AAG"],
  ["无义 GAG→TAG", "ATG GTG CAC CTG ACT CCT TAG GAG AAG"],
];
const SHIFTS: Array<[string, string]> = [
  ["插入一个碱基", "ATG GTG CAC A CTG ACT CCT GAG GAG AAG"],
  ["删除一个碱基", "ATG GTG CAC TG ACT CCT GAG GAG AAG"],
];

function explainOutcome(gene: Gene): { title: string; text: string; tone: "ok" | "warn" } {
  const change = gene.changes.length === 1 ? describeChange(gene.changes[0]) : undefined;
  if (gene.outcome === "normal") return { title: "正常的 β-珠蛋白", text: "红细胞呈双凹圆盘形，柔软地通过毛细血管。", tone: "ok" };
  if (gene.outcome === "silent") return { title: "换了字母，意思没变", text: `第 ${change?.codon ?? "?"} 个密码子 ${change?.bases ?? ""}：仍编码同一种氨基酸（${AMINO[translate(gene.changes[0].to)]?.zh ?? "?"}）。密码子有冗余，这是一个“同义词”。`, tone: "ok" };
  if (isSickle(gene)) return { title: "一个字母，改写了细胞的形状", text: "第 7 个密码子（成熟蛋白第 6 位）谷氨酸 → 缬氨酸：带负电、亲水变成疏水。缺氧时血红蛋白聚成纤维，红细胞被撑成镰刀形——镰刀型细胞贫血症（HbS）。", tone: "warn" };
  if (gene.outcome === "missense") return { title: "换了一个氨基酸", text: `第 ${change?.codon ?? "?"} 个密码子 ${change?.bases ?? ""}：${change?.amino ?? ""}，性质 ${change?.property ?? ""}${change?.propertyChanged ? "，性质改变了" : "，性质相近"}。后果取决于这个位置在蛋白质里的作用——不能只凭一个字母断言是否致病。`, tone: change?.propertyChanged ? "warn" : "ok" };
  if (gene.outcome === "nonsense") return { title: "句号提前出现", text: "出现终止密码子，之后的氨基酸都不再合成，β 链被截断——完整的珠蛋白无法合成（这是 β 地中海贫血的机制之一）。", tone: "warn" };
  if (gene.outcome === "frameshift") return { title: "整句错位", text: `碱基数从 ${gene.referenceLength} 变成 ${gene.length}，不是 3 的倍数：从第 ${firstDivergence(gene)} 个密码子起每个“词”都被重新分组，后面的氨基酸几乎全部改变。`, tone: "warn" };
  return { title: "序列改写了", text: "改动不止一处，或增减了整整一个密码子。试着一次只改一个字母，再比较。", tone: "warn" };
}

export function renderDna(): Promise<() => void> {
  let unlocked = false;
  let apiRef: LangLabApi<Gene> | undefined;

  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#dna-data");
    if (!box || !apiRef) return;
    const gene = apiRef.current().params;
    if (!unlocked) { box.innerHTML = `<small>翻译结果</small><p>先在下面锁定预测，翻译结果才会出现。</p>`; box.dataset.ready = "false"; return; }
    box.dataset.ready = "true";
    box.dataset.outcome = gene.outcome;
    const change = gene.changes.length === 1 && gene.outcome !== "frameshift" ? describeChange(gene.changes[0]) : undefined;
    const stopAt = gene.codons.findIndex((codon) => codon.amino === "*");
    box.innerHTML = `<small>翻译结果</small><strong>${OUTCOME_LABEL[gene.outcome]}</strong>
      <dl class="lx-metrics">
        <div><dt>改动</dt><dd>${change ? `第 ${change.codon} 个 ${change.bases}` : gene.outcome === "frameshift" ? `${gene.referenceLength}→${gene.length} 碱基` : gene.changes.length ? `${gene.changes.length} 处` : "无"}</dd></div>
        <div><dt>氨基酸</dt><dd>${change?.amino ?? "—"}</dd></div>
        <div><dt>性质</dt><dd>${change?.property ?? "—"}</dd></div>
        <div><dt>从第几个起不同</dt><dd>${firstDivergence(gene) || "—"}</dd></div>
        <div><dt>终止</dt><dd>${stopAt >= 0 ? `第 ${stopAt + 1} 个` : "无"}</dd></div>
      </dl>`;
  };

  const controls = (api: LangLabApi<Gene>) => {
    apiRef = api;
    return {
      html: `
        <div class="dna-controls">
          <div class="lx-segment" role="group" aria-label="预设">${PRESETS.map(([label], index) => `<button data-dna-preset="${index}">${label}</button>`).join("")}</div>
          <div class="lx-segment gv-senior" role="group" aria-label="移码">${SHIFTS.map(([label], index) => `<button data-dna-shift="${index}">${label}</button>`).join("")}</div>
          <div class="dna-edit" role="group" aria-label="改一个字母">
            <span class="gv-label">改字：第</span><select id="dna-codon">${Array.from({ length: 9 }, (_, i) => `<option value="${i}" ${i === 3 ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
            <span class="gv-label">个密码子第</span><select id="dna-pos">${[0, 1, 2].map((i) => `<option value="${i}">${i + 1}</option>`).join("")}</select>
            <span class="gv-label">位改成</span><select id="dna-base">${["A", "T", "G", "C"].map((base) => `<option ${base === "G" ? "selected" : ""}>${base}</option>`).join("")}</select>
            <button id="dna-apply">改</button>
          </div>
          <div class="readout gv-data" id="dna-data" aria-live="polite"></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.dnaPreset) api.setText(PRESETS[Number(button.dataset.dnaPreset)][1]);
          if (button.dataset.dnaShift) api.setText(SHIFTS[Number(button.dataset.dnaShift)][1]);
          if (button.id === "dna-apply") {
            // 一次只改一个碱基：在正常序列上改，便于控制变量
            const codons = NORMAL_HBB.split(" ");
            const index = Number(root.querySelector<HTMLSelectElement>("#dna-codon")!.value);
            const pos = Number(root.querySelector<HTMLSelectElement>("#dna-pos")!.value);
            const base = root.querySelector<HTMLSelectElement>("#dna-base")!.value;
            codons[index] = codons[index].slice(0, pos) + base + codons[index].slice(pos + 1);
            api.setText(codons.join(" "));
          }
        };
        root.addEventListener("click", onClick);
        return () => root.removeEventListener("click", onClick);
      },
      refresh,
    };
  };

  return renderLangLab<Gene>({
    id: "dna",
    subject: "生物",
    title: "DNA，最古老的语言",
    subtitle: "4 个字母，3 个一组成为“词”（密码子），64 个词对应 20 种氨基酸和“句号”。这是人类 β-珠蛋白基因的开头——改一个字母试试。",
    accent: "#ff6b8b",
    language: "DNA · A T G C",
    roles: {
      start: { label: "起始密码子", color: "#4dffa0" },
      codon: { label: "密码子（词）", color: "#9fc4ff" },
      mutation: { label: "突变", color: "#ff3355" },
      stop: { label: "终止（句号）", color: "#ffffff" },
    },
    variants: PRESETS.map(([label, text]) => ({ label, text })),
    parse: (text) => {
      const gene = readGene(text);
      return gene
        ? { ok: true, params: gene, tokens: tokenizeGene(text) }
        : { ok: false, params: readGene(NORMAL_HBB)!, tokens: [{ text }], message: "只认识 A、T、G、C（或 U），至少需要一个密码子。" };
    },
    mount: mountDna,
    explain: ({ params }, reveal) => {
      const stopAt = params.codons.findIndex((codon) => codon.amino === "*");
      const chain = params.codons.map((codon, index) => {
        const style = codon.mutated ? "color:#ff6b80;font-weight:700" : stopAt >= 0 && index > stopAt ? "opacity:.3;text-decoration:line-through" : "";
        return `<span style="${style}">${AMINO[codon.amino]?.three ?? "?"}</span>`;
      }).join(" – ") + (stopAt >= 0 && stopAt < params.codons.length - 1 ? "（句号之后不再翻译）" : "");
      if (!reveal) return { title: "这段序列翻译出的链", body: `<p class="math" style="font-size:.82rem">${chain}</p><p>后果是什么？先预测，再用翻译结果作证据。</p>` };
      const outcome = explainOutcome(params);
      return { title: outcome.title, body: `<p class="math" style="font-size:.82rem">${chain}</p><p class="${outcome.tone === "ok" ? "lang-ok" : "lang-warn"}">${outcome.text}</p>` };
    },
    question: "同义词、错别字、提前的句号、整句错位——你在批改作文时见过的错误，在 DNA 里分别意味着什么？",
    disclaimer: "序列为人类 HBB 编码区开头 9 个密码子（含起始密码子），突变位置按含 Met 计数；标准密码子表翻译；红细胞形态为示意。",
    fallbackVideo: "media/dna-demo.mp4",
    rows: 2,
    inquiry: {
      design: dnaLesson,
      columns: (task) => task.id === "sickle"
        ? [{ key: "change", label: "改动" }, { key: "amino", label: "氨基酸" }, { key: "property", label: "性质" }, { key: "outcome", label: "结果" }]
        : task.id === "frameshift"
          ? [{ key: "outcome", label: "结果" }, { key: "change", label: "改动" }, { key: "divergence", label: "从第几个起不同" }, { key: "stop", label: "终止" }]
          : [{ key: "change", label: "改动" }, { key: "amino", label: "氨基酸" }, { key: "outcome", label: "结果" }, { key: "stop", label: "终止" }],
      capture: ({ params }) => {
        const change = params.changes.length === 1 && params.outcome !== "frameshift" ? describeChange(params.changes[0]) : undefined;
        const stopAt = params.codons.findIndex((codon) => codon.amino === "*");
        return {
          outcome: OUTCOME_LABEL[params.outcome],
          change: change ? `${change.codon}:${change.bases}` : params.outcome === "frameshift" ? `${params.referenceLength}→${params.length} 碱基` : params.changes.length ? `${params.changes.length} 处` : "无",
          amino: change?.amino ?? "—", property: change?.property ?? "—",
          divergence: String(firstDivergence(params) || "—"), stop: stopAt >= 0 ? `第 ${stopAt + 1} 个` : "无",
        };
      },
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refresh(); },
    },
  });
}
