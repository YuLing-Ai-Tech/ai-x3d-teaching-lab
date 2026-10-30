import { caseManifests } from "../data/manifests";
import { membraneLesson } from "../content/lessons/membrane";
import { clampMembraneSettings, createMembraneSim, transportDirection, type MembraneSettings, type TransportMode } from "../domain/membrane";
import { mountMembrane } from "../scenes/membrane";
import { mountInquiry, type EvidenceRow } from "../ui/inquiry";
import { mountTeacherNotes } from "../ui/teacherNotes";
import { shell } from "../ui/shell";
import type { InquiryTask, SchoolStage } from "../types";
import "../styles/inquiry.css";

// 细胞膜运输实验舱：随机穿膜模型 + 双向计数 + 浓度曲线 + 探究面板。
// 键盘：空格 暂停/继续；R 记录证据（在“证据”阶段）；T 教师提示。

const STAGE_KEY = "ai3d-stage:membrane";
const MODE_LABEL: Record<TransportMode, string> = { diffusion: "自由扩散", facilitated: "协助扩散", active: "主动运输" };
const DIRECTION_LABEL = { "outside-to-inside": "净移动：膜外 → 膜内", "inside-to-outside": "净移动：膜内 → 膜外", balanced: "两侧相等：动态平衡", stopped: "停止：没有可用的运输途径" };

const COLUMNS: Record<string, Array<{ key: string; label: string }>> = {
  direction: [{ key: "time", label: "时间" }, { key: "outside", label: "膜外" }, { key: "inside", label: "膜内" }, { key: "inward", label: "外→内" }, { key: "outward", label: "内→外" }],
  equilibrium: [{ key: "time", label: "时间" }, { key: "outside", label: "膜外" }, { key: "inside", label: "膜内" }, { key: "inward", label: "外→内" }, { key: "outward", label: "内→外" }, { key: "net", label: "净速率" }],
  saturation: [{ key: "start", label: "初始膜外" }, { key: "channels", label: "载体" }, { key: "net", label: "净速率" }],
  energy: [{ key: "atp", label: "ATP" }, { key: "outside", label: "膜外" }, { key: "inside", label: "膜内" }, { key: "inward", label: "外→内" }, { key: "atpUsed", label: "耗 ATP" }],
};

function markup(stage: SchoolStage): string {
  const manifest = caseManifests[2];
  return shell(`
    <section class="lab membrane-lab" style="--accent:#64f0a4" data-school="${stage}">
      <div class="stage" id="stage" aria-label="细胞膜运输三维实验舱">
        <div class="stage-overlay">
          <div class="stage-title">
            <span class="badge">生物 · 物质跨膜运输</span>
            <h1>细胞膜运输实验舱</h1>
            <p>每个粒子都在随机运动。数一数两个方向各有多少粒子穿过膜，答案就在数字里。</p>
          </div>
          <div class="stage-caption" id="stage-caption" aria-live="polite"></div>
        </div>
        <figure class="lx-inset" aria-label="浓度随时间变化">
          <figcaption><span>浓度—时间</span><b id="mb-clock">0 s</b></figcaption>
          <canvas id="mb-chart"></canvas>
        </figure>
        <div class="lx-keys">空格 暂停 · 拖动旋转 · R 记录证据 · T 教师提示</div>
      </div>
      <aside class="control-panel lx-panel">
        <div class="lx-head">
          <div class="lx-school" role="group" aria-label="学段">
            <button data-school="初中" aria-pressed="${stage === "初中"}">初中</button><button data-school="高中" aria-pressed="${stage === "高中"}">高中</button>
          </div>
          <button id="mb-teacher" class="lx-teacher" aria-expanded="false">教师提示</button>
        </div>
        <section class="lx-controls">
          <div class="lx-segment" role="group" aria-label="运输方式">
            <button data-mode="diffusion" aria-pressed="true">自由扩散</button><button data-mode="facilitated" class="lx-senior" aria-pressed="false">协助扩散</button><button data-mode="active" class="lx-senior" aria-pressed="false">主动运输</button>
          </div>
          <label for="mb-outside">膜外初始浓度 <output id="mb-outside-out"></output></label>
          <input id="mb-outside" type="range" min="0" max="100" value="80">
          <label for="mb-inside">膜内初始浓度 <output id="mb-inside-out"></output></label>
          <input id="mb-inside" type="range" min="0" max="100" value="20">
          <div class="lx-senior">
            <label for="mb-channels">通道 / 载体 / 泵数量 <output id="mb-channels-out"></output></label>
            <input id="mb-channels" type="range" min="0" max="8" value="4">
            <label class="lx-check"><input id="mb-atp" type="checkbox" checked> ATP 可用（主动运输的能量）</label>
          </div>
          <div class="lx-presets" role="group" aria-label="实验控制">
            <button id="mb-restart">重新开始</button><button id="mb-pause" aria-pressed="false">暂停</button>
            <button data-speed="1" aria-pressed="true">×1</button><button data-speed="4" aria-pressed="false">×4</button><button data-speed="10" aria-pressed="false">×10 快进</button>
          </div>
        </section>
        <div class="readout lx-readout" id="mb-readout"></div>
        <section class="inquiry" id="mb-inquiry" aria-label="探究任务"></section>
        <a class="button-link fallback-link" href="./${manifest.fallbackVideo}" target="_blank">播放备用录像</a>
        <p class="source-note">${manifest.disclaimer} 课标引文为要点摘录，使用前请核对原文。</p>
      </aside>
    </section>
  `);
}

