import QRCode from "qrcode";
import { catalog } from "../content/catalog";
import { shell } from "../ui/shell";
import { assetMode, privateAssetCases } from "../runtime/assetMode";

export function renderHome(): void {
  const total = catalog.reduce((sum, section) => sum + section.cases.length, 0);
  const sections = catalog.map((section) => `
    <section class="section">
      <div class="section-head">
        <div><span class="eyebrow">${section.kicker}</span><h2>${section.title}</h2></div>
        <p class="section-intro">${section.intro}</p>
      </div>
      <div class="case-grid">${section.cases.map((entry) => `
        <a class="case-card" data-case-link data-local-assets="${privateAssetCases.has(entry.route)}" href="#/${entry.route}" style="--case:${entry.accent}">
          <span class="case-number">${entry.subject}</span>
          <h3>${entry.title}</h3>
          <p>${entry.line}</p>
        </a>`).join("")}
      </div>
    </section>`).join("");

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-brand"><img src="./brand/yuling-logo.svg" alt="YuLing AI Logo"><span>毓灵 YuLing AI</span></div>
        <div class="eyebrow">智境 AI × 3D 教学实验室 · 高中公开基线</div>
        <h1>说清楚，<br>世界就出现</h1>
        <p>大语言模型，就是语言的模型。中文、英文、数学、代码都是表达关系的语言——以语言为核心的逻辑思维，是 AI 时代教育的重点。</p>
        <div class="hero-actions">
          <a class="button-link button-primary" href="#/deck">开始主课件</a>
          <a class="button-link" href="#/compiler">语言编译台</a>
          <a class="button-link" href="#/workshop">写我的规格书</a>
        </div>
        <div class="hero-metric">
          <div><strong>1</strong>天完整课程</div>
          <div><strong>${total}</strong>个 3D 案例</div>
          <div><strong>0</strong>云端依赖</div>
          <div><strong>${assetMode === "local-full" ? "完整" : "公开"}</strong>资产模式</div>
        </div>
      </div>
    </section>
    ${sections}
    <section class="section" id="phone-entry">
      <div class="section-head">
        <div><span class="eyebrow">手机端入口</span><h2>扫码进入同一课堂</h2></div>
        <p class="section-intro">二维码根据当前局域网地址生成。内容只在浏览器本地运行，工作坊内容只写入本机 localStorage。</p>
      </div>
      <div style="display:flex;align-items:center;gap:2rem;flex-wrap:wrap"><img id="classroom-qr" width="220" height="220" alt="课堂局域网二维码" style="background:white;padding:12px" /><code id="classroom-url"></code></div>
    </section>
  `);
  const classroomUrl = `${location.origin}${location.pathname}`;
  document.querySelector("#classroom-url")!.textContent = classroomUrl;
  void QRCode.toDataURL(classroomUrl, { width: 440, margin: 1, color: { dark: "#061019", light: "#ffffff" } })
    .then((url) => { document.querySelector<HTMLImageElement>("#classroom-qr")!.src = url; });
}
