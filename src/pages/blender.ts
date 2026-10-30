import { caseManifests } from "../data/manifests";
import { volcanoLesson } from "../content/lessons/volcano";
import { mountInquiry, type EvidenceRow } from "../ui/inquiry";
import { mountTeacherNotes } from "../ui/teacherNotes";
import { shell } from "../ui/shell";
import type { SchoolStage } from "../types";
import "../styles/blender.css";
import "../styles/inquiry.css";

interface Change { path: string; before: string | number | boolean; after: string | number | boolean; unit: string }
interface ScreenLabel { object: string; text: string; anchor: { x: number; y: number }; appearAtSeconds: number }
interface Step { id: number; title: string; vague: string; precise: string; objects: string[]; changes: Change[]; image: string; video: string; labels?: ScreenLabel[]; cuts?: Array<{ seconds: number; camera: string }> }
interface Phase { id: string; name: string; start: number; end: number }
interface StepsPayload { generatedBy: string; steps: Step[]; phases?: Phase[]; timeScale?: number; scaleBar?: Record<string, { metres: number; fraction: number }> }
const SCALE_CAMERA: Record<number, string> = { 2: "Camera_Climax", 3: "Camera_Hero" };

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

let activeBlenderCleanup: (() => void) | undefined;

function pageMarkup(disclaimer: string): string {
  return shell(`
    <section class="blender-stage" data-step="1" aria-busy="true">
      <div class="blender-hero">
        <video id="blender-hero-video" autoplay muted loop playsinline poster="./media/blender-volcano-poster.png"><source src="./media/blender-volcano-demo.mp4" type="video/mp4"></video>
        <div class="blender-veil"></div>
        <div class="blender-title">
          <span class="blender-kicker">CODEX × BLENDER · LANGUAGE TO WORLD</span>
          <h1>一句话，<br><em>改变一座火山</em></h1>
          <p>语言越精确，AI 创造的三维世界越可控。</p>
          <p class="blender-facts"><span>Vulcanian 喷发</span><span>1 场景单位 = 100 m</span><span id="time-scale-badge">画面时间压缩 5×</span></p>
          <div class="blender-hero-actions">
            <button id="blender-start">开始五步演示</button><button id="blender-fullscreen">全屏播放</button>
            <a href="./media/blender-volcano-demo.mp4" target="_blank" rel="noreferrer">播放完成版</a>
            <a href="./media/blender-live-edit-demo.mp4" target="_blank" rel="noreferrer">播放修改版</a>
            <a href="./media/volcano-cinematic.mp4" target="_blank" rel="noreferrer">播放电影版</a>
          </div>
        </div>
        <div class="blender-scroll-cue" aria-hidden="true"><span></span>自然语言 → 参数 → 世界</div>
      </div>

      <div class="blender-console" id="blender-console">
        <header class="blender-console-head"><div><span class="signal"></span> CODEX / BLENDER BRIDGE</div><span id="blender-step-label">01 / 05</span></header>
        <div class="blender-workbench">
          <section class="prompt-terminal" aria-label="提示词终端">
            <span class="terminal-label">自然语言输入</span><h2 id="step-title">正在读取步骤…</h2>
            <div class="prompt-line vague"><span class="prompt-mark">›</span><del id="vague-prompt"></del></div>
            <div class="prompt-line precise"><span class="prompt-mark">›</span><span id="precise-prompt"></span><i class="cursor" aria-hidden="true"></i></div>
            <div class="execution-log" id="execution-log" aria-live="polite"></div>
            <div class="terminal-actions"><button id="copy-blender-prompt">复制精确提示词</button><span>翻页笔 / ← → / 空格</span></div>
          </section>
          <section class="result-panel" aria-label="Blender 渲染结果">
            <div class="comparison" id="comparison">
              <img id="after-image" alt="当前精确提示词生成的火山剖面结果">
              <div class="comparison-before" id="comparison-before"><img id="before-image" alt="修改前的火山剖面"></div>
              <div class="comparison-line" id="comparison-line"><span>↔</span></div>
              <input id="comparison-range" type="range" min="0" max="100" value="48" aria-label="拖动比较修改前后">
              <span class="compare-tag before">修改前</span><span class="compare-tag after">精确之后</span>
              <div class="geology-label-layer" id="image-labels" aria-label="地层标注"></div>
              <div class="scale-bar" id="scale-bar" hidden><i></i><span>1 km</span></div>
            </div>
            <div class="step-video-wrap" id="step-video-wrap" hidden><video id="step-video" muted loop playsinline aria-label="当前步骤短片"></video><div class="geology-label-layer" id="video-labels" aria-hidden="true"></div></div>
            <div class="phase-bar" id="phase-bar" hidden aria-label="喷发阶段"></div>
            <button id="toggle-result-video" aria-pressed="false">播放这一步的短片</button>
          </section>
        </div>
        <section class="parameter-panel" aria-label="参数差异"><header><span>执行结果</span><strong id="object-list"></strong></header><div id="parameter-table" class="parameter-table"></div></section>
        <footer class="blender-progress"><button id="prev-step" aria-label="上一步">←</button><div id="step-dots" class="step-dots" aria-label="五步演示进度"></div><button id="next-step" aria-label="下一步">→</button></footer>
      </div>

      <section class="blender-inquiry">
        <header><span class="blender-kicker">GEOGRAPHY · 预测 → 操作 → 证据 → 解释 → 评价</span><h2>从岩浆房到火山弹：<em>用画面作证据</em></h2>
          <div class="lx-head"><div class="lx-school" role="group" aria-label="学段"><button data-school="初中">初中</button><button data-school="高中">高中</button></div><button id="volcano-teacher" class="lx-teacher" aria-expanded="false">教师提示</button></div>
        </header>
        <div class="inquiry" id="volcano-inquiry"></div>
        <p class="blender-observed" id="volcano-observed">点击第 4 步的地层标签，或在短片里点阶段条，所见会作为证据记录。</p>
      </section>

      <section class="blender-live">
        <div><div><span class="blender-kicker">LIVE WORKSHOP · 30 SECOND RULE</span><h2>现场真做，<em>但不把课堂交给意外</em></h2></div><p>打开预建副本，连接 localhost MCP，只改已命名对象。连接、对象检查或预览任一步超过 30 秒，立即播放完成版录像，继续讲“精确语言如何映射到参数”。</p></div>
        <details><summary>现场用 MCP 真改 <span>展开操作路径</span></summary>
          <ol><li>打开 <code>volcano-classroom.blend</code> 的副本。</li><li>Blender 侧栏确认 MCP 为 <code>localhost:9876</code>，保持安全模式。</li><li>复制当前精确提示词，只允许修改列出的对象与参数。</li><li>30 秒未得到预期预览：停止排错，点击“播放完成版”。</li></ol>
          <div class="live-links"><a href="./blender/volcano-classroom.blend">打开预建场景</a><a href="./media/blender-volcano-demo.mp4" target="_blank" rel="noreferrer">播放完成版</a></div>
        </details><p class="blender-disclaimer">${escapeHtml(disclaimer)}</p>
      </section>
    </section>
  `);
}

