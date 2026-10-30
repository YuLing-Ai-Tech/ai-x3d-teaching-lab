import { shell } from "./shell";
import { mountInquiry, type EvidenceRow, type InquiryPhase } from "./inquiry";
import { mountTeacherNotes } from "./teacherNotes";
import type { InquiryTask, LessonDesign, SchoolStage } from "../types";

// “语言 ↔ 世界”统一页面：左边是一段可编辑的语言，右边是它描述的 3D 世界。
// 每个学科案例只需提供：parse（读懂语言）、mount（造出世界）、explain（讲给学生听）。
// 翻页笔 / ← →：切换预设；悬停词语标签：在 3D 中高亮它对应的东西。
// 可选的探究层（spec.inquiry）：左栏多出“语言 / 探究”两个页签；预测锁定前模型可暂停、讲解卡不给结论。
// 不传 inquiry 的页面与原来完全一样。

export interface LangToken {
  text: string;
  /** 词语在世界里扮演的角色；没有角色的词是普通文字 */
  role?: string;
}

export interface LangParse<P> {
  params: P;
  tokens: LangToken[];
  ok: boolean;
  message?: string;
}

export interface LangVariant {
  label: string;
  text: string;
}

export interface LangScene<P> {
  update: (params: P) => void;
  highlight: (role: string | null) => void;
  dispose: () => void;
  /** 可选：预测锁定前暂停模型 */
  setRunning?: (running: boolean) => void;
}

/** 探究层给页面的控制柄 */
export interface LangLabApi<P> {
  setText: (text: string) => void;
  choose: (index: number) => void;
  current: () => LangParse<P>;
  stage: () => SchoolStage;
}

export interface LangInquiry<P> {
  design: LessonDesign;
  columns: (task: InquiryTask) => Array<{ key: string; label: string }>;
  capture: (parsed: LangParse<P>) => EvidenceRow;
  /** 预测锁定前暂停模型（scene.setRunning） */
  holdUntilPredicted?: boolean;
  /** 探究页签里额外的控件（HTML）与绑定；返回卸载函数 */
  controls?: (api: LangLabApi<P>) => { html: string; bind: (root: HTMLElement) => (() => void) | void; refresh?: () => void };
  onChange?: (task: InquiryTask, phase: InquiryPhase, api: LangLabApi<P>) => void;
  /** 切换“语言 / 探究”页签时调用：页面把只属于探究的画面设置（高亮、参数）收起或恢复 */
  onTab?: (tab: "language" | "inquiry", api: LangLabApi<P>) => void;
}

export interface LangRole {
  label: string;
  color: string;
}

