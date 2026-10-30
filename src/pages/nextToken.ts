import { nextTokenLesson } from "../content/lessons/nextToken";
import { CERTAINTY_LABEL, applyTemperature, bits, certainty, percent, showToken, stepStats, type StepStats } from "../domain/nextToken";
import { mountNextToken, type TokenPrompt } from "../scenes/nextToken";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";
import "../styles/nextToken-lab.css";

// AI 认知 · 下一个词：大语言模型做的只有一件事——根据前文，算出下一个词的概率。
// 探究层：预测锁定前光柱遮住、数据卡不出现；证据（第一名、差距、熵、温度）全部由 domain/nextToken.ts 从离线数据算出，
// 讲解卡的判断也只由数字决定（certainty()），不按句子写死。

interface TokenData { model: string; prompts: TokenPrompt[] }

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const tok = (token: string) => `“${escapeHtml(showToken(token))}”`;
const points = (margin: number) => (margin * 100).toFixed(1);
const tempKey = (t: number) => t.toFixed(1);

export async function renderNextToken(): Promise<() => void> {
  const data = await (await fetch("./data/next-token.json")).json() as TokenData;
  let unlocked = false;
  let temperature = 1;
  let apiRef: LangLabApi<TokenPrompt> | undefined;
  /** 初中没有温度控件：一律按 T = 1 */
  const temp = () => (apiRef?.stage() === "初中" ? 1 : temperature);
  const senior = () => apiRef?.stage() !== "初中";

  const measure = (prompt: TokenPrompt) => {
    const first = prompt.steps[0];
    const stats = stepStats(first);
    const t = temp();
    const scaled = applyTemperature(first, t);
    return { stats, t, scaled, hot: stepStats(scaled) };
  };

  const verdict = (stats: StepStats) => {
    const level = certainty(stats);
    const head = `${CERTAINTY_LABEL[level]}：第一名 ${tok(stats.top.token)} 占 ${percent(stats.p1)}，与第二名差 ${points(stats.margin)} 个百分点，熵 ${bits(stats.entropy)}。`;
    if (level === "sure") return { ok: true, text: `${head}前文几乎把答案“说死了”：在模型读过的文本里，这里几乎只有一种接法。` };
    if (level === "lean") return { ok: true, text: `${head}有明显倾向，但还有 ${percent(1 - stats.p1)} 分给了别的接法——概率高不等于“对”。` };
    return { ok: false, text: `${head}没有哪个词占优势，前 8 名合计也只有 ${percent(stats.covered)}。概率说明的是文本里哪种接法常见，不是哪种观点正确或重要——判断与追问，仍然是人的事。` };
  };

  const controls = (api: LangLabApi<TokenPrompt>) => {
    apiRef = api;
    return {
      html: `
        <div class="gv-controls nt-controls">
          <div class="lx-segment nt-prompts" role="group" aria-label="前文">
            ${data.prompts.map((prompt, index) => `<button data-prompt="${index}" title="${escapeHtml(prompt.prompt)}">${escapeHtml(prompt.label)} · ${escapeHtml(prompt.prompt.slice(0, 6))}…</button>`).join("")}
          </div>
          <label class="gv-senior" for="nt-temp">温度 T <output id="nt-temp-out">1.0</output></label>
          <input class="gv-senior" id="nt-temp" type="range" min="0.3" max="2" step="0.1" value="1">
          <div class="lx-segment gv-senior" role="group" aria-label="温度快捷"><span class="gv-label">温度</span><button data-temp="0.5">0.5</button><button data-temp="1">1.0</button><button data-temp="1.5">1.5</button></div>
          <div class="readout gv-data nt-data" id="nt-data" aria-live="polite"></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const slider = root.querySelector<HTMLInputElement>("#nt-temp")!;
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.prompt) api.choose(Number(button.dataset.prompt));
          if (button.dataset.temp) { temperature = Number(button.dataset.temp); slider.value = String(temperature); refreshData(); }
        };
        const onInput = (event: Event) => {
          if (event.target === slider) { temperature = Number(slider.value); refreshData(); }
        };
        root.addEventListener("click", onClick);
        root.addEventListener("input", onInput);
        return () => { root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); };
      },
      refresh: () => refreshData(),
    };
  };

  const refreshData = () => {
    const box = document.querySelector<HTMLElement>("#nt-data");
    if (!box || !apiRef) return;
    const prompt = apiRef.current().params;
    const out = document.querySelector<HTMLOutputElement>("#nt-temp-out");
    if (out) out.value = tempKey(temperature);
    document.querySelectorAll<HTMLButtonElement>("[data-prompt]").forEach((button) => button.setAttribute("aria-pressed", String(data.prompts[Number(button.dataset.prompt)] === prompt)));
    document.querySelectorAll<HTMLButtonElement>("[data-temp]").forEach((button) => button.setAttribute("aria-pressed", String(Math.abs(Number(button.dataset.temp) - temperature) < 1e-9)));
    if (!unlocked) {
      box.innerHTML = `<small>概率数据</small><p>先在下面锁定预测，光柱和概率才会出现。</p>`;
      box.dataset.ready = "false";
      return;
    }
    const { stats, t, scaled, hot } = measure(prompt);
    const isSenior = senior();
    box.dataset.ready = "true";
    box.innerHTML = `<small>第 1 步 · 下一个词的前 8 个候选</small><strong>${escapeHtml(prompt.prompt)}<span class="nt-blank">${tok(stats.top.token)}</span></strong>
      <dl class="lx-metrics">
        <div><dt>第一名 p1</dt><dd id="nt-p1">${percent(stats.p1)}</dd></div>
        <div><dt>与第二名差</dt><dd id="nt-margin">${points(stats.margin)} 点</dd></div>
        <div><dt>前 8 名合计</dt><dd id="nt-covered">${percent(stats.covered)}</dd></div>
        <div class="gv-senior"><dt>熵（前 8 归一）</dt><dd id="nt-entropy">${stats.entropy.toFixed(2)}</dd></div>
      </dl>
      <ol class="nt-bars">${prompt.steps[0].map((candidate, index) => `<li><span class="nt-tok">${escapeHtml(showToken(candidate.token))}</span><span class="nt-bar"><i style="width:${(candidate.p * 100).toFixed(2)}%"></i>${isSenior && t !== 1 ? `<i class="nt-hot" style="width:${(scaled[index].p * 100).toFixed(2)}%"></i>` : ""}</span><span class="nt-p">${percent(candidate.p)}${isSenior && t !== 1 ? `<em>→ ${percent(scaled[index].p)}</em>` : ""}</span></li>`).join("")}</ol>
      ${isSenior ? `<p class="gv-senior" id="nt-hot">T = ${tempKey(t)}：第一名 ${percent(hot.p1)}，熵 ${bits(hot.entropy)}（只在前 8 个里按 p^(1/T) 重新归一，是近似：前 8 名之外的 ${percent(Math.max(0, 1 - stats.covered))} 被忽略）。</p>` : ""}
      <p>整句续写（每步取第一名）：<b>${escapeHtml(prompt.prompt)}${escapeHtml(prompt.completion.replace(/\n/g, "↵"))}</b></p>`;
  };

  const capture = (prompt: TokenPrompt) => {
    const { stats, t, hot } = measure(prompt);
    const sorted = [...prompt.steps[0]].sort((a, b) => b.p - a.p);
    return {
      prompt: prompt.prompt, label: prompt.label,
      top: showToken(stats.top.token), p1: percent(stats.p1), margin: points(stats.margin), covered: percent(stats.covered),
      entropy: stats.entropy.toFixed(2),
      T: tempKey(t), q1: percent(hot.p1), hotEntropy: hot.entropy.toFixed(2), probe: `${prompt.label} T=${tempKey(t)}`,
      others: sorted.slice(1, 4).map((candidate) => `${showToken(candidate.token)} ${percent(candidate.p)}`).join("、"),
    };
  };

  return renderLangLab<TokenPrompt>({
    id: "next-token",
    subject: "AI 是怎样“说话”的",
    title: "下一个词",
    subtitle: "大语言模型只做一件事：读完前文，算出下一个词的概率，挑一个接上，再算下一个。以下每一根光柱，都是本机大模型真实算出的概率。",
    accent: "#ffd38a",
    language: "一句话的开头",
    roles: { prompt: { label: "你给的前文", color: "#ffd38a" } },
    variants: data.prompts.map((prompt) => ({ label: `${prompt.label} · ${prompt.prompt.slice(0, 8)}…`, text: prompt.prompt })),
    parse: (text) => {
      const prompt = data.prompts.find((item) => item.prompt === text.trim());
      return prompt
        ? { ok: true, params: prompt, tokens: [{ text: prompt.prompt, role: "prompt" }] }
        : { ok: false, params: data.prompts[0], tokens: [{ text }], message: "概率是课前用本机大模型离线算好的，现场请从下面的预设里选（断网也能演示）。" };
    },
    // 预测锁定前把光柱与续写遮住（只在“探究”页签；“语言”页签与原来一样）
    mount: (stage) => {
      const scene = mountNextToken(stage);
      return { ...scene, setRunning: (running: boolean) => stage.classList.toggle("nt-hold", !running) };
    },
    explain: ({ params }, reveal) => {
      const { stats } = measure(params);
      if (!reveal) {
        if (!unlocked) {
          return { title: "下一个词会是什么？", body: `<p>前文：<b>${escapeHtml(params.prompt)}</b> ___</p><p>AI 对这一空有多确定？先在“探究”里写下预测并锁定，光柱和概率才会出现。</p>` };
        }
        return {
          title: "实测数据 · 第 1 步",
          body: `<p>第一名 ${tok(stats.top.token)} ${percent(stats.p1)}；第二名 ${stats.second ? `${tok(stats.second.token)} ${percent(stats.second.p)}` : "—"}；前 8 名合计 ${percent(stats.covered)}。</p><p>先多比较几句、把数据记下来——结论等证据有效后再说。</p>`,
        };
      }
      const first = params.steps[0];
      const judged = verdict(stats);
      return {
        title: `下一个词：${tok(stats.top.token)} ${percent(stats.p1)}`,
        body: `<p>其次：${first.slice(1, 4).map((c) => `${tok(c.token)} ${percent(c.p)}`).join("，")}</p>
          <p>完整续写：<b>${escapeHtml(params.prompt)}${escapeHtml(params.completion.replace(/\n/g, " "))}</b></p>
          <p class="${judged.ok ? "lang-ok" : "lang-warn"}" data-certainty="${certainty(stats)}">${judged.text}</p>`,
      };
    },
    question: "“学生最重要的能力是”——模型自己给出的第一名是“提问”，却只有一成把握。这个概率能说明提问最重要吗？用数据回答：结论、证据、推理。",
    disclaimer: `概率来自本机 ${data.model}（离线、贪心解码），课前预生成，原模型已不在本机、无法重算；每一步只保存前 8 个候选（保留 4 位小数），熵与温度都只在这 8 个里重新归一，是近似。`,
    fallbackVideo: "media/next-token-demo.mp4",
    rows: 2,
    inquiry: {
      design: nextTokenLesson,
      holdUntilPredicted: true,
      columns: (task) => task.id === "temperature"
        ? [{ key: "prompt", label: "前文" }, { key: "T", label: "T" }, { key: "top", label: "第一名" }, { key: "q1", label: "第一名(归一)" }, { key: "hotEntropy", label: "熵(比特)" }]
        : task.id === "importance"
          ? [{ key: "prompt", label: "前文" }, { key: "top", label: "第一名" }, { key: "p1", label: "p1" }, { key: "covered", label: "前8合计" }, { key: "others", label: "其后候选" }]
          : [{ key: "prompt", label: "前文" }, { key: "top", label: "第一名" }, { key: "p1", label: "p1" }, { key: "margin", label: "差距(点)" }, ...(senior() ? [{ key: "entropy", label: "熵(比特)" }] : [])],
      capture: ({ params }) => capture(params),
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refreshData(); },
    },
  });
}