function drawChart(canvas: HTMLCanvasElement, history: Array<{ t: number; outside: number; inside: number }>): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pad = { l: 30, r: 10, t: 10, b: 20 };
  const span = Math.max(30, history.length ? history[history.length - 1].t - history[0].t : 30);
  const t0 = history.length ? history[history.length - 1].t - span : 0;
  const X = (t: number) => pad.l + ((t - t0) / span) * (width - pad.l - pad.r);
  const Y = (c: number) => height - pad.b - (c / 100) * (height - pad.t - pad.b);
  ctx.strokeStyle = "rgba(170,200,215,.25)";
  ctx.fillStyle = "rgba(170,200,215,.6)";
  ctx.font = "10px 'SF Mono', ui-monospace, monospace";
  for (const c of [0, 50, 100]) { ctx.beginPath(); ctx.moveTo(pad.l, Y(c)); ctx.lineTo(width - pad.r, Y(c)); ctx.stroke(); ctx.fillText(String(c), 4, Y(c) + 3); }
  ctx.fillText(`${Math.round(span)} s`, width - 38, height - 6);
  for (const [key, color] of [["outside", "#6fe3ff"], ["inside", "#7dffb0"]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((point, index) => (index ? ctx.lineTo(X(point.t), Y(point[key])) : ctx.moveTo(X(point.t), Y(point[key]))));
    ctx.stroke();
  }
}

