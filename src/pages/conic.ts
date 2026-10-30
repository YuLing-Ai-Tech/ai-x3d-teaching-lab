import { caseManifests } from "../data/manifests";
import { conicLesson } from "../content/lessons/conic";
import { conicLabels, degenerateLabels, isNearCritical, measurePoint, type ConicInput, type ConicSection } from "../domain/conic";
import { mountConic, type ConicView } from "../scenes/conic";
import { drawPlaneView, numericEquation } from "../ui/conicPlaneView";
import { mountInquiry, type EvidenceRow } from "../ui/inquiry";
import { mountTeacherNotes } from "../ui/teacherNotes";
import { shell } from "../ui/shell";
import type { InquiryTask, SchoolStage } from "../types";
import "../styles/inquiry.css";

// 圆锥曲线实验台：三维截线（真实相交）+ 摊平的直角坐标视图 + 探究面板（预测 → 操作 → 证据 → 解释 → 评价）。
// 键盘：← → 微调 β 1°；R 记录证据（在“证据”阶段）；T 教师提示。

const STAGE_KEY = "ai3d-stage:conic";
const fmt = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : "∞");

const COLUMNS: Record<string, Array<{ key: string; label: string }>> = {
  spectrum: [{ key: "beta", label: "β" }, { key: "kind", label: "类型" }, { key: "closed", label: "闭合" }, { key: "e", label: "e" }],
  critical: [{ key: "alpha", label: "α" }, { key: "beta", label: "β" }, { key: "kind", label: "类型" }, { key: "e", label: "e" }],
  scale: [{ key: "beta", label: "β" }, { key: "h", label: "h" }, { key: "a", label: "a" }, { key: "b", label: "b" }, { key: "e", label: "e" }],
  focus: [{ key: "pf1", label: "|PF₁|" }, { key: "pf2", label: "|PF₂|" }, { key: "invariant", label: "和/差" }, { key: "twoA", label: "2a" }],
  directrix: [{ key: "kind", label: "类型" }, { key: "ratio", label: "|PF|/d" }, { key: "e", label: "e" }],
};

function markup(stage: SchoolStage): string {
  const manifest = caseManifests[1];
  return shell(`
    <section class="lab conic-lab" style="--accent:#57d8ff" data-school="${stage}">
      <div class="stage" id="stage" aria-label="圆锥截线三维实验台">
        <div class="stage-overlay">
          <div class="stage-title">
            <span class="badge">数学 · 圆锥曲线</span>
            <h1>圆锥曲线切出来</h1>
            <p>同一个圆锥，切面一转，椭圆、抛物线、双曲线依次出现——决定它们的只有一个角度关系。</p>
          </div>
          <div class="stage-caption" id="stage-caption" aria-live="polite"></div>
        </div>
        <figure class="lx-inset" aria-label="切面摊平后的直角坐标视图">
          <figcaption><span>摊平看 · 直角坐标</span><b id="cv-equation"></b></figcaption>
          <canvas id="cv-canvas"></canvas>
        </figure>
        <div class="lx-keys">← → 微调 β · 拖动旋转 · R 记录证据 · T 教师提示</div>
      </div>
      <aside class="control-panel lx-panel">
        <div class="lx-head">
          <div class="lx-school" role="group" aria-label="学段">
            <button data-school="初中" aria-pressed="${stage === "初中"}">初中</button><button data-school="高中" aria-pressed="${stage === "高中"}">高中</button>
          </div>
          <button id="lx-teacher" class="lx-teacher" aria-expanded="false">教师提示</button>
        </div>
        <section class="lx-controls">
          <label for="cv-beta">切面与轴的夹角 β <output id="cv-beta-out"></output></label>
          <input id="cv-beta" type="range" min="0" max="90" step="0.5" value="62">
          <label for="cv-h">切面位置 h（到顶点的距离） <output id="cv-h-out"></output></label>
          <input id="cv-h" type="range" min="0" max="4" step="0.1" value="2">
          <div class="lx-senior">
            <label for="cv-alpha">圆锥半顶角 α <output id="cv-alpha-out"></output></label>
            <input id="cv-alpha" type="range" min="15" max="45" step="1" value="30">
          </div>
          <div class="lx-presets" role="group" aria-label="快捷切面">
            <button data-preset="flat">水平切</button><button data-preset="critical">贴合母线</button><button data-preset="steep">竖直切</button><button data-preset="apex">过顶点</button>
          </div>
          <div class="lx-toggles lx-senior" role="group" aria-label="显示">
            <button data-toggle="spheres" aria-pressed="false">Dandelin 双球</button><button data-toggle="foci" aria-pressed="false">焦点与准线</button><button data-toggle="point" aria-pressed="false">动点 P</button>
          </div>
          <div class="cv-point lx-senior" hidden>
            <label for="cv-u">动点 P 的位置</label>
            <input id="cv-u" type="range" min="0" max="0.999" step="0.001" value="0.18">
          </div>
          <button id="cv-look" class="cv-look" aria-pressed="false">正对切面看真实形状</button>
        </section>
        <div class="readout lx-readout" id="lx-readout"></div>
        <section class="inquiry" id="cv-inquiry" aria-label="探究任务"></section>
        <a class="button-link fallback-link" href="./${manifest.fallbackVideo}" target="_blank">播放备用录像</a>
        <p class="source-note">教学几何模型：截线由平面与双圆锥的方程联立求得；单位为场景单位。课标引文为要点摘录，使用前请核对原文。</p>
      </aside>
    </section>
  `);
}

