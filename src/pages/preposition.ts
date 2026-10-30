import { prepositionLesson } from "../content/lessons/preposition";
import { NOUNS, RELATIONS, frontBack, judge, parseSentence, type Judgement, type SpatialMeasure, type SpatialSentence } from "../domain/preposition";
import { mountPreposition, type PrepositionScene } from "../scenes/preposition";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";

const QUICK: Array<[string, string]> = [
  ["on", "The cat is on the table."], ["under", "The cat is under the table."], ["in", "The ball is in the box."],
  ["behind", "The ball is behind the box."], ["through 隧道", "The car goes through the tunnel."], ["over", "The ball jumps over the box."],
];

/** 观察者在参照物的哪一侧：用镜头方位角（相对 +z 前方） */
const viewLabel = (measure: SpatialMeasure) => {
  const angle = Math.abs(Math.atan2(measure.viewer[0], measure.viewer[2]) * 180 / Math.PI);
  return angle < 50 ? "前方" : angle > 130 ? "后方" : "侧面";
};

const checksHtml = (judgement: Judgement) => judgement.checks.map((check) => `<li class="${check.pass ? "done" : "miss"}">${check.label}</li>`).join("");

// 英语 · 介词即空间：介词是一个空间谓词；英文和中文用不同的语序表达同一个空间关系。