export function renderMembrane(): () => void {
  let school: SchoolStage = "高中";
  try { if (localStorage.getItem(STAGE_KEY) === "初中") school = "初中"; } catch { /* 默认高中 */ }
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = markup(school);
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const lab = $(".membrane-lab");
  const stageEl = $("#stage");
  const scene = mountMembrane(stageEl);
  const outside = $<HTMLInputElement>("#mb-outside");
  const inside = $<HTMLInputElement>("#mb-inside");
  const channels = $<HTMLInputElement>("#mb-channels");
  const atp = $<HTMLInputElement>("#mb-atp");
  const canvas = $<HTMLCanvasElement>("#mb-chart");
  let mode: TransportMode = "diffusion";
  let speed = 1;
  let paused = false;
  let startOutside = 80;
  const settings = (): MembraneSettings => clampMembraneSettings({ outside: Number(outside.value), inside: Number(inside.value), channels: Number(channels.value), atp: atp.checked });
  const sim = createMembraneSim(mode, settings());
  let history: Array<{ t: number; outside: number; inside: number }> = [];

  const restart = () => {
    startOutside = settings().outside;
    sim.reset(mode, settings());
    history = [{ t: 0, outside: sim.state.outside, inside: sim.state.inside }];
    scene.reset(sim.state);
    scene.setMode(mode, sim.state.channels, sim.state.atp);
    render();
  };

  const render = () => {
    const s = sim.state;
    $("#mb-outside-out").textContent = outside.value;
    $("#mb-inside-out").textContent = inside.value;
    $("#mb-channels-out").textContent = channels.value;
    const direction = transportDirection(mode, s.outside, s.inside, s.atp, s.channels);
    stageEl.dataset.direction = direction;
    const depleted = direction === "stopped" && mode === "active" && s.atp && s.channels > 0 && s.outside === 0;
    const headline = depleted ? "膜外粒子已全部泵入膜内" : mode === "active" && !s.atp ? "停止：没有 ATP，泵不工作" : DIRECTION_LABEL[direction];
    stageEl.dataset.mode = mode;
    $("#mb-readout").innerHTML = `
      <small>${MODE_LABEL[mode]}${mode === "active" ? (s.atp ? " · ATP 供能中" : " · 无 ATP") : ""}</small>
      <strong>${headline}</strong>
      <dl class="lx-metrics">
        <div><dt>膜外</dt><dd id="mb-out-now">${s.outside}</dd></div><div><dt>膜内</dt><dd id="mb-in-now">${s.inside}</dd></div>
        <div><dt>外→内</dt><dd id="mb-inward">${s.inward}</dd></div><div><dt>内→外</dt><dd id="mb-outward">${s.outward}</dd></div>
        <div><dt>净速率</dt><dd>${s.netRate.toFixed(2)}/s</dd></div>${mode === "active" ? `<div><dt>耗 ATP</dt><dd id="mb-atp-used">${s.atpUsed}</dd></div>` : ""}
      </dl>`;
    $("#stage-caption").innerHTML = `<strong>${MODE_LABEL[mode]} · 膜外 ${s.outside} / 膜内 ${s.inside}</strong><span>外→内 ${s.inward} 次，内→外 ${s.outward} 次${mode === "active" ? `，消耗 ATP ${s.atpUsed} 个` : ""}。</span>`;
    $("#mb-clock").textContent = `${Math.round(s.time)} s`;
    drawChart(canvas, history);
  };

  let accumulator = 0;
  let renderClock = 0;
  const tick = (now: number, previous: number) => {
    const dt = Math.min(0.1, (now - previous) / 1000);
    if (!paused) {
      accumulator += dt * speed;
      while (accumulator >= 0.05) {
        const events = sim.step(0.05);
        scene.sync(sim.state, events, 0.05);
        accumulator -= 0.05;
        if (sim.state.time - history[history.length - 1].t >= 0.5) history.push({ t: sim.state.time, outside: sim.state.outside, inside: sim.state.inside });
      }
      renderClock += dt;
      if (renderClock > 0.2) { renderClock = 0; render(); }
    }
  };
  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => { tick(now, last); last = now; frame = requestAnimationFrame(loop); };
  frame = requestAnimationFrame(loop);

  const capture = (): EvidenceRow => {
    const s = sim.state;
    return {
      time: `${Math.round(s.time)} s`, outside: String(s.outside), inside: String(s.inside), inward: String(s.inward), outward: String(s.outward),
      net: `${s.netRate.toFixed(2)}/s`, start: String(startOutside), channels: String(s.channels), atp: s.atp ? "有" : "无", atpUsed: String(s.atpUsed),
    };
  };

  const setMode = (next: TransportMode) => {
    mode = next;
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === next)));
    restart();
  };

  let lastStep = "";
  const onTask = (task: InquiryTask, phase: string) => {
    const step = `${task.id}:${phase}`;
    const entering = phase === "operate" && step !== lastStep;
    lastStep = step;
    if (!entering) return;  // 任务预设只在进入操作阶段时执行一次
    if (task.id === "saturation" && mode !== "facilitated") { inside.value = "0"; setMode("facilitated"); }
    if (task.id === "energy" && mode !== "active") { outside.value = "50"; inside.value = "50"; setMode("active"); }
  };
  const inquiry = mountInquiry($("#mb-inquiry"), { design: membraneLesson, stage: school, columns: (task) => COLUMNS[task.id] ?? COLUMNS.direction, capture, onChange: onTask });
  const disposeNotes = mountTeacherNotes($<HTMLButtonElement>("#mb-teacher"), membraneLesson, () => school);

  const setSchool = (next: SchoolStage) => {
    school = next;
    lab.dataset.school = next;
    try { localStorage.setItem(STAGE_KEY, next); } catch { /* 不保存也能用 */ }
    document.querySelectorAll<HTMLButtonElement>("[data-school]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.school === next)));
    inquiry.setStage(next);
    if (next === "初中" && mode !== "diffusion") setMode("diffusion");
  };

  const togglePause = () => {
    paused = !paused;
    $("#mb-pause").setAttribute("aria-pressed", String(paused));
    $("#mb-pause").textContent = paused ? "继续" : "暂停";
  };

  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.school) setSchool(button.dataset.school as SchoolStage);
    else if (button.dataset.mode) setMode(button.dataset.mode as TransportMode);
    else if (button.dataset.speed) {
      speed = Number(button.dataset.speed);
      document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    } else if (button.id === "mb-restart") restart();
    else if (button.id === "mb-pause") togglePause();
  };
  const onLive = () => {
    sim.set({ channels: settings().channels, atp: settings().atp });
    scene.setMode(mode, sim.state.channels, sim.state.atp);
    render();
  };
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "range" && target.type !== "checkbox")) return;
    if (document.querySelector(".tn-dialog:not([hidden])")) return;
    if (event.key === " " && !(target instanceof HTMLInputElement) && !target.closest("button, a, summary")) { event.preventDefault(); togglePause(); }  // 焦点在复选框、滑杆上时空格交给控件
    else if (event.key === "r" || event.key === "R") inquiry.capture();
  };

  lab.addEventListener("click", onClick);
  [outside, inside].forEach((element) => element.addEventListener("change", restart));
  [outside, inside].forEach((element) => element.addEventListener("input", () => { $("#mb-outside-out").textContent = outside.value; $("#mb-inside-out").textContent = inside.value; }));
  [channels, atp].forEach((element) => element.addEventListener("input", onLive));
  window.addEventListener("keydown", onKey);
  restart();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
    inquiry.dispose();
    disposeNotes();
    scene.dispose();
  };
}
