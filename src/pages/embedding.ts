import { embeddingLesson } from "../content/lessons/embedding";
import { createSpace, parseQuery, presetExpected, type AnalogyReport, type EmbeddingData, type EmbeddingQuery, type PairReport } from "../domain/embedding";
import { GROUP_COLORS, mountEmbedding } from "../scenes/embedding";
import type { EvidenceRow } from "../ui/inquiry";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";
import "../styles/embedding-lab.css";

// AI 认知 · 词向量宇宙：AI 眼里，“意思”是空间里的位置；中文和英文住在同一个宇宙。
// 探究层：相似度、近邻名次、类比全部由 domain/embedding.ts 在原始 1024 维里计算；三维图只是 t-SNE 投影。
// 讲解卡不写死结论：类比是否“命中”按每组预设里记录的期望答案判断，平均相似度由全部词对现算。

const PAIR_PRESETS: Record<string, Array<[string, string]>> = {
  pairs: [["猫", "cat"], ["猫", "狗"], ["猫", "数学"], ["马", "horse"], ["王后", "queen"]],
  picture: [["猫", "cat"], ["女人", "woman"], ["老虎", "语言"], ["猫", "老虎"]],
};
const f2 = (value: number) => value.toFixed(2);
const f3 = (value: number) => value.toFixed(3);

