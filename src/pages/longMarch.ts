import { routeNodes } from "../data/route";
import { caseManifests } from "../data/manifests";
import { mountLongMarchEnhanced } from "../scenes/longMarchMap";
import { shell } from "../ui/shell";
import { createStoryCarousel, loadStoryManifest } from "../ui/storyCarousel";
import { longMarchLesson } from "../content/lessons/longMarch";
import { mountTeacherNotes } from "../ui/teacherNotes";
import "../styles/inquiry.css";

// 页面控制器：所有按钮、时间轴、地图点击和键盘（含翻页笔）都走同一套状态，避免互相打架。
//   ← / PageUp 上一站   → / PageDown 下一站   Home 全景   Esc 关闭详情或回全景

const OVERVIEW_COPY = {
  date: "1934.10 — 1935.10",
  title: "中央红军长征全程",
  summary: "从赣南出发，经湘、桂、黔、滇、川、甘，到达陕北。点时间轴或地图上的事件，镜头飞向现场；翻页笔 / ← → 逐站讲解。",
};

function timelineButtons(): string {
  return routeNodes.map((node, index) => `
    <button class="story-stop" data-node="${index}" aria-pressed="false">
      <span class="stop-dot"></span><small>${node.date.slice(0, 7)}</small><strong>${node.title.replace("飞夺", "")}</strong>
    </button>
  `).join("");
}

