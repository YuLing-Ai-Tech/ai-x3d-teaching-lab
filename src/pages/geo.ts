import { geoLesson } from "../content/lessons/geo";
import { LANDFORMS, TIER_LIMITS, analyzeProfile, insideOutline, landGrid, landformsVersus, parseGeo, shareAbove, tierOf, type GeoQuery, type Outline, type ProfileAnalysis, type Tier } from "../domain/geo";
import { mountGeo, type GeoScene } from "../scenes/geo";
import { renderLangLab, type LangParse } from "../ui/langLab";
import "../styles/inquiry.css";
import "../styles/geo-lab.css";

// 地理 · 用坐标说话：经纬度、海拔、剖面线，是地理学描述大地的语言。
// 讲解卡的结论全部从同一份 DEM 采样算出：有三级阶梯才说三级阶梯，没有就说缺了哪一级。

const TIER_NAME: Record<Tier, string> = { 1: "第一级", 2: "第二级", 3: "第三级" };
const deg = (value: number) => `${Number(value.toFixed(1))}°`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

interface Measured {
  label: string;
  profile?: ProfileAnalysis & { axis: "lat" | "lon" };
  share?: number;
  landforms?: Array<{ name: string; metres: number; above: boolean }>;
  pin?: { metres: number; inside: boolean };
}

const labelOf = (query: GeoQuery) =>
  query.kind === "profile" ? `${query.axis === "lat" ? "北纬" : "东经"}${query.value}°`
    : query.kind === "flood" ? `${query.metres}米以下`
      : query.kind === "above" ? `${query.metres}米以上`
        : `${query.lon}E,${query.lat}N`;