export interface LangLabSpec<P> {
  id: string;
  subject: string;
  title: string;
  subtitle: string;
  accent: string;
  /** 左栏标题：这段文字用的是哪种“语言” */
  language: string;
  roles: Record<string, LangRole>;
  variants: LangVariant[];
  parse: (text: string) => LangParse<P>;
  mount: (stage: HTMLElement) => LangScene<P> | Promise<LangScene<P>>;
  /** 右下角讲解卡；返回 HTML。reveal = false 时（有探究层且证据尚未有效）不要给出结论，只给实测数据 */
  explain: (parsed: LangParse<P>, reveal: boolean) => { title: string; body: string };
  question: string;
  disclaimer: string;
  rows?: number;
  fallbackVideo?: string;
  inquiry?: LangInquiry<P>;
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

export async function renderLangLab<P>(spec: LangLabSpec<P>): Promise<() => void> {
  const legend = Object.entries(spec.roles)
    .map(([role, value]) => `<li data-role="${role}" style="--c:${value.color}">${value.label}</li>`).join("");
  const inquiry = spec.inquiry;
  const stageKey = `ai3d-stage:${spec.id}`;
  let school: SchoolStage = "高中";
  try { if (localStorage.getItem(stageKey) === "初中") school = "初中"; } catch { /* 默认高中 */ }
  const language = `
        <label class="lang-label" for="lang-input"><span>语言</span>${spec.language}</label>
        <textarea id="lang-input" rows="${spec.rows ?? 2}" spellcheck="false" autocomplete="off"></textarea>
        <div class="lang-tokens" id="lang-tokens" aria-label="词语与世界的对应"></div>
        <ul class="lang-legend">${legend}</ul>
        <div class="lang-variants" role="group" aria-label="预设">
          ${spec.variants.map((variant, index) => `<button data-variant="${index}">${variant.label}</button>`).join("")}
        </div>`;
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="langlab${inquiry ? " has-inquiry" : ""}" style="--accent:${spec.accent}" data-case="${spec.id}" data-school="${school}">
      <aside class="lang-panel">
        <span class="badge">${spec.subject}</span>
        <h1>${spec.title}</h1>
        <p class="lang-subtitle">${spec.subtitle}</p>
        ${inquiry ? `
        <div class="lang-tabs" role="tablist" aria-label="语言与探究">
          <button role="tab" data-lang-tab="language" aria-selected="false">语言</button><button role="tab" data-lang-tab="inquiry" aria-selected="true">探究</button>
          <span class="lang-tabs-tools"><span class="lx-school" role="group" aria-label="学段"><button data-school="初中" aria-pressed="${school === "初中"}">初中</button><button data-school="高中" aria-pressed="${school === "高中"}">高中</button></span><button id="lang-teacher" class="lx-teacher" aria-expanded="false">教师提示</button></span>
        </div>
        <div class="lang-tab" data-tab="language" hidden>${language}</div>
        <div class="lang-tab" data-tab="inquiry"><div class="lang-inquiry-controls" id="lang-inquiry-controls"></div><section class="inquiry" id="lang-inquiry" aria-label="探究任务"></section></div>` : language}
        <div class="readout lang-question"><small>课堂问题</small><p>${spec.question}</p></div>
        <p class="source-note">${spec.disclaimer}${spec.fallbackVideo ? ` · <a href="./${spec.fallbackVideo}" target="_blank" rel="noreferrer">播放备用录像</a>` : ""}</p>
      </aside>
      <div class="stage lang-stage" id="stage" aria-label="${spec.title}三维世界">
        <div class="lang-explain" id="lang-explain" aria-live="polite"></div>
        <div class="lang-hint">${inquiry ? "先在“探究”里锁定预测 · 拖动旋转 · 悬停词语看对应" : "翻页笔 / ← → 切换预设 · 拖动旋转 · 悬停词语看对应"}</div>
      </div>
    </section>
  `);

  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const input = $<HTMLTextAreaElement>("#lang-input");
  const tokensBox = $("#lang-tokens");
  const explainBox = $("#lang-explain");
  const stage = $("#stage");
  const variantButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-variant]")];
  const scene = await spec.mount(stage);
  let variant = 0;
  let timer = 0;
  let lastParsed: LangParse<P> | undefined;
  let inquiryPhase: InquiryPhase = "predict";
  // 预测门槛只管“探究”页签：在“语言”页签里，画面持续运动、讲解卡照常给结论，和没有探究层时完全一样。
  let activeTab: "language" | "inquiry" = inquiry ? "inquiry" : "language";
  const reveal = () => !inquiry || activeTab === "language" || inquiryPhase === "explain" || inquiryPhase === "evaluate";
  const syncRunning = () => {
    if (inquiry?.holdUntilPredicted) scene.setRunning?.(activeTab === "language" || inquiryPhase !== "predict");
  };
  let afterApply: (() => void) | undefined;
  /** 只重画讲解卡：阶段、页签变化时用它，不重新加载模型 */
  const refreshExplain = () => {
    const parsed = lastParsed;
    if (!parsed) return;
    const explanation = spec.explain(parsed, reveal());
    explainBox.innerHTML = `<strong>${parsed.ok ? explanation.title : "这句话我还读不懂"}</strong><div>${parsed.ok ? explanation.body : escapeHtml(parsed.message ?? "试试换一种说法，或点下面的预设。")}</div>`;
  };

  const apply = () => {
    const parsed = spec.parse(input.value);
    lastParsed = parsed;
    tokensBox.innerHTML = parsed.tokens.map((token) => {
      const role = token.role ? spec.roles[token.role] : undefined;
      return role
        ? `<span class="lang-token" data-role="${token.role}" style="--c:${role.color}" title="${role.label}">${escapeHtml(token.text)}</span>`
        : `<span class="lang-plain">${escapeHtml(token.text)}</span>`;
    }).join("");
    stage.dataset.parse = parsed.ok ? "ok" : "error";
    if (parsed.ok) scene.update(parsed.params);
    refreshExplain();
    variantButtons.forEach((button, index) => button.classList.toggle("active", spec.variants[index].text === input.value));
    afterApply?.();
  };
  const choose = (index: number) => {
    variant = (index + spec.variants.length) % spec.variants.length;
    input.value = spec.variants[variant].text;
    apply();
  };
  const onHover = (event: Event) => {
    const role = (event.target as HTMLElement).closest<HTMLElement>("[data-role]")?.dataset.role ?? null;
    scene.highlight(event.type === "mouseover" ? role : null);
  };
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target === input || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (document.querySelector(".tn-dialog:not([hidden])")) return;
    if (activeTab !== "language") return;  // 翻页笔切预设只属于“语言”页签；探究时不能偷偷换掉正在研究的对象
    if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); choose(variant + 1); }
    if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); choose(variant - 1); }
  };

  input.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(apply, 160); });
  variantButtons.forEach((button, index) => button.addEventListener("click", () => choose(index)));
  for (const box of [tokensBox, document.querySelector<HTMLElement>(".lang-legend")!]) {
    box.addEventListener("mouseover", onHover);
    box.addEventListener("mouseout", onHover);
  }
  window.addEventListener("keydown", onKey);
  choose(0);

  const disposers: Array<() => void> = [];
  if (inquiry) {
    const api: LangLabApi<P> = {
      setText: (text) => { input.value = text; apply(); },
      choose,
      current: () => lastParsed ?? spec.parse(input.value),
      stage: () => school,
    };
    const extra = inquiry.controls?.(api);
    afterApply = extra?.refresh;
    const controlsHost = $("#lang-inquiry-controls");
    if (extra) {
      controlsHost.innerHTML = extra.html;
      const unbind = extra.bind(controlsHost);
      if (unbind) disposers.push(unbind);
    }
    const panel = mountInquiry($("#lang-inquiry"), {
      design: inquiry.design, stage: school, columns: inquiry.columns,
      capture: () => inquiry.capture(api.current()),
      onChange: (task, phase) => {
        const changed = phase !== inquiryPhase;
        inquiryPhase = phase;
        syncRunning();
        inquiry.onChange?.(task, phase, api);
        if (changed) refreshExplain();  // 记录证据等面板重绘不应重置模型
        extra?.refresh?.();
      },
    });
    disposers.push(() => panel.dispose());
    inquiry.onTab?.(activeTab, api);
    disposers.push(mountTeacherNotes($<HTMLButtonElement>("#lang-teacher"), inquiry.design, () => school));
    const section = document.querySelector<HTMLElement>(".langlab")!;
    const onPanelClick = (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-lang-tab], button[data-school]");
      if (!button) return;
      if (button.dataset.langTab) {
        document.querySelectorAll<HTMLButtonElement>("[data-lang-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
        document.querySelectorAll<HTMLElement>(".lang-tab").forEach((tab) => { tab.hidden = tab.dataset.tab !== button.dataset.langTab; });
        activeTab = button.dataset.langTab === "language" ? "language" : "inquiry";
        document.querySelector<HTMLElement>(".lang-hint")!.textContent = activeTab === "language"
          ? "翻页笔 / ← → 切换预设 · 拖动旋转 · 悬停词语看对应"
          : "先在“探究”里锁定预测 · 拖动旋转 · 悬停词语看对应";
        syncRunning();
        inquiry.onTab?.(activeTab, api);
        refreshExplain();
      } else if (button.dataset.school) {
        school = button.dataset.school as SchoolStage;
        section.dataset.school = school;
        try { localStorage.setItem(stageKey, school); } catch { /* 不保存也能用 */ }
        document.querySelectorAll<HTMLButtonElement>(".lang-tabs [data-school]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        panel.setStage(school);
        extra?.refresh?.();
      }
    };
    section.addEventListener("click", onPanelClick);
    disposers.push(() => section.removeEventListener("click", onPanelClick));
  }
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("keydown", onKey);
    disposers.forEach((dispose) => dispose());
    scene.dispose();
  };
}