export async function renderEmbedding(): Promise<() => void> {
  const data = await (await fetch("./data/embeddings.json")).json() as EmbeddingData;
  const space = createSpace(data);
  const words = data.words.map((word) => word.text);
  const mean = space.meanSimilarity;
  const pairMean = space.pairMean;
  const idx = (word: string) => Math.max(0, space.index(word));
  const exprOf = (a: number, b: number, c: number) => `${words[a]} − ${words[b]} + ${words[c]}`;

  let taskId = embeddingLesson.tasks[0].id;
  let unlocked = false;
  let pairSel: [number, number] = [idx("猫"), idx("cat")];
  let analogySel: [number, number, number, number] = [idx("国王"), idx("男人"), idx("女人"), idx("王后")];
  let apiRef: LangLabApi<EmbeddingQuery> | undefined;

  const pairText = (a: number, b: number) => `${words[a]}–${words[b]}`;
  const vsMean = (similarity: number) => similarity - mean >= .15 ? "远高于平均" : similarity - mean >= .05 ? "高于平均" : similarity - mean > -.05 ? "约等于平均" : "低于平均";
  const analogyNow = (): AnalogyReport | undefined => {
    const [a, b, c, e] = analogySel;
    return new Set([a, b, c]).size === 3 ? space.analogy(a, b, c, e) : undefined;
  };
  const rankText = (rank: number | null | undefined) => rank === null || rank === undefined ? "—（是 A/B/C 之一）" : `第 ${rank} 名`;

  const pairCard = (r: PairReport) => {
    const [a, b] = [words[r.a], words[r.b]];
    return `<small>1024 维数据（不是看图）· ${data.model}</small>
      <strong>${a} – ${b}：相似度 <span id="em-sim">${f3(r.similarity)}</span></strong>
      <dl class="lx-metrics em-metrics">
        <div><dt>与平均 ${f2(mean)} 比</dt><dd>${vsMean(r.similarity)}</dd></div>
        <div><dt>${b} 在 ${a} 的近邻</dt><dd>第 ${r.rankAB} 名</dd></div>
        <div><dt>${a} 在 ${b} 的近邻</dt><dd>第 ${r.rankBA} 名</dd></div>
        <div class="em-senior"><dt>三维图距离</dt><dd>${f2(r.distance)}</dd></div>
        <div class="em-senior"><dt>三维图名次</dt><dd>第 ${r.rank3dAB} 名</dd></div>
      </dl>
      <p>名次在 ${space.size - 1} 个词里排（1 = 最近）。${a} 的 1024 维前 3 近邻：${space.neighbours(r.a, 3).map((item) => `${words[item.index]} ${f2(item.score)}`).join("、")}。</p>`;
  };

  const analogyCard = (r: AnalogyReport | undefined) => {
    if (!r) return `<small>类比</small><p>A、B、C 要选三个不同的词。</p>`;
    return `<small>1024 维数据 · 在其余 ${r.ranked.length} 个词里找最接近 A − B + C 的</small>
      <strong>${exprOf(r.a, r.b, r.c)} ≈ <span id="em-result">${words[r.result]}</span>（${f3(r.score)}）</strong>
      <ol class="em-top">${r.ranked.slice(0, 3).map((item) => `<li${item.index === r.expected ? ` class="em-expected"` : ""}>${words[item.index]} <small>${f3(item.score)}</small></li>`).join("")}</ol>
      <p>期望答案 <b>${words[r.expected!]}</b>：<span id="em-rank">${rankText(r.expectedRank)}</span>${r.expectedScore === undefined ? "" : `（${f3(r.expectedScore)}）`}</p>`;
  };

  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#em-data");
    if (!box || !apiRef) return;
    const showAnalogy = taskId === "analogy";
    document.querySelector<HTMLElement>("#em-pair-box")!.hidden = showAnalogy;
    document.querySelector<HTMLElement>("#em-analogy-box")!.hidden = !showAnalogy;
    document.querySelectorAll<HTMLElement>("[data-pair-group]").forEach((group) => { group.hidden = group.dataset.pairGroup !== (taskId === "picture" ? "picture" : "pairs"); });
    const selects = ["#em-a", "#em-b"].map((id) => document.querySelector<HTMLSelectElement>(id)!);
    selects.forEach((select, index) => { select.value = String(pairSel[index]); });
    ["#em-an-a", "#em-an-b", "#em-an-c", "#em-an-e"].forEach((id, index) => { document.querySelector<HTMLSelectElement>(id)!.value = String(analogySel[index]); });
    document.querySelector<HTMLButtonElement>("#em-run")!.disabled = !unlocked;
    box.hidden = !unlocked;
    box.dataset.ready = String(unlocked);
    document.querySelector<HTMLElement>("#em-locked")!.hidden = unlocked;
    if (!unlocked) { box.innerHTML = ""; return; }
    box.innerHTML = showAnalogy ? analogyCard(analogyNow()) : pairCard(space.pair(pairSel[0], pairSel[1]));
  };

  /** 锁定预测之后，控件才驱动三维画面（之前画面不提前“剧透”） */
  const show = () => {
    if (!unlocked || !apiRef) return;
    if (taskId === "analogy") {
      const [a, b, c] = analogySel;
      if (new Set([a, b, c]).size === 3) apiRef.setText(`${words[a]} - ${words[b]} + ${words[c]}`);
    } else apiRef.setText(words[pairSel[0]]);
  };

  const options = (selected: number) => data.words.map((word, index) => `<option value="${index}" ${index === selected ? "selected" : ""}>${word.text}</option>`).join("");
  const controls = (api: LangLabApi<EmbeddingQuery>) => {
    apiRef = api;
    return {
      html: `
        <div class="em-controls">
          <fieldset id="em-pair-box" class="em-box"><legend>两个词比一比</legend>
            ${Object.entries(PAIR_PRESETS).map(([group, list]) => `<div class="lx-segment em-presets" role="group" aria-label="词对预设" data-pair-group="${group}">${list.map(([a, b]) => `<button data-pair="${a}|${b}">${a}–${b}</button>`).join("")}</div>`).join("")}
            <div class="em-row"><label>词 A <select id="em-a">${options(pairSel[0])}</select></label><label>词 B <select id="em-b">${options(pairSel[1])}</select></label></div>
          </fieldset>
          <fieldset id="em-analogy-box" class="em-box" hidden><legend>类比 A − B + C ≈ ?</legend>
            <div class="lx-segment em-presets" role="group" aria-label="类比预设">${data.analogies.map((item, index) => `<button data-analogy="${index}">${exprOf(item.a, item.b, item.c)}</button>`).join("")}</div>
            <div class="em-row em-row4"><label>A <select id="em-an-a">${options(analogySel[0])}</select></label><label>− B <select id="em-an-b">${options(analogySel[1])}</select></label><label>+ C <select id="em-an-c">${options(analogySel[2])}</select></label><label>期望 <select id="em-an-e">${options(analogySel[3])}</select></label></div>
            <button id="em-run" class="iq-primary em-run" disabled>计算类比</button>
          </fieldset>
          <p id="em-locked" class="em-locked">锁定预测后，这里显示 1024 维数据。</p>
          <div class="readout em-data" id="em-data" aria-live="polite" hidden></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.pair) {
            const [a, b] = button.dataset.pair.split("|");
            pairSel = [idx(a), idx(b)];
            refresh(); show();
          } else if (button.dataset.analogy) {
            const preset = data.analogies[Number(button.dataset.analogy)];
            analogySel = [preset.a, preset.b, preset.c, preset.expected ?? preset.result];
            refresh(); show();
          } else if (button.id === "em-run") show();
        };
        const onInput = (event: Event) => {
          const target = event.target as HTMLSelectElement;
          const value = Number(target.value);
          if (target.id === "em-a") pairSel = [value, pairSel[1]];
          else if (target.id === "em-b") pairSel = [pairSel[0], value];
          else if (target.id.startsWith("em-an-")) {
            const slot = ["a", "b", "c", "e"].indexOf(target.id.slice(6));
            analogySel = analogySel.map((old, index) => (index === slot ? value : old)) as typeof analogySel;
            // 换了 A/B/C 时，若这一组正好是预设，自动填上记录的期望答案
            if (slot < 3) { const expected = presetExpected(data, analogySel[0], analogySel[1], analogySel[2]); if (expected !== undefined) analogySel[3] = expected; }
          } else return;
          refresh();
          if (!target.id.startsWith("em-an-")) show();
        };
        root.addEventListener("click", onClick);
        root.addEventListener("change", onInput);
        return () => { root.removeEventListener("click", onClick); root.removeEventListener("change", onInput); };
      },
      refresh,
    };
  };

  const neighbourLine = (index: number) => space.neighbours(index, 5).map((item) => `${words[item.index]} <small>${f2(item.score)}</small>`).join(" · ");

  return renderLangLab<EmbeddingQuery>({
    id: "embedding",
    subject: "AI 是怎样“懂”语言的",
    title: "词向量宇宙",
    subtitle: `大语言模型把每个词变成一个 1024 维的点，意思相近，方向就相近：“猫”和“cat”的相似度 ${f2(space.similarity(idx("猫"), idx("cat")))}，而任意两个词平均 ${f2(mean)}。眼前的三维宇宙只是投影——远近能不能信，要回到数据核对。`,
    accent: "#8a7bff",
    language: "一个词，或 A − B + C",
    roles: {
      word: { label: "词（向量）", color: "#8a7bff" },
      op: { label: "向量加减", color: "#ffd38a" },
      unknown: { label: "不在宇宙里", color: "#ff6b5b" },
    },
    variants: [
      { label: "猫", text: "猫" },
      { label: "cat", text: "cat" },
      { label: "数学", text: "数学" },
      { label: "爱", text: "爱" },
      { label: "king − man + woman", text: "king - man + woman" },
      { label: "东京 − 日本 + 中国", text: "东京 - 日本 + 中国" },
      { label: "Paris − France + Japan", text: "Paris - France + Japan" },
      { label: "王子 − 男人 + 女人", text: "王子 - 男人 + 女人" },
      { label: "国王 − 男人 + 女人", text: "国王 - 男人 + 女人" },
    ],
    parse: (text) => {
      const { query, tokens, message } = parseQuery(data, text, space);
      return query ? { ok: true, params: query, tokens } : { ok: false, params: { kind: "word", index: 0 }, tokens, message };
    },
    mount: mountEmbedding(data),
    explain: ({ params }, reveal) => {
      if (params.kind === "word") {
        const word = data.words[params.index];
        const title = `<span style="color:${GROUP_COLORS[word.group]}">${word.text}</span> 的邻居`;
        if (!reveal && !unlocked) return { title: word.text, body: `<p>它在 1024 维里离谁最近？先在左边锁定预测，再看数据。</p>` };
        const neighbours = `<p>1024 维前 5 近邻：${neighbourLine(params.index)}</p>`;
        if (!reveal) return { title, body: neighbours };
        const pair = data.pairs.find((item) => item.zh === params.index || item.en === params.index);
        const similarity = pair ? space.similarity(pair.zh, pair.en) : 0;
        return {
          title,
          body: `${neighbours}${pair ? `<p class="${similarity - mean >= .15 ? "lang-ok" : "lang-warn"}">“${words[pair.zh]}”与“${words[pair.en]}”的相似度 ${f2(similarity)}，${vsMean(similarity)}。全部 ${data.pairs.length} 对中英文同义词平均 ${f2(pairMean)}，而任意两个词平均 ${f2(mean)}。</p>` : ""}`,
        };
      }
      const r = params.analogy as AnalogyReport;
      const ranked = r.ranked ?? space.analogy(r.a, r.b, r.c, r.expected).ranked;
      if (!reveal && !unlocked) return { title: `${exprOf(r.a, r.b, r.c)} ≈ ?`, body: `<p>先在左边锁定预测，再看 AI 算出的结果。</p>` };
      const data1 = `<p>在 1024 维空间里做向量加减，最接近的是 <b>${words[r.result]}</b>（${f3(r.score)}），前三名：${ranked.slice(0, 3).map((item) => `${words[item.index]} ${f3(item.score)}`).join("、")}。</p>`;
      const title = `${exprOf(r.a, r.b, r.c)} ≈ ${words[r.result]}`;
      if (!reveal) return { title, body: data1 };
      if (r.expected === undefined) return { title, body: `${data1}<p>这一组没有预设的期望答案：在“探究”里填上你期望的词，看它排第几。</p>` };
      const hit = r.result === r.expected;
      return {
        title,
        body: `${data1}<p class="${hit ? "lang-ok" : "lang-warn"}">${hit
          ? `命中期望答案“${words[r.expected]}”：从 ${words[r.b]} 到 ${words[r.a]} 的方向，和从 ${words[r.c]} 到 ${words[r.expected]} 的方向几乎是同一步。`
          : `期望答案“${words[r.expected]}”只排${rankText(r.expectedRank)}——类比是统计上的近似，不是每次都成立。这正是要让学生学会验证的原因。`}</p>`,
      };
    },
    question: "屏幕上挨着的两个词，在 AI 的 1024 维空间里也一定“意思相近”吗？“近”要和什么比？",
    disclaimer: `向量来自本机 ${data.model}，课前离线计算并按 int8 存储（余弦误差 < 0.004）；相似度、近邻、类比都在原始 1024 维中计算；三维位置由 t-SNE 投影，只尽量保留“谁和谁是邻居”，距离不能直接读。`,
    fallbackVideo: "media/embedding-demo.mp4",
    rows: 1,
    inquiry: {
      design: embeddingLesson,
      columns: (task) => task.id === "analogy"
        ? [{ key: "expr", label: "类比" }, { key: "top3", label: "前三名" }, { key: "expected", label: "期望" }, { key: "rank", label: "期望名次" }, { key: "hit", label: "命中" }]
        : task.id === "picture"
          ? [{ key: "pair", label: "词对" }, { key: "sim", label: "1024 维相似度" }, { key: "rankHd", label: "1024 维名次" }, { key: "dist", label: "三维距离" }, { key: "rank3d", label: "三维名次" }]
          : [{ key: "pair", label: "词对" }, { key: "sim", label: "相似度" }, { key: "rankHd", label: "近邻名次" }, { key: "vsMean", label: `与平均 ${f2(mean)} 比` }],
      capture: (): EvidenceRow => {
        if (taskId === "analogy") {
          const r = analogyNow();
          if (!r) return { expr: "（A、B、C 需不同）", top3: "—", expected: "—", rank: "—", hit: "—" };
          return {
            expr: exprOf(r.a, r.b, r.c), top3: r.ranked.slice(0, 3).map((item) => `${words[item.index]} ${f2(item.score)}`).join("、"),
            expected: words[r.expected!], rank: r.expectedRank ? String(r.expectedRank) : "—", hit: r.expectedRank === 1 ? "命中" : "未命中",
          };
        }
        const r = space.pair(pairSel[0], pairSel[1]);
        return {
          pair: pairText(r.a, r.b), sim: f3(r.similarity), rankHd: String(r.rankAB), vsMean: vsMean(r.similarity),
          dist: f2(r.distance), rank3d: String(r.rank3dAB),
        };
      },
      controls,
      onChange: (task, phase) => {
        const switched = task.id !== taskId;
        taskId = task.id;
        unlocked = phase !== "predict";
        refresh();
        if (switched) show();
      },
    },
  });
}