export function renderBlender(): () => void {
  activeBlenderCleanup?.();
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = pageMarkup(caseManifests[3]!.disclaimer ?? "");
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const stage = $<HTMLElement>(".blender-stage");
  const heroVideo = $<HTMLVideoElement>("#blender-hero-video");
  const stepVideo = $<HTMLVideoElement>("#step-video");
  const abort = new AbortController();
  const timers = new Set<number>();
  let steps: Step[] = [];
  let payload: StepsPayload | undefined;
  let observed = { structure: "—", phase: "—", time: "—" };
  let school: SchoolStage = "高中";
  try { if (localStorage.getItem("ai3d-stage:blender") === "初中") school = "初中"; } catch { /* 默认高中 */ }
  let selected = 0;
  let disposed = false;
  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
  };
  const type = (element: HTMLElement, text: string, delay: number, done?: () => void) => {
    element.textContent = "";
    let index = 0;
    const tick = () => {
      if (disposed) return;
      element.textContent = text.slice(0, index += 1);
      if (index < text.length) later(tick, delay); else done?.();
    };
    tick();
  };
  const renderChanges = (step: Step) => {
    $("#parameter-table").innerHTML = step.changes.map((change) => `<div class="parameter-row"><code>${escapeHtml(change.path)}</code><span class="value-before">${escapeHtml(change.before)}${escapeHtml(change.unit)}</span><span class="change-arrow">→</span><strong class="value-after">${escapeHtml(change.after)}${escapeHtml(change.unit)}</strong></div>`).join("");
    $("#execution-log").innerHTML = step.changes.map((change, index) => `<div style="--delay:${index * 90}ms"><span>✓</span> ${escapeHtml(change.path)} &nbsp; ${escapeHtml(change.before)} → ${escapeHtml(change.after)}</div>`).join("");
  };
  /** 窄屏上标签会互相压住（手机上“沉积岩层”盖住“岩床”）：按从上到下的顺序，把撞上的标签下移到刚好让开 */
  const declutter = (layer: HTMLElement) => {
    const items = [...layer.querySelectorAll<HTMLElement>("[data-label-object]")];
    items.forEach((item) => { item.style.marginTop = "0px"; });
    if (!layer.offsetWidth) return;  // hidden layer: measured again when it is shown
    const placed: Array<{ left: number; width: number; top: number; height: number }> = [];
    for (const item of items.sort((a, b) => a.offsetTop - b.offsetTop)) {
      const box = { left: item.offsetLeft, width: item.offsetWidth, top: item.offsetTop, height: item.offsetHeight };
      for (let moved = true; moved;) {
        moved = false;
        for (const other of placed) {
          if (box.left < other.left + other.width && other.left < box.left + box.width && box.top < other.top + other.height + 2 && other.top < box.top + box.height) {
            box.top = other.top + other.height + 2; moved = true;
          }
        }
      }
      item.style.marginTop = `${box.top - item.offsetTop}px`;
      placed.push(box);
    }
  };
  const declutterVisible = () => requestAnimationFrame(() => { declutter($("#image-labels")); declutter($("#video-labels")); });
  const renderLabels = (step: Step) => {
    const markup = (step.labels ?? []).map((label) => `<button type="button" style="left:${label.anchor.x * 100}%;top:${label.anchor.y * 100}%;--appear:${label.appearAtSeconds}s" data-label-object="${escapeHtml(label.object)}"><i></i>${escapeHtml(label.text)}</button>`).join("");
    $("#image-labels").innerHTML = markup;
    $("#video-labels").innerHTML = markup;
    declutterVisible();
  };
  /** 1 km 比例尺只在已知相机的画面上出现：静帧用出图相机，短片按剪辑点换相机，近景不显示 */
  const showScale = (camera: string | undefined) => {
    const scale = camera ? payload?.scaleBar?.[camera] : undefined;
    $("#scale-bar").hidden = !scale;
    if (scale) $("#scale-bar").style.setProperty("--bar", `${scale.fraction * 100}%`);
  };
  const videoCamera = () => [...(steps[selected]?.cuts ?? [])].reverse().find((cut) => stepVideo.currentTime >= cut.seconds)?.camera;
  const select = (index: number) => {
    if (!steps.length) return;
    selected = Math.max(0, Math.min(steps.length - 1, index));
    const step = steps[selected];
    stage.dataset.step = String(step.id);
    $("#step-title").textContent = `${String(step.id).padStart(2, "0")} · ${step.title}`;
    $("#blender-step-label").textContent = `${String(step.id).padStart(2, "0")} / 05`;
    $("#object-list").textContent = step.objects.join(" · ");
    $<HTMLImageElement>("#after-image").src = step.image;
    $<HTMLImageElement>("#before-image").src = selected ? steps[selected - 1].image : "./media/blender-volcano-poster.png";
    stepVideo.pause(); stepVideo.src = step.video; $("#step-video-wrap").hidden = true; $("#comparison").hidden = false;
    $("#comparison").append($("#scale-bar"));  // the 1 km bar follows whichever picture is showing
    $<HTMLButtonElement>("#toggle-result-video").textContent = "播放这一步的短片";
    $<HTMLButtonElement>("#toggle-result-video").setAttribute("aria-pressed", "false");
    timers.forEach((timer) => window.clearTimeout(timer)); timers.clear();
    renderLabels(step);
    showScale(SCALE_CAMERA[step.id]);
    $("#phase-bar").hidden = step.id !== 2 || !payload?.phases;
    type($("#vague-prompt"), step.vague, 52, () => later(() => type($("#precise-prompt"), step.precise, 24, () => renderChanges(step)), 260));
    document.querySelectorAll<HTMLButtonElement>("[data-step-dot]").forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === selected); dot.setAttribute("aria-current", dotIndex === selected ? "step" : "false");
    });
    $<HTMLButtonElement>("#prev-step").disabled = selected === 0;
    $<HTMLButtonElement>("#next-step").disabled = selected === steps.length - 1;
  };
  const stepBy = (delta: number) => select(selected + delta);
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === " " && event.target instanceof Element && event.target.closest("button, a, summary, select, [contenteditable='true']")) return;
    if (event.key === "Escape") { if (document.fullscreenElement) { event.preventDefault(); void document.exitFullscreen(); } return; }
    if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); stepBy(1); }
    else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); stepBy(-1); }
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true; abort.abort(); timers.forEach((timer) => window.clearTimeout(timer));
    window.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", onHashChange);
    heroVideo.pause(); stepVideo.pause(); heroVideo.removeAttribute("src"); stepVideo.removeAttribute("src");
  };
  const onHashChange = () => { if (!location.hash.startsWith("#/blender")) cleanup(); };
  window.addEventListener("keydown", onKey); window.addEventListener("hashchange", onHashChange);
  $("#blender-start").addEventListener("click", () => $("#blender-console").scrollIntoView({ behavior: "smooth" }));
  $("#blender-fullscreen").addEventListener("click", () => void heroVideo.requestFullscreen());
  $("#prev-step").addEventListener("click", () => stepBy(-1)); $("#next-step").addEventListener("click", () => stepBy(1));
  $<HTMLInputElement>("#comparison-range").addEventListener("input", (event) => {
    const value = Number((event.target as HTMLInputElement).value); $("#comparison-before").style.width = `${value}%`; $("#comparison-line").style.left = `${value}%`;
  });
  $("#toggle-result-video").addEventListener("click", () => {
    const wrapper = $("#step-video-wrap"); const showing = !wrapper.hidden; wrapper.hidden = showing; $("#comparison").hidden = !showing;
    (showing ? $("#comparison") : wrapper).append($("#scale-bar"));
    showScale(showing ? SCALE_CAMERA[steps[selected]?.id ?? 0] : videoCamera());
    declutterVisible();
    const button = $<HTMLButtonElement>("#toggle-result-video"); button.setAttribute("aria-pressed", String(!showing)); button.textContent = showing ? "播放这一步的短片" : "返回前后对比";
    if (showing) stepVideo.pause(); else void stepVideo.play();
  });
  $("#copy-blender-prompt").addEventListener("click", async () => {
    if (!steps.length) return;
    try { await navigator.clipboard.writeText(steps[selected].precise); $("#copy-blender-prompt").textContent = "已复制精确提示词"; }
    catch { $("#copy-blender-prompt").textContent = "请手动复制"; }
    later(() => { $("#copy-blender-prompt").textContent = "复制精确提示词"; }, 1300);
  });
  void fetch("./media/blender/steps.json", { signal: abort.signal }).then((response) => {
    if (!response.ok) throw new Error(`steps.json ${response.status}`); return response.json() as Promise<StepsPayload>;
  }).then((data) => {
    if (disposed || data.steps.length !== 5) return;
    payload = data;
    steps = data.steps;
    if (data.timeScale) $("#time-scale-badge").textContent = `画面时间压缩 ${data.timeScale}×`;
    $("#phase-bar").innerHTML = (data.phases ?? []).map((phase) => `<button data-phase-start="${phase.start}" data-phase-name="${escapeHtml(phase.name)}"><b>${escapeHtml(phase.name)}</b><small>${phase.start.toFixed(1)} s</small></button>`).join("");
    $("#step-dots").innerHTML = steps.map((step, index) => `<button data-step-dot="${index}" aria-label="第 ${step.id} 步：${escapeHtml(step.title)}"><span>${step.id}</span><small>${escapeHtml(step.title)}</small></button>`).join("");
    document.querySelectorAll<HTMLButtonElement>("[data-step-dot]").forEach((dot) => dot.addEventListener("click", () => select(Number(dot.dataset.stepDot))));
    stage.setAttribute("aria-busy", "false"); select(0);
  }).catch((error: unknown) => { if ((error as Error).name !== "AbortError") $("#step-title").textContent = "步骤数据加载失败，请播放完成版"; });
  const currentPhase = (seconds: number) => (payload?.phases ?? []).filter((phase) => seconds >= phase.start).pop()?.name ?? "—";
  $("#phase-bar").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-phase-start]");
    if (!button) return;
    if ($("#step-video-wrap").hidden) $("#toggle-result-video").click();
    stepVideo.currentTime = Number(button.dataset.phaseStart);
    void stepVideo.play();
    observed = { ...observed, phase: button.dataset.phaseName ?? "—", time: `${Number(button.dataset.phaseStart).toFixed(1)} s` };
    $("#volcano-observed").textContent = `正在看：${observed.phase}（${observed.time}）`;
  }, { signal: abort.signal });
  window.addEventListener("resize", declutterVisible, { signal: abort.signal });
  stepVideo.addEventListener("timeupdate", () => {
    if (!$("#step-video-wrap").hidden) showScale(videoCamera());
    if (!payload?.phases || steps[selected]?.id !== 2) return;
    const name = currentPhase(stepVideo.currentTime);
    document.querySelectorAll<HTMLButtonElement>("[data-phase-start]").forEach((button) => button.classList.toggle("active", button.dataset.phaseName === name));
  }, { signal: abort.signal });
  stage.addEventListener("click", (event) => {
    const label = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-label-object]");
    if (!label) return;
    observed = { ...observed, structure: label.textContent?.trim() ?? "—" };
    document.querySelectorAll("[data-label-object]").forEach((item) => item.classList.toggle("picked", item.textContent === label.textContent));
    $("#volcano-observed").textContent = `已选结构：${observed.structure}（标签位置：${Number(label.style.top.replace("%", "")) > 45 ? "地表以下" : "接近地表或地表以上"}）`;
  }, { signal: abort.signal });
  const capture = (): EvidenceRow => {
    const videoTime = !$("#step-video-wrap").hidden && steps[selected]?.id === 2 ? stepVideo.currentTime : undefined;
    return {
      step: steps[selected] ? `${steps[selected].id} · ${steps[selected].title}` : "—",
      phase: videoTime !== undefined ? currentPhase(videoTime) : observed.phase,
      time: videoTime !== undefined ? `${videoTime.toFixed(1)} s` : observed.time,
      structure: observed.structure,
    };
  };
  const columns = { why: [{ key: "phase", label: "阶段" }, { key: "time", label: "时刻" }, { key: "step", label: "步骤" }], rocks: [{ key: "structure", label: "结构" }, { key: "step", label: "步骤" }], bombs: [{ key: "phase", label: "阶段" }, { key: "time", label: "时刻" }, { key: "step", label: "步骤" }] } as Record<string, Array<{ key: string; label: string }>>;
  const inquiry = mountInquiry($("#volcano-inquiry"), { design: volcanoLesson, stage: school, columns: (task) => columns[task.id] ?? columns.why, capture });
  const disposeNotes = mountTeacherNotes($<HTMLButtonElement>("#volcano-teacher"), volcanoLesson, () => school);
  const setSchool = (next: SchoolStage) => {
    school = next;
    try { localStorage.setItem("ai3d-stage:blender", next); } catch { /* 不保存也能用 */ }
    document.querySelectorAll<HTMLButtonElement>(".blender-inquiry [data-school]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.school === next)));
    inquiry.setStage(next);
  };
  document.querySelector(".blender-inquiry")!.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-school]");
    if (button) setSchool(button.dataset.school as SchoolStage);
  }, { signal: abort.signal });
  setSchool(school);
  const baseCleanup = cleanup;
  const fullCleanup = () => { inquiry.dispose(); disposeNotes(); baseCleanup(); };
  activeBlenderCleanup = fullCleanup;
  return fullCleanup;
}