export async function renderLongMarch(): Promise<() => void> {
  const manifest = caseManifests[0];
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="story-map">
      <div class="cinematic-stage" id="stage" data-view="overview" data-dimension="3d" aria-label="中央红军长征三维地图">
        <div class="story-heading">
          <span>中国工农红军长征历程</span>
          <h1>长征路线</h1>
          <p>1934—1935 · 中央红军主线</p>
        </div>
        <div class="map-toolbar" aria-label="地图控制">
          <button id="overview-button">恢复全景</button>
          <button id="weather-button" aria-pressed="true">关闭天气</button>
          <button id="lm-teacher" aria-expanded="false">教师提示</button>
          <button id="dimension-button" aria-pressed="false">俯视地图</button>
          <a href="./${manifest.fallbackVideo}" target="_blank" rel="noreferrer">播放备用录像</a>
        </div>
        <aside class="event-peek" id="event-peek" aria-live="polite">
          <span class="event-kicker" id="event-date"></span>
          <h2 id="event-title"></h2>
          <p id="event-summary"></p>
          <button id="open-event"></button>
        </aside>
        <div class="weather-chip"><span></span>真实 DEM 高程 · 垂直夸张 9 倍 · 水系由高程推算 · 拖动旋转</div>
        <ul class="lm-legend" aria-label="事件类型图例">
          <li style="--c:#ff5a42">突破封锁</li><li style="--c:#ffc65c">战略转折</li><li style="--c:#a6e6ff">自然险阻</li><li style="--c:#ff9440">会师落脚</li>
        </ul>
        <div class="story-timeline">
          <div class="timeline-meta"><strong>长征大事记</strong><span>再点一次当前节点 = 放大事件</span></div>
          <div class="story-stops">${timelineButtons()}</div>
          <div class="timeline-actions">
            <button id="prev-button" aria-label="上一站">‹</button>
            <button id="tour-button" class="tour-button" aria-pressed="false">▶ 自动巡航</button>
            <button id="next-button" aria-label="下一站">›</button>
          </div>
        </div>
      </div>
      <p class="map-disclaimer">${manifest.disclaimer} 地形来自公开 DEM（垂直夸张 9 倍），河流由高程数据自动推算；路线按主要途经城镇与渡口近似绘制，用于教学空间示意，不作为行政区划或测绘依据。</p>
    </section>
    <div class="event-modal" id="event-modal" role="dialog" aria-modal="true" aria-label="历史事件详情" hidden>
      <div class="story-card" id="story-card">
        <button class="modal-close" id="close-event" aria-label="关闭事件详情（Esc）">×</button>
        <div class="story-stage"></div>
        <div class="story-bar">
          <button class="story-prev" aria-label="上一张">‹</button>
          <div class="story-dots"></div>
          <button class="story-next" aria-label="下一张">›</button>
          <span class="story-hint">← → 翻看 · 最后一页是讲解 · Esc 关闭</span>
        </div>
      </div>
    </div>
  `);

  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const stage = $("#stage");
  const modal = $("#event-modal");
  const carousel = createStoryCarousel($("#story-card"), await loadStoryManifest());
  const weatherButton = $<HTMLButtonElement>("#weather-button");
  const disposeNotes = mountTeacherNotes($<HTMLButtonElement>("#lm-teacher"), longMarchLesson, () => "高中");
  const dimensionButton = $<HTMLButtonElement>("#dimension-button");
  const tourButton = $<HTMLButtonElement>("#tour-button");
  const stops = [...document.querySelectorAll<HTMLButtonElement>("[data-node]")];
  const last = routeNodes.length - 1;

  let selected = -1;
  let weather = true;
  let dimension: "2d" | "3d" = "3d";
  let tourTimer = 0;

  const renderPanel = () => {
    const node = routeNodes[selected];
    $("#event-date").textContent = node ? node.date : OVERVIEW_COPY.date;
    $("#event-title").textContent = node ? node.title : OVERVIEW_COPY.title;
    $("#event-summary").textContent = node ? node.summary : OVERVIEW_COPY.summary;
    $("#open-event").textContent = node ? "放大事件" : "从起点开始";
    stops.forEach((button, index) => {
      button.classList.toggle("active", index === selected);
      button.setAttribute("aria-pressed", String(index === selected));
    });
    stops[selected]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    $<HTMLButtonElement>("#prev-button").disabled = selected <= 0;
    $<HTMLButtonElement>("#next-button").disabled = selected >= last;
  };
  const renderToolbar = () => {
    weatherButton.disabled = dimension === "2d";
    weatherButton.title = dimension === "2d" ? "俯视地图下不显示天气" : "";
    weatherButton.setAttribute("aria-pressed", String(weather));
    weatherButton.textContent = weather ? "关闭天气" : "开启天气";
    dimensionButton.setAttribute("aria-pressed", String(dimension === "2d"));
    dimensionButton.textContent = dimension === "3d" ? "俯视地图" : "立体沙盘";
  };

  const stopTour = () => {
    window.clearTimeout(tourTimer);
    tourTimer = 0;
    tourButton.textContent = "▶ 自动巡航";
    tourButton.setAttribute("aria-pressed", "false");
  };
  const closeModal = () => {
    if (modal.hidden) return;
    modal.hidden = true;
  };
  const openModal = (index: number) => {
    carousel.show(routeNodes[index]);
    modal.hidden = false;
    $<HTMLButtonElement>("#close-event").focus();
  };

  // 场景先挂载；地图上点图钉 / 事件标签都回到 pick()，和时间轴同一套规则。
  let scene: Awaited<ReturnType<typeof mountLongMarchEnhanced>>;
  const select = (index: number) => {
    selected = Math.max(0, Math.min(last, index));
    renderPanel();
    scene.selectNode(selected);
  };
  const overview = () => {
    selected = -1;
    renderPanel();
    scene.overview();
  };
  /** 手动选择：停巡航；再点当前节点则放大事件。 */
  const pick = (index: number) => {
    stopTour();
    closeModal();
    if (index === selected) openModal(index);
    else select(index);
  };
  const step = (delta: number) => {
    stopTour();
    closeModal();
    if (selected < 0) select(delta > 0 ? 0 : last);
    else if (selected + delta >= 0 && selected + delta <= last) select(selected + delta);
  };

  scene = await mountLongMarchEnhanced(stage, (index) => pick(index));
  renderPanel();
  renderToolbar();

  const tourNext = () => {
    if (selected >= last) {
      stopTour();
      tourTimer = window.setTimeout(() => { tourTimer = 0; overview(); }, 3200);
      return;
    }
    select(selected + 1);
    tourTimer = window.setTimeout(tourNext, 5200);
  };

  stops.forEach((button, index) => button.addEventListener("click", () => pick(index)));
  $("#prev-button").addEventListener("click", () => step(-1));
  $("#next-button").addEventListener("click", () => step(1));
  $("#open-event").addEventListener("click", () => (selected < 0 ? pick(0) : openModal(selected)));
  $("#close-event").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  $("#overview-button").addEventListener("click", () => { stopTour(); closeModal(); overview(); });
  weatherButton.addEventListener("click", () => {
    weather = !weather;
    scene.setRain(weather);
    renderToolbar();
  });
  dimensionButton.addEventListener("click", () => {
    dimension = dimension === "3d" ? "2d" : "3d";
    scene.setDimension(dimension);
    if (selected >= 0) scene.selectNode(selected);
    renderToolbar();
  });
  tourButton.addEventListener("click", () => {
    if (tourTimer) { stopTour(); return; }
    closeModal();
    tourButton.textContent = "■ 停止巡航";
    tourButton.setAttribute("aria-pressed", "true");
    select(selected < 0 || selected >= last ? 0 : selected + 1);
    tourTimer = window.setTimeout(tourNext, 5200);
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    // 详情打开时，翻页笔翻的是图片，不是节点
    if (!modal.hidden && ["ArrowRight", "PageDown", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      carousel.step(event.key === "ArrowRight" || event.key === "PageDown" ? 1 : -1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); step(-1); }
    else if (event.key === "Home") { stopTour(); closeModal(); overview(); }
    else if (event.key === "Escape") {
      if (!modal.hidden) { event.preventDefault(); closeModal(); }
      else if (selected >= 0 || tourTimer) { event.preventDefault(); stopTour(); overview(); }
      // 已在全景：不处理，交给顶栏流程导航返回主课件
    }
  };
  window.addEventListener("keydown", onKey);

  return () => {
    disposeNotes();
    stopTour();
    window.removeEventListener("keydown", onKey);
    scene.dispose();
  };
}
