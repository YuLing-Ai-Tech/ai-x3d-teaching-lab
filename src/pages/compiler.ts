import { compilerLesson } from "../content/lessons/compiler";
import { SHAPE_LABEL, WORLD_LABEL, languageForm, paramLabel, parseShape, precisionReport, sameWorld, translate, type PrecisionReport, type ShapeSpec } from "../domain/compiler";
import { mountCompiler } from "../scenes/compiler";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";
import "../styles/compiler-lab.css";

// 案例 0 · 语言编译台：全天的核心论点页——中文、英文、数学、代码是同一个世界的四种写法。
// 探究层：所有证据（说出的 / 被猜的参数、默认值、被改动的数、模糊词、同一个世界判定）都由
// precisionReport() 与 sameWorld() 从解析器的真实输出计算；预测锁定前数据卡不显示。

const escape = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const fmt = (value: number) => Number(value.toFixed(2)).toString();

const PRESETS: Array<{ group: string; items: Array<{ label: string; text: string }> }> = [
  { group: "说不清楚", items: [
    { label: "漂亮的球", text: "一个漂亮的球" },
    { label: "大一点的圆锥", text: "一个大一点的圆锥" },
    { label: "好看的螺旋线", text: "一条好看的螺旋线，绕 5 圈" },
    { label: "A ball", text: "A ball" },
  ] },
  { group: "说清楚", items: [
    { label: "半径 2 的球", text: "一个半径为 2 的球" },
    { label: "圆锥 2 × 4", text: "一个底面半径 2、高 4 的圆锥" },
    { label: "半径 10 的球", text: "一个半径为 10 的球" },
  ] },
  { group: "别的语言", items: [
    { label: "English", text: "A sphere of radius 2" },
    { label: "代码式", text: "sphere({ radius: 2 })" },
    { label: "数学式", text: "x² + y² + z² = 4" },
  ] },
];

const statedText = (report: PrecisionReport) => report.stated.map((param) => `${param.label} ${fmt(param.value)}`).join("、") || "—";
const guessedText = (report: PrecisionReport) => report.guessed.map((param) => `${param.label}→默认 ${fmt(param.fallback)}`).join("、") || "—";
const clampedText = (report: PrecisionReport) => report.clamped.map((param) => `${param.label} ${fmt(param.raw!)}→${fmt(param.value)}`).join("、") || "—";
const verdictOf = (report: PrecisionReport) => (!report.ok ? "读不懂" : report.guessed.length ? "有被猜参数" : "0 个被猜参数");

