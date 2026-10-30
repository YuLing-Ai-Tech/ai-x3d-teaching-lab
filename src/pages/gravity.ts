import { gravityLesson } from "../content/lessons/gravity";
import { FATE_LABEL, PLANET_ORBITS, formula, parseGravity, predictOrbit, simulateOrbit, type GravityLaw, type OrbitReport } from "../domain/gravity";
import { mountGravity, type GravityScene } from "../scenes/gravity";
import { renderLangLab, type LangLabApi } from "../ui/langLab";
import "../styles/inquiry.css";

// 物理 · 一句话定义引力：一个词（平方 / 立方）就是宇宙稳定与崩溃的差别。
// 探究层：预测锁定前模型不运行；证据（结局、近/远日点、进动、能量误差）全部来自 simulateOrbit()。

const fmt = (value: number | undefined, digits = 2) => (value === undefined || !Number.isFinite(value) ? "—" : (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits));  // 不显示 “−0.0”
const exponentKey = (n: number) => String(Number(n.toFixed(2)));
const massText: Record<string, string> = { "0.5": "中心天体质量减半，", "1": "", "2": "中心天体质量加倍，" };

function lawText(exponent: number, mass: number): string {
  const prefix = massText[String(mass)] ?? "";
  if (exponent === -1) return `${prefix}引力与距离成正比`;
  if (exponent === 1) return `${prefix}引力与距离成反比`;
  if (exponent === 2) return `${prefix}引力与距离的平方成反比`;
  if (exponent === 3) return `${prefix}引力与距离的立方成反比`;
  return `${prefix}引力与距离的 ${exponentKey(exponent)} 次方成反比`;
}

