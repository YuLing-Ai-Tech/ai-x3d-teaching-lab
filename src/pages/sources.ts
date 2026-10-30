import { sources } from "../data/sources";
import { shell } from "../ui/shell";

export function renderSources(): void {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="sources-page">
      <span class="eyebrow">来源台账 · 访问日期 2026-10-14</span>
      <h1 class="page-title">事实与素材从哪里来</h1>
      <p class="section-intro">来源用于核对课堂表述。长征经纬度为公开地名的近似定位，只服务教学空间关系，不作测绘依据。</p>
      <div class="source-list">
        ${sources.map((source) => `<article class="source-entry"><b>${source.id} · ${source.organization}</b><h2>${source.title}</h2><p>${source.note}</p><a href="${source.url}" target="_blank" rel="noreferrer">打开原始来源</a></article>`).join("")}
      </div>
    </section>
  `);
}