export async function renderGeo(): Promise<() => void> {
  let scene: GeoScene | undefined;
  let outline: Outline | undefined;
  let grid: ReturnType<typeof landGrid> | undefined;
  let unlocked = false;
  let current: () => LangParse<GeoQuery> = () => ({ ok: false, params: { kind: "above", metres: 3000 }, tokens: [] });
  try { outline = await fetch("./data/china-outline.json").then((response) => response.json() as Promise<Outline>); } catch { /* 没有国界时只给海拔，不判境内外 */ }
  const cache = new Map<string, Measured>();

  const measure = (query: GeoQuery): Measured | undefined => {
    if (!scene) return undefined;
    const label = labelOf(query);
    const hit = cache.get(label + JSON.stringify(query));
    if (hit) return hit;
    const elevationAt = scene.elevationAt;
    const inside = (lon: number, lat: number) => (outline ? insideOutline(outline, lon, lat) : true);
    let result: Measured;
    if (query.kind === "profile") {
      const samples = Array.from({ length: 401 }, (_, i) => {
        const at = query.from + (query.to - query.from) * i / 400;
        const [lon, lat] = query.axis === "lat" ? [at, query.value] : [query.value, at];
        return { at, metres: Math.max(0, elevationAt(lon, lat)), inside: inside(lon, lat) };
      });
      result = { label, profile: { ...analyzeProfile(samples), axis: query.axis } };
    } else if (query.kind === "flood" || query.kind === "above") {
      grid ??= outline ? landGrid(outline) : [];
      const above = shareAbove(grid, query.metres, elevationAt);
      result = { label, share: query.kind === "above" ? above : 1 - above, landforms: landformsVersus(query.metres, elevationAt) };
    } else {
      result = { label, pin: { metres: elevationAt(query.lon, query.lat), inside: inside(query.lon, query.lat) } };
    }
    cache.set(label + JSON.stringify(query), result);
    return result;
  };

  const order = (profile: ProfileAnalysis) => profile.runs.map((run) => run.tier).join("→") || "—";
  const where = (profile: ProfileAnalysis & { axis: "lat" | "lon" }, at: number) => `${profile.axis === "lat" ? "东经" : "北纬"} ${deg(at)}`;

  /** 从数据推出的结论：剖面是否为三级阶梯、缺了哪一级、分界在哪里 */
  const profileVerdict = (profile: ProfileAnalysis & { axis: "lat" | "lon" }) => {
    const runs = profile.runs.map((run) => `${TIER_NAME[run.tier]}（${where(profile, run.from)}–${deg(run.to)}，均约 ${Math.round(run.mean)} 米）`).join(" → ");
    if (!profile.runs.length) return { ok: false, text: "这条线没有经过国界内的陆地。" };
    if (profile.staircase) {
      return { ok: true, text: `依次经过 ${runs}。这一刀切出了完整的三级阶梯：地势${profile.axis === "lat" ? "西高东低" : "随纬度"}逐级下降。` };
    }
    const missing = ([1, 2, 3] as Tier[]).filter((tier) => !profile.tiers.includes(tier));
    const lines = [`依次经过 ${runs}。`];
    if (missing.includes(1)) lines.push(`境内最高只有约 ${Math.round(profile.max.metres)} 米，没有第一级（≥${TIER_LIMITS.first} 米）——这条线到不了青藏高原。`);
    else if (missing.includes(2)) lines.push(`第一级之后直接降到 ${TIER_LIMITS.second} 米以下，第二级没有连续出现：经过的盆地或河谷底部低于 ${TIER_LIMITS.second} 米。按海拔阈值分级，与教材以山脉为界的三级阶梯不一致。`);
    else lines.push("各级没有按从高到低的顺序排列：这条线上高低交替，单看它说不出“阶梯”。");
    return { ok: false, text: lines.join("") };
  };

  const explainQuery = (query: GeoQuery, reveal: boolean) => {
    const data = measure(query);
    if (!data) return { title: "地形加载中", body: "<p>正在读取 DEM……</p>" };
    if (data.profile) {
      const p = data.profile;
      const title = p.axis === "lat" ? `北纬 ${query.kind === "profile" ? query.value : ""}° 的一刀` : `东经 ${query.kind === "profile" ? query.value : ""}° 的一刀`;
      const facts = `<p>境内最高约 <b>${Math.round(p.max.metres)} 米</b>（${where(p, p.max.at)}），境内平均约 ${Math.round(p.mean)} 米。</p>`;
      if (!reveal) return { title, body: `${facts}<p>依次出现了哪几级？先预测，再从剖面和数据卡里找证据。</p>` };
      const verdict = profileVerdict(p);
      return { title, body: `${facts}<p class="${verdict.ok ? "lang-ok" : "lang-warn"}">${verdict.text}</p>` };
    }
    if (data.share !== undefined && (query.kind === "flood" || query.kind === "above")) {
      const isFlood = query.kind === "flood";
      const title = `海拔 ${query.metres} 米${isFlood ? "以下" : "以上"}`;
      const side = data.landforms!.filter((item) => (isFlood ? !item.above : item.above));
      const facts = `<p>${isFlood ? "低于" : "高于"} ${query.metres} 米的陆地约占全国陆地面积的 <b>${pct(data.share)}</b>。</p>`;
      if (!reveal) return { title, body: `${facts}<p>哪些地形区在${isFlood ? "水面以下" : "等高面以上"}？先预测再看。</p>` };
      const names = side.length ? side.map((item) => `${item.name}（约 ${item.metres} 米）`).join("、") : "参照的十个地形区都不在其中";
      const note = isFlood
        ? `<p class="lang-warn">这是“海拔低于某值”的几何演示，不是海平面上升预测。</p>`
        : `<p class="lang-ok">露出等高面的就是高于 ${query.metres} 米的土地；等高线，就是这个面与地形相交的线。</p>`;
      return { title, body: `${facts}<p>${isFlood ? "在水面以下" : "在等高面以上"}的：${names}。</p>${note}` };
    }
    const pin = data.pin!;
    const tier = tierOf(pin.metres);
    return {
      title: "坐标就是地址",
      body: `<p>“东经、北纬”是全世界通用的位置语言。这一点海拔约 <b>${Math.round(pin.metres)} 米</b>${pin.inside ? `，按本课约定属于${TIER_NAME[tier]}` : "，在国界之外"}。</p><p>（约 5 km 网格的平均值——山峰被“削平”了：数据的语言也有精度）</p>`,
    };
  };

  const refresh = () => {
    const box = document.querySelector<HTMLElement>("#geo-data");
    if (!box) return;
    const parsed = current();
    if (!unlocked) { box.innerHTML = "<small>数据卡</small><p>先在下面锁定预测，数据才会出现。</p>"; box.dataset.ready = "false"; return; }
    const data = parsed.ok ? measure(parsed.params) : undefined;
    box.dataset.ready = String(Boolean(data));
    if (!data) { box.innerHTML = "<small>数据卡</small><p>先在“语言”框里写一句能读懂的地理指令。</p>"; return; }
    const rows: Array<[string, string]> = data.profile
      ? [["最高", `${Math.round(data.profile.max.metres)} 米`], ["依次", order(data.profile)], ["三级阶梯", data.profile.staircase ? "是" : "否"],
        ["分界", data.profile.boundaries.map((b) => `${b.from}→${b.to} ${deg(b.at)}`).join("；") || "—"]]
      : data.share !== undefined
        ? [["面积占比", pct(data.share)], ["地形区", data.landforms!.filter((item) => (parsed.params.kind === "flood" ? !item.above : item.above)).map((item) => item.name).join("、") || "无"]]
        : [["海拔", `${Math.round(data.pin!.metres)} 米`], ["境内", data.pin!.inside ? "是" : "否"]];
    box.innerHTML = `<small>数据卡 · ${data.label}</small><dl class="lx-metrics">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  };

  const TASK_PRESET: Record<string, string> = {
    "west-east": "沿北纬 35° 做一条东西向剖面",
    counter: "沿北纬 40° 做一条东西向剖面",
    basin: "沿北纬 31° 做一条东西向剖面",
    share: "海拔 500 米以下",
  };
  let lastStep = "";
  const QUICK: Array<[string, string]> = [
    ["北纬 35°", "沿北纬 35° 做一条东西向剖面"], ["北纬 33°", "沿北纬 33° 做一条东西向剖面"], ["北纬 31°", "沿北纬 31° 做一条东西向剖面"],
    ["北纬 40°", "沿北纬 40° 做一条东西向剖面"], ["3000 米以上", "海拔 3000 米以上"], ["500 米以下", "海拔 500 米以下"],
    ["四川盆地", "定位 东经 105.5°，北纬 30°"],
  ];

  return renderLangLab<GeoQuery>({
    id: "geo",
    subject: "地理",
    title: "用坐标说话",
    subtitle: "经纬度、海拔、剖面线，是地理学描述大地的语言。说一句地理的话，全国三维地形立刻回答你。",
    accent: "#57d8ff",
    language: "地理语言 · 经纬度 / 海拔 / 剖面",
    roles: {
      frame: { label: "坐标系", color: "#57d8ff" },
      number: { label: "数值", color: "#ffd38a" },
      action: { label: "操作", color: "#c58bff" },
    },
    variants: [
      { label: "北纬 35° 剖面", text: "沿北纬 35° 做一条东西向剖面" },
      { label: "北纬 31° 剖面", text: "沿北纬 31° 做一条东西向剖面" },
      { label: "东经 104° 剖面", text: "沿东经 104° 做一条南北向剖面" },
      { label: "3000 米以上", text: "海拔 3000 米以上" },
      { label: "500 米以下", text: "海拔 500 米以下" },
      { label: "海平面上升 100 米", text: "海平面上升 100 米" },
      { label: "珠峰坐标", text: "定位 东经 86.9°，北纬 27.99°" },
    ],
    parse: (text) => {
      const { query, tokens } = parseGeo(text);
      return query
        ? { ok: true, params: query, tokens }
        : { ok: false, params: { kind: "above", metres: 3000 }, tokens, message: "试试：“沿北纬 35° 做一条东西向剖面”“海拔 2000 米以上”“海平面上升 50 米”“东经 116.4°，北纬 39.9°”。" };
    },
    mount: async (stage) => { scene = await mountGeo(stage); return scene; },
    explain: ({ params }, reveal) => explainQuery(params, reveal),
    question: "课本上的“三级阶梯”是一张图；一句“沿北纬 31° 剖开”是一个指令。哪一个更能让学生自己去发现——包括发现课本说法的边界？",
    disclaimer: `地形为公开 DEM（约 5 km 网格，垂直夸张 30 倍），国界按 DataV 标准画法；阶梯分级按本课约定（≥${TIER_LIMITS.first} / ${TIER_LIMITS.second}–${TIER_LIMITS.first} / <${TIER_LIMITS.second} 米），面积占比为 0.5° 网格估算；地形区代表点：${LANDFORMS.length} 处。仅作教学示意，不作为行政区划与边界依据。`,
    fallbackVideo: "media/geo-demo.mp4",
    rows: 1,
    inquiry: {
      design: geoLesson,
      columns: (task) => task.id === "share"
        ? [{ key: "query", label: "查询" }, { key: "share", label: "面积占比" }, { key: "landforms", label: "地形区" }]
        : [{ key: "query", label: "查询" }, { key: "max", label: "最高" }, { key: "order", label: "依次" }, { key: "staircase", label: "三级阶梯" }],
      capture: ({ params }) => {
        const data = measure(params);
        return {
          query: labelOf(params),
          max: data?.profile ? `${Math.round(data.profile.max.metres)} 米` : data?.pin ? `${Math.round(data.pin.metres)} 米` : "—",
          order: data?.profile ? order(data.profile) : data?.pin ? `第${tierOf(data.pin.metres)}级` : "—",
          staircase: data?.profile ? (data.profile.staircase ? "是" : "否") : "—",
          share: data?.share !== undefined ? pct(data.share) : "—",
          landforms: data?.landforms ? data.landforms.filter((item) => (params.kind === "flood" ? !item.above : item.above)).map((item) => item.name).join("、") || "无" : "—",
        };
      },
      controls: (api) => {
        current = api.current;
        return {
          html: `
            <div class="geo-controls">
              <div class="lx-segment geo-chips" role="group" aria-label="常用指令">${QUICK.map(([label], index) => `<button data-geo-quick="${index}">${label}</button>`).join("")}</div>
              <form class="geo-command" id="geo-command"><input id="geo-input" type="text" autocomplete="off" spellcheck="false" aria-label="地理指令" placeholder="例：沿北纬 33° 做一条东西向剖面"><button type="submit">执行</button></form>
              <div class="readout gv-data" id="geo-data" aria-live="polite"></div>
            </div>`,
          bind: (root) => {
            const field = root.querySelector<HTMLInputElement>("#geo-input")!;
            const onClick = (event: Event) => {
              const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-geo-quick]");
              if (!button) return;
              const text = QUICK[Number(button.dataset.geoQuick)][1];
              field.value = text;
              api.setText(text);
            };
            const onSubmit = (event: Event) => { event.preventDefault(); if (field.value.trim()) api.setText(field.value.trim()); };
            root.addEventListener("click", onClick);
            root.querySelector("#geo-command")!.addEventListener("submit", onSubmit);
            return () => root.removeEventListener("click", onClick);
          },
          refresh,
        };
      },
      onChange: (task, phase, api) => {
        unlocked = phase !== "predict";
        const step = `${task.id}:${phase}`;
        if (phase === "operate" && step !== lastStep && TASK_PRESET[task.id]) {
          api.setText(TASK_PRESET[task.id]);
          const field = document.querySelector<HTMLInputElement>("#geo-input");
          if (field) field.value = TASK_PRESET[task.id];
        }  // 任务预设只在进入操作阶段时执行一次
        lastStep = step;
        refresh();
      },
    },
  });
}