export function renderGravity(): Promise<() => void> {
  let scene: GravityScene | undefined;
  let tracked = 2;
  let speed = 1;
  let unlocked = false;
  let cache: { key: string; report: OrbitReport } | undefined;
  const report = (law: GravityLaw) => {
    const key = `${law.exponent}|${law.mass}|${tracked}|${speed}`;
    if (cache?.key !== key) cache = { key, report: simulateOrbit(law, tracked, speed) };
    return cache.report;
  };
  let apiRef: LangLabApi<GravityLaw> | undefined;

  const controls = (api: LangLabApi<GravityLaw>) => {
    apiRef = api;
    return {
    html: `
      <div class="gv-controls">
        <div class="lx-segment" role="group" aria-label="定律">
          <button data-law="2">平方</button><button data-law="2.1">2.1 次方</button><button data-law="3">立方</button><button data-law="1">一次方</button><button data-law="-1" class="gv-senior">正比</button>
        </div>
        <label class="gv-senior" for="gv-exponent">距离幂次 n <output id="gv-exponent-out">2</output></label>
        <input class="gv-senior" id="gv-exponent" type="range" min="1.5" max="3.5" step="0.05" value="2">
        <div class="lx-segment" role="group" aria-label="中心质量"><span class="gv-label">中心质量</span><button data-mass="0.5">×0.5</button><button data-mass="1" aria-pressed="true">×1</button><button data-mass="2">×2</button></div>
        <label class="gv-senior" for="gv-speed">初速度倍数 <output id="gv-speed-out">1.00</output></label>
        <input class="gv-senior" id="gv-speed" type="range" min="0.7" max="1.3" step="0.01" value="1">
        <label for="gv-planet">观测行星</label>
        <select id="gv-planet">${PLANET_ORBITS.map((planet, index) => `<option value="${index}" ${index === tracked ? "selected" : ""}>${planet.name}</option>`).join("")}</select>
        <div class="readout gv-data" id="gv-data" aria-live="polite"></div>
      </div>`,
    bind: (root: HTMLElement) => {
      const exponent = root.querySelector<HTMLInputElement>("#gv-exponent")!;
      const speedInput = root.querySelector<HTMLInputElement>("#gv-speed")!;
      const current = () => api.current().params;
      const onClick = (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
        if (!button) return;
        if (button.dataset.law) api.setText(lawText(Number(button.dataset.law), current().mass));
        if (button.dataset.mass) api.setText(lawText(current().exponent, Number(button.dataset.mass)));
      };
      const onInput = (event: Event) => {
        const target = event.target as HTMLInputElement;
        if (target === exponent) api.setText(lawText(Number(exponent.value), current().mass));
        if (target === speedInput) { speed = Number(speedInput.value); scene?.setSpeedFactor(speed); refreshData(); }
        if (target.id === "gv-planet") { tracked = Number(target.value); scene?.setTracked(tracked); refreshData(); }
      };
      root.addEventListener("click", onClick);
      root.addEventListener("input", onInput);
      return () => { root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); };
    },
    refresh: () => refreshData(),
    };
  };

  const refreshData = () => {
    const box = document.querySelector<HTMLElement>("#gv-data");
    if (!box || !apiRef) return;
    const law = apiRef.current().params;
    document.querySelector<HTMLOutputElement>("#gv-exponent-out")!.value = exponentKey(law.exponent);
    document.querySelector<HTMLOutputElement>("#gv-speed-out")!.value = speed.toFixed(2);
    document.querySelectorAll<HTMLButtonElement>("[data-mass]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.mass) === law.mass)));
    document.querySelectorAll<HTMLButtonElement>("[data-law]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.law) === law.exponent)));
    if (!unlocked) {
      box.innerHTML = `<small>观测数据</small><p>先在下面锁定预测，模型才会运行、数据才会出现。</p>`;
      box.dataset.ready = "false";
      return;
    }
    const r = report(law);
    box.dataset.ready = "true";
    box.dataset.fate = r.fate;
    box.innerHTML = `<small>观测数据 · ${PLANET_ORBITS[tracked].name}（模型单位）</small><strong>${FATE_LABEL[r.fate]}</strong>
      <dl class="lx-metrics">
        <div><dt>近日点</dt><dd>${fmt(r.perihelion)}</dd></div><div><dt>远日点</dt><dd>${fmt(r.aphelion)}</dd></div>
        <div><dt>每圈进动</dt><dd id="gv-precession">${r.precession === undefined ? "—" : `${fmt(r.precession, 1)}°`}</dd></div>
        <div><dt>理论（近圆）</dt><dd>${r.theoryPrecession === undefined ? "—" : `${fmt(r.theoryPrecession, 1)}°`}</dd></div>
        <div><dt>近日点次数</dt><dd>${r.periapses}</dd></div><div><dt>能量误差</dt><dd>${(r.energyError * 100).toFixed(3)}%</dd></div>
      </dl>
      <p>${r.fate !== "stable" ? `第 ${fmt(r.time, 1)} 个时间单位${FATE_LABEL[r.fate]}。` : r.precession === undefined ? "近圆轨道：近日点不明显，换一颗偏心的行星观测。" : Math.abs(r.precession) < 0.5 ? "近日点每圈几乎不动：轨道闭合。" : `近日点每圈${r.precession > 0 ? "前进" : "后退"} ${fmt(Math.abs(r.precession), 1)}°：轨道不闭合。`}</p>`;
  };

  return renderLangLab<GravityLaw>({
    id: "gravity",
    subject: "物理",
    title: "一句话定义引力",
    subtitle: "牛顿用一句话写下了宇宙的规则。把“平方”改成“立方”，再按下回车——你就是另一个宇宙的造物主。",
    accent: "#8a7bff",
    language: "中文 / English · 物理定律",
    roles: {
      object: { label: "物理量", color: "#7fe8ff" },
      relation: { label: "关系", color: "#c58bff" },
      quantity: { label: "幂次 / 倍数", color: "#ffd38a" },
    },
    variants: [
      { label: "牛顿 · 平方", text: "引力与距离的平方成反比" },
      { label: "差一点 · 2.1 次方", text: "引力与距离的 2.1 次方成反比" },
      { label: "立方", text: "引力与距离的立方成反比" },
      { label: "一次方", text: "引力与距离成反比" },
      { label: "正比", text: "引力与距离成正比" },
      { label: "English", text: "Gravity is inversely proportional to the square of distance" },
      { label: "质量加倍", text: "中心天体质量加倍，引力与距离的平方成反比" },
    ],
    parse: (text) => {
      const { law, tokens } = parseGravity(text);
      return law
        ? { ok: true, params: law, tokens }
        : { ok: false, params: { exponent: 2, mass: 1 }, tokens, message: "没读出引力随距离怎样变化。试试“与距离的平方成反比”“与距离成正比”。" };
    },
    mount: (stage) => { scene = mountGravity(stage); return scene; },
    explain: ({ params }, reveal) => {
      if (!reveal) {
        return { title: "这句话写下的规则", body: `<p class="math" style="font-size:1.25rem;margin:.2rem 0 .5rem">${formula(params)}</p><p>它会造出怎样的宇宙？先预测，再运行、记录证据——结论要由数据来说。</p>` };
      }
      const prediction = predictOrbit(params);
      return {
        title: "这句话写下的宇宙",
        body: `<p class="math" style="font-size:1.25rem;margin:.2rem 0 .5rem">${formula(params)}</p><p class="${prediction.tone === "ok" ? "lang-ok" : "lang-warn"}">${prediction.verdict}</p>`,
      };
    },
    question: "为什么偏偏是“平方”？用你记录的数据回答：结论是什么、证据是什么、背后的物理道理是什么。",
    disclaimer: "平面两体中心力模型：恒星固定、行星看作质点，忽略行星之间的引力与相对论效应；固定步长蛙跳积分（能量误差显示在数据里），时间与距离为模型单位。",
    fallbackVideo: "media/gravity-demo.mp4",
    inquiry: {
      design: gravityLesson,
      holdUntilPredicted: true,
      columns: (task) => task.id === "precession"
        ? [{ key: "n", label: "n" }, { key: "planet", label: "行星" }, { key: "precession", label: "进动" }, { key: "theory", label: "理论" }, { key: "energy", label: "能量误差" }]
        : task.id === "mass"
          ? [{ key: "n", label: "n" }, { key: "M", label: "M" }, { key: "fate", label: "结局" }, { key: "peri", label: "近日点" }, { key: "apo", label: "远日点" }]
          : [{ key: "n", label: "n" }, { key: "M", label: "M" }, { key: "fate", label: "结局" }, { key: "precession", label: "进动" }, { key: "energy", label: "能量误差" }],
      capture: ({ params }) => {
        const r = report(params);
        return {
          n: exponentKey(params.exponent), M: String(params.mass), v0: speed.toFixed(2), planet: PLANET_ORBITS[tracked].name,
          fate: FATE_LABEL[r.fate], peri: fmt(r.perihelion), apo: fmt(r.aphelion),
          precession: r.precession === undefined ? "—" : `${fmt(r.precession, 1)}°`,
          theory: r.theoryPrecession === undefined ? "—" : `${fmt(r.theoryPrecession, 1)}°`,
          energy: `${(r.energyError * 100).toFixed(3)}%`,
        };
      },
      controls,
      onChange: (_task, phase) => { unlocked = phase !== "predict"; refreshData(); },
      // 观测行星高亮与初速度倍数只属于“探究”；“语言”页签恢复原来的画面
      onTab: (tab) => {
        scene?.setSpeedFactor(tab === "language" ? 1 : speed);
        scene?.setTracked(tab === "language" ? -1 : tracked);
      },
    },
  });
}