export function renderCompiler(): Promise<() => void> {
  let unlocked = false;
  let pinnedText: string | undefined;
  let apiRef: LangLabApi<ShapeSpec> | undefined;
  const currentText = () => document.querySelector<HTMLTextAreaElement>("#lang-input")?.value ?? "";

  /** 与钉住句比较；没钉住或就是钉住句本身时给出说明 */
  const worldOf = (text: string) => {
    if (pinnedText === undefined) return { label: "未钉住", verdict: "none" as const, differences: [] };
    if (text === pinnedText) return { label: "（钉住的句子本身）", verdict: "self" as const, differences: [] };
    const result = sameWorld(parseShape(pinnedText).spec, parseShape(text).spec);
    return { label: WORLD_LABEL[result.verdict], verdict: result.verdict, differences: result.differences };
  };

  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#cp-data");
    if (!box || !apiRef) return;
    const text = currentText();
    const mine = document.querySelector<HTMLTextAreaElement>("#cp-mine");
    if (mine && document.activeElement !== mine && mine.value !== text) mine.value = text;
    document.querySelectorAll<HTMLButtonElement>("[data-cp-text]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.cpText === text)));
    document.querySelector<HTMLElement>("#cp-pinned")!.innerHTML = pinnedText === undefined ? "还没有钉住句子" : `钉住：<b>${escape(pinnedText)}</b>`;
    document.querySelector<HTMLElement>("#cp-locked")!.hidden = unlocked;
    box.hidden = !unlocked;
    if (!unlocked) { box.innerHTML = ""; box.dataset.ready = "false"; return; }
    const report = precisionReport(text);
    const world = worldOf(text);
    box.dataset.ready = "true";
    box.dataset.guessed = report.ok ? String(report.guessed.length) : "—";
    box.dataset.world = world.verdict;
    const rows = report.params.map((param) => `<tr class="${param.stated ? (param.clamped ? "cp-clamped" : "cp-stated") : "cp-guessed"}">
        <th>${param.label}</th>
        <td>${param.stated ? (param.clamped ? `写了 ${fmt(param.raw!)} → 被改成 ${fmt(param.value)}` : `说出 ${fmt(param.value)}`) : "没说"}</td>
        <td>${param.stated ? (param.clamped ? `范围 ${fmt(param.range[0])}–${fmt(param.range[1])}` : "—") : `机器用默认值 ${fmt(param.fallback)}`}</td></tr>`).join("");
    box.innerHTML = `<small>数据卡 · 解析器实测（${languageForm(text)}）</small>
      <strong>${report.ok ? `形状：${SHAPE_LABEL[report.kind!]}` : "读不懂：没有找到五种形状之一"}</strong>
      <dl class="lx-metrics">
        <div><dt>说出</dt><dd>${report.stated.length}</dd></div><div><dt>被猜</dt><dd id="cp-guessed">${report.ok ? report.guessed.length : "—"}</dd></div>
        <div><dt>被改动</dt><dd>${report.clamped.length}</dd></div><div><dt>模糊词</dt><dd>${report.vague.length}</dd></div>
      </dl>
      ${report.ok ? `<table class="cp-table"><thead><tr><th>参数</th><th>句子里</th><th>机器的决定</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      <p>模糊词：${report.vague.length ? report.vague.map((word) => `<span class="cp-vague">${escape(word)}</span>`).join(" ") : "无"}</p>
      <p class="cp-world" data-world="${world.verdict}">与钉住句：<b>${world.label}</b>${world.differences.length ? `（${world.differences.map((item) => `${item.label} ${fmt(item.a)} ≠ ${fmt(item.b)}`).join("；")}）` : ""}</p>`;
  };

  const controls = (api: LangLabApi<ShapeSpec>) => {
    apiRef = api;
    return {
      html: `
        <div class="cp-controls">
          ${PRESETS.map((group) => `<div class="cp-presets" role="group" aria-label="${group.group}"><span class="gv-label">${group.group}</span>${group.items.map((item) => `<button data-cp-text="${escape(item.text)}">${item.label}</button>`).join("")}</div>`).join("")}
          <label for="cp-mine">我的描述</label>
          <textarea id="cp-mine" rows="2" spellcheck="false" autocomplete="off" placeholder="用中文或英文描述一个形状，例如：一个底面半径 2、高 4 的圆锥"></textarea>
          <div class="cp-row"><button id="cp-apply">用我的描述</button><button id="cp-pin">钉住这句作对照</button></div>
          <p class="cp-pinned" id="cp-pinned"></p>
          <p class="cp-locked" id="cp-locked">锁定预测后，数据卡才会显示：哪些参数是你说的、哪些是机器猜的。</p>
          <div class="readout gv-data cp-data" id="cp-data" aria-live="polite" hidden></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const mine = root.querySelector<HTMLTextAreaElement>("#cp-mine")!;
        let timer = 0;
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.cpText !== undefined) api.setText(button.dataset.cpText);
          if (button.id === "cp-apply") { window.clearTimeout(timer); api.setText(mine.value); }
          if (button.id === "cp-pin") { pinnedText = currentText(); refresh(); }
        };
        const onInput = (event: Event) => {
          if (event.target !== mine) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => api.setText(mine.value), 300);
        };
        root.addEventListener("click", onClick);
        root.addEventListener("input", onInput);
        return () => { window.clearTimeout(timer); root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); };
      },
      refresh,
    };
  };

  return renderLangLab<ShapeSpec>({
    id: "compiler",
    subject: "AI 时代的语言",
    title: "语言编译台",
    subtitle: "用中文或英文说一个形状。AI 把它翻译成数学与代码，粒子按你的话重组世界。说得越清楚，世界越准确。",
    accent: "#2fd4ff",
    language: "中文 / English",
    roles: {
      object: { label: "对象", color: "#2fd4ff" },
      relation: { label: "关系", color: "#c58bff" },
      quantity: { label: "数量", color: "#ffd38a" },
      vague: { label: "模糊词 · AI 只能猜", color: "#ff6b5b" },
    },
    variants: [
      { label: "球 · 中文", text: "一个半径为 2 的球" },
      { label: "Helix · English", text: "A helix of radius 2, 3 turns, rising 1 per turn" },
      { label: "弹簧", text: "一条螺旋线，半径 1.5，绕 6 圈，每圈升高 0.6" },
      { label: "圆锥", text: "一个底面半径 2、高 4 的圆锥" },
      { label: "波浪面", text: "一张波长 3、振幅 0.8 的波浪面" },
      { label: "圆环", text: "一个大半径 2.6、管半径 0.8 的圆环" },
      { label: "说不清楚", text: "一个漂亮的球" },
    ],
    parse: (text) => {
      const { spec, tokens } = parseShape(text);
      return spec
        ? { ok: true, params: spec, tokens }
        : { ok: false, params: { kind: "sphere", values: { r: 2 }, guessed: [] }, tokens, message: "没有找到形状。试试：球、螺旋线、圆锥、波浪面、圆环（或 sphere / helix / cone / wave / torus）。" };
    },
    mount: mountCompiler,
    explain: ({ params }, reveal) => {
      const t = translate(params);
      const fourLanguages = `<dl class="four-lang">
          <dt>中文</dt><dd>${escape(t.zh)}</dd>
          <dt>English</dt><dd>${escape(t.en)}</dd>
          <dt>数学</dt><dd class="math">${escape(t.math)}</dd>
          <dt>代码</dt><dd><code>${escape(t.code).replace(/\n/g, "<br>")}</code></dd>
        </dl>`;
      if (!reveal && !unlocked) {
        return { title: `读出的形状：${SHAPE_LABEL[params.kind]}`, body: `<p>机器会替你决定什么？先在“探究”里写下预测并锁定，数据卡和四种写法才会出现。</p>` };
      }
      if (!reveal) {
        return { title: "四种语言的写法", body: `${fourLanguages}<p>哪些数是你说的、哪些是机器补上的？用数据卡记录证据——结论等证据够了再揭晓。</p>` };
      }
      const report = precisionReport(currentText());
      const notes: string[] = [];
      notes.push(params.guessed.length
        ? `<p class="lang-warn">⚠ 没说清楚：${params.guessed.map((key) => `${paramLabel(params.kind, key)}（只能猜 ${fmt(params.values[key])}）`).join("、")}</p>`
        : `<p class="lang-ok">✓ 每个数量都说清楚了，世界是确定的。</p>`);
      if (report.ok && report.clamped.length) notes.push(`<p class="lang-warn">⚠ 被改动：${clampedText(report)}（超出范围，机器改成了边界值）</p>`);
      if (report.ok && report.vague.length) notes.push(`<p class="lang-warn">“${report.vague.map(escape).join("”“")}”没有变成任何参数，被这台解析器忽略了；真实的 AI 会按训练数据里的习惯去“理解”它。</p>`);
      return { title: "四种语言，同一个世界", body: `${fourLanguages}${notes.join("")}` };
    },
    question: "四种写法里，哪一种最精确？哪一种 AI 最容易执行？只说“一个漂亮的球”时，是谁替你做了决定？",
    disclaimer: "离线运行：解析器只认识五种形状与常见中英文说法，没说的参数用写死的默认值，用于课堂演示“语言→结构”的对应关系；真实的 AI 会用训练数据里的习惯填补空白。",
    fallbackVideo: "media/compiler-demo.mp4",
    inquiry: {
      design: compilerLesson,
      columns: (task) => task.id === "vague"
        ? [{ key: "sentence", label: "句子" }, { key: "guessedList", label: "被猜（默认值）" }, { key: "vague", label: "模糊词" }, { key: "verdict", label: "判定" }]
        : task.id === "rewrite"
          ? [{ key: "sentence", label: "句子" }, { key: "stated", label: "说出的" }, { key: "guessed", label: "被猜个数" }, { key: "verdict", label: "判定" }]
          : task.id === "world"
            ? [{ key: "sentence", label: "句子" }, { key: "form", label: "语言" }, { key: "values", label: "形状与参数" }, { key: "world", label: "与钉住句" }]
            : [{ key: "form", label: "语言" }, { key: "sentence", label: "句子" }, { key: "guessed", label: "被猜" }, { key: "clamped", label: "被改动" }, { key: "verdict", label: "判定" }],
      capture: () => {
        const text = currentText();
        const report = precisionReport(text);
        return {
          sentence: text, form: languageForm(text), shape: report.ok ? SHAPE_LABEL[report.kind!] : "读不懂",
          stated: statedText(report), guessed: report.ok ? String(report.guessed.length) : "—", guessedList: guessedText(report),
          clamped: clampedText(report), vague: report.vague.join("、") || "—", verdict: verdictOf(report),
          values: report.ok ? `${SHAPE_LABEL[report.kind!]}：${report.params.map((param) => `${param.label} ${fmt(param.value)}${param.stated ? "" : "（猜）"}`).join("、")}` : "读不懂",
          world: worldOf(text).label,
        };
      },
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refresh(); },
    },
  });
}