export function renderConic(): () => void {
  let school: SchoolStage = "高中";
  try { if (localStorage.getItem(STAGE_KEY) === "初中") school = "初中"; } catch { /* 默认高中 */ }
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = markup(school);
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const lab = $(".conic-lab");
  const scene = mountConic($("#stage"));
  const beta = $<HTMLInputElement>("#cv-beta");
  const h = $<HTMLInputElement>("#cv-h");
  const alpha = $<HTMLInputElement>("#cv-alpha");
  const u = $<HTMLInputElement>("#cv-u");
  const canvas = $<HTMLCanvasElement>("#cv-canvas");
  const view: ConicView = { spheres: false, foci: false, point: false, u: Number(u.value) };
  let section: ConicSection;
  let looking = false;

  const input = (): ConicInput => ({ alpha: school === "初中" ? 30 : Number(alpha.value), beta: Number(beta.value), h: Number(h.value) });
  const senior = () => school === "高中";

  const update = () => {
    const current = input();
    view.u = Number(u.value);
    const shown = { ...view, spheres: senior() && view.spheres, foci: senior() && view.foci, point: senior() && view.point };
    section = scene.update(current, shown);
    $("#cv-beta-out").textContent = `${fmt(current.beta, 1)}°`;
    $("#cv-h-out").textContent = fmt(current.h, 1);
    $("#cv-alpha-out").textContent = `${current.alpha}°`;
    const label = conicLabels[section.kind];
    const near = !section.degenerate && section.kind !== "parabola" && isNearCritical(current.alpha, current.beta);
    const relation = section.kind === "parabola" ? "β = α" : current.beta > current.alpha ? "β > α" : "β < α";
    const title = section.degenerate ? "退化情形" : label.title;
    const measure = shown.point ? measurePoint(section, view.u) : undefined;
    $("#lx-readout").innerHTML = `
      <small>${relation}${near ? " · 接近临界" : ""}</small><strong>${title}</strong>
      ${section.degenerate ? "" : `<div class="cv-emeter" aria-label="离心率刻度"><span class="z-ellipse">椭圆 0&lt;e&lt;1</span><span class="z-parabola">e=1</span><span class="z-hyperbola">双曲线 e&gt;1</span><i style="left:${Math.min(100, (section.e / 2) * 100)}%"></i></div>`}
      ${section.degenerate ? `<p>${degenerateLabels[section.degenerate]}</p>` : `
        <dl class="lx-metrics">
          <div><dt>离心率 e</dt><dd>${fmt(section.e, 3)}</dd></div>
          ${senior() && section.kind !== "parabola" ? `<div><dt>a</dt><dd>${fmt(section.a)}</dd></div><div><dt>b</dt><dd>${fmt(section.b)}</dd></div><div><dt>c</dt><dd>${fmt(section.c)}</dd></div>` : ""}
          ${senior() && section.kind === "parabola" ? `<div><dt>p</dt><dd>${fmt(section.p)}</dd></div>` : ""}
          ${measure ? `<div><dt>${section.kind === "parabola" ? "|PF|" : "|PF₁|"}</dt><dd>${fmt(measure.toFoci[0])}</dd></div>${measure.toFoci[1] !== undefined ? `<div><dt>|PF₂|</dt><dd>${fmt(measure.toFoci[1])}</dd></div>` : ""}<div><dt>${section.kind === "hyperbola" ? "差" : section.kind === "parabola" ? "|PF| − d" : "和"}</dt><dd>${fmt(measure.invariant)}</dd></div><div><dt>|PF|/d</dt><dd>${fmt(measure.ratio, 3)}</dd></div>` : ""}
        </dl>`}
      <p>${section.degenerate ? "" : senior() ? `${label.definition}。` : section.kind === "hyperbola" ? "切面穿过上下两个锥面：两支，不闭合。" : section.kind === "parabola" ? "切面与一条母线平行：打开，不闭合。" : "只穿过一个锥面：闭合。"}</p>`;
    $("#stage-caption").innerHTML = `<strong>${title}${section.degenerate ? "" : ` · e = ${fmt(section.e, 2)}`}</strong><span>${section.degenerate ? degenerateLabels[section.degenerate] : label.insight}</span>`;
    $("#cv-equation").textContent = senior() ? numericEquation(section) : "";
    drawPlaneView(canvas, section, { foci: shown.foci, point: shown.point, u: view.u, height: 7.2 });
    if (looking) scene.look("plane");
  };

  const capture = (): EvidenceRow => {
    const current = input();
    const measure = measurePoint(section, view.u);
    return {
      alpha: `${current.alpha}°`, beta: `${fmt(current.beta, 1)}°`, h: fmt(current.h, 1),
      kind: section.degenerate ? "退化" : conicLabels[section.kind].title,
      closed: section.kind === "ellipse" || section.kind === "circle" ? "是" : "否",
      e: fmt(section.e, 3), a: fmt(section.a), b: fmt(section.b),
      pf1: measure ? fmt(measure.toFoci[0]) : "—", pf2: measure?.toFoci[1] !== undefined ? fmt(measure.toFoci[1]) : "—",
      invariant: measure ? fmt(measure.invariant) : "—", twoA: fmt(2 * section.a),
      ratio: measure ? fmt(measure.ratio, 3) : "—",
    };
  };

  const setToggle = (name: keyof Pick<ConicView, "spheres" | "foci" | "point">, value: boolean) => {
    view[name] = value;
    document.querySelector(`[data-toggle="${name}"]`)?.setAttribute("aria-pressed", String(value));
    if (name === "point") (document.querySelector(".cv-point") as HTMLElement).hidden = !value;
  };

  // 任务预设只在“进入操作阶段”时执行一次；之后学生关掉的开关不会被每次重绘重新打开
  let lastStep = "";
  const onTask = (task: InquiryTask, phase: string) => {
    const step = `${task.id}:${phase}`;
    const entering = phase === "operate" && step !== lastStep;
    lastStep = step;
    if (!entering) return;
    if (task.id === "focus") { setToggle("spheres", true); setToggle("foci", true); setToggle("point", true); }
    if (task.id === "directrix") { setToggle("foci", true); setToggle("point", true); }
    update();
  };

  const inquiry = mountInquiry($("#cv-inquiry"), {
    design: conicLesson, stage: school,
    columns: (task) => COLUMNS[task.id] ?? COLUMNS.spectrum,
    capture, onChange: onTask,
  });
  const disposeNotes = mountTeacherNotes($<HTMLButtonElement>("#lx-teacher"), conicLesson, () => school);

  const setSchool = (next: SchoolStage) => {
    school = next;
    lab.dataset.school = next;
    try { localStorage.setItem(STAGE_KEY, next); } catch { /* 不保存也能用 */ }
    document.querySelectorAll<HTMLButtonElement>("[data-school]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.school === next)));
    inquiry.setStage(next);
    update();
  };

  const presets: Record<string, () => void> = {
    flat: () => { beta.value = "90"; },
    critical: () => { beta.value = String(input().alpha); if (Number(h.value) === 0) h.value = "2"; },
    steep: () => { beta.value = "8"; },
    apex: () => { h.value = "0"; },
  };

  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.school) setSchool(button.dataset.school as SchoolStage);
    else if (button.dataset.preset) { presets[button.dataset.preset]?.(); update(); }
    else if (button.dataset.toggle) {
      const name = button.dataset.toggle as "spheres" | "foci" | "point";
      setToggle(name, !view[name]);
      update();
    } else if (button.id === "cv-look") {
      looking = !looking;
      button.setAttribute("aria-pressed", String(looking));
      button.textContent = looking ? "回到自由视角" : "正对切面看真实形状";
      scene.look(looking ? "plane" : "free");
    }
  };
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "range")) return;
    if (document.querySelector(".tn-dialog:not([hidden])")) return;
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !(target instanceof HTMLInputElement)) {
      event.preventDefault();
      beta.value = String(Math.max(0, Math.min(90, Number(beta.value) + (event.key === "ArrowRight" ? 1 : -1))));
      update();
    } else if (event.key === "r" || event.key === "R") inquiry.capture();
  };
  const onResize = () => update();

  lab.addEventListener("click", onClick);
  [beta, h, alpha, u].forEach((element) => element.addEventListener("input", update));
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  update();

  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    inquiry.dispose();
    disposeNotes();
    scene.dispose();
  };
}