export function renderPreposition(): Promise<() => void> {
  let scene: PrepositionScene | undefined;
  let unlocked = false;
  let apiRef: LangLabApi<SpatialSentence> | undefined;
  const evaluate = () => {
    const parsed = apiRef?.current();
    const measure = scene?.measure();
    if (!parsed?.ok || !measure) return undefined;
    const sentence = parsed.params;
    const both = sentence.relation === "behind" || sentence.relation === "in front of" ? frontBack(sentence.relation, measure) : undefined;
    return { sentence, measure, judgement: judge(sentence, measure), both };
  };
  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#prep-judge");
    if (!box) return;
    if (!unlocked) { box.innerHTML = `<small>判定</small><p>先在下面锁定预测，判定结果才会出现。</p>`; box.dataset.ready = "false"; return; }
    const result = evaluate();
    if (!result) { box.innerHTML = `<small>判定</small><p>这句话还没有读懂，无法判定。</p>`; return; }
    box.dataset.ready = "true";
    box.dataset.holds = String(result.judgement.holds);
    box.innerHTML = `<small>判定 · ${result.sentence.relation} · 视角：${viewLabel(result.measure)}</small><strong>${result.judgement.holds ? "成立" : "不成立"}</strong>
      ${result.both ? `<p>以观察者为准：<b>${result.both.observer.holds ? "成立" : "不成立"}</b>；以参照物自身前后为准：<b>${result.both.intrinsic.holds ? "成立" : "不成立"}</b></p>` : ""}
      <ul class="iq-check">${checksHtml(result.both ? result.both.observer : result.judgement)}${result.both ? checksHtml(result.both.intrinsic) : ""}</ul>`;
  };
  const controls = (api: LangLabApi<SpatialSentence>) => {
    apiRef = api;
    return {
      html: `
        <div class="prep-controls">
          <div class="lx-segment" role="group" aria-label="句子">${QUICK.map(([label], index) => `<button data-prep="${index}">${label}</button>`).join("")}</div>
          <button id="prep-rejudge" class="mol-pin">按当前视角重新判定</button>
          <div class="readout gv-data" id="prep-judge" aria-live="polite"></div>
        </div>`,
      bind: (root: HTMLElement) => {
        const onClick = (event: Event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
          if (!button) return;
          if (button.dataset.prep) api.setText(QUICK[Number(button.dataset.prep)][1]);
          if (button.id === "prep-rejudge") refresh();
        };
        root.addEventListener("click", onClick);
        return () => root.removeEventListener("click", onClick);
      },
      refresh,
    };
  };
  return renderLangLab<SpatialSentence>({
    id: "preposition",
    subject: "英语",
    title: "介词即空间",
    subtitle: "on、under、through 不是要背的单词，而是空间逻辑。写一句英文，世界按它摆好；换一个介词，关系立刻改变。",
    accent: "#57d8ff",
    language: "English · 空间描述",
    roles: {
      subject: { label: "主体", color: "#ffb347" },
      relation: { label: "介词（空间关系）", color: "#ffd38a" },
      landmark: { label: "参照物", color: "#57d8ff" },
      verb: { label: "动词", color: "#c58bff" },
    },
    variants: [
      { label: "on", text: "The cat is on the table." },
      { label: "under", text: "The cat is under the table." },
      { label: "in", text: "The ball is in the box." },
      { label: "above", text: "The bird is above the tree." },
      { label: "between", text: "The cat is between the box and the tree." },
      { label: "behind", text: "The ball is behind the box." },
      { label: "through 隧道", text: "The car goes through the tunnel." },
      { label: "through 窗户", text: "The bird flies through the window." },
      { label: "across", text: "The cat walks across the river." },
      { label: "around", text: "The bird flies around the house." },
      { label: "over", text: "The ball jumps over the box." },
      { label: "into", text: "The ball rolls into the box." },
    ],
    parse: (text) => {
      const { sentence, tokens, message } = parseSentence(text);
      return sentence
        ? { ok: true, params: sentence, tokens }
        : { ok: false, params: { subject: "cat", relation: "on", landmarks: ["table"] }, tokens, message };
    },
    mount: (stage) => { scene = mountPreposition(stage); return scene; },
    explain: ({ params }, reveal) => {
      const info = RELATIONS[params.relation];
      const [b, c] = params.landmarks.map((noun) => NOUNS[noun]);
      if (!reveal) return { title: `${params.relation} = ${info.motion ? "一条路径" : "一个位置"}`, body: `<p>${info.zh(NOUNS[params.subject], b, c)}——它在 3D 里成立吗？先预测，再看判定。</p>` };
      return {
        title: `${params.relation} = ${info.motion ? "一条路径" : "一个位置"}`,
        body: `<dl class="four-lang">
          <dt>中文</dt><dd>${info.zh(NOUNS[params.subject], b, c)}</dd>
          <dt>逻辑</dt><dd class="math">${info.logic}</dd>
        </dl><p class="lang-ok">英文：介词在前（${params.relation} the ${params.landmarks[0]}）；${info.motion ? `中文把路径写进动词（${info.zh(NOUNS[params.subject], b, c)}）` : `中文把参照物包在中间（${info.zh("", b, c)}）`}——同一个空间，两种语序。</p>`,
      };
    },
    question: "behind 和 in front of 换个座位就会反过来——为什么？语言里藏着一个“观察者”。",
    disclaimer: "离线解析：认识 13 个名词与 15 个常用空间介词，用于展示“语法 → 空间逻辑”的对应。",
    fallbackVideo: "media/preposition-demo.mp4",
    rows: 1,
    inquiry: {
      design: prepositionLesson,
      columns: (task) => task.id === "frame"
        ? [{ key: "relation", label: "介词" }, { key: "view", label: "视角" }, { key: "observer", label: "以观察者" }, { key: "intrinsic", label: "以参照物" }]
        : [{ key: "relation", label: "介词" }, { key: "holds", label: "判定" }, { key: "checks", label: "满足条件" }],
      capture: () => {
        const result = evaluate();
        if (!result) return { relation: "—", holds: "无法判定", checks: "—", view: "—", observer: "—", intrinsic: "—" };
        const passed = result.judgement.checks.filter((check) => check.pass).length;
        return {
          relation: result.sentence.relation, holds: result.judgement.holds ? "成立" : "不成立",
          checks: `${passed}/${result.judgement.checks.length}`, view: viewLabel(result.measure),
          observer: result.both ? (result.both.observer.holds ? "成立" : "不成立") : "—",
          intrinsic: result.both ? (result.both.intrinsic.holds ? "成立" : "不成立") : "—",
        };
      },
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refresh(); },
    },
  });
}
