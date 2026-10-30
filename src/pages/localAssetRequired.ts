import { shell } from "../ui/shell";

const labels: Record<string, string> = {
  "long-march": "长征 3D 地形叙事",
  blender: "Codex + Blender 火山",
  geo: "用坐标说话",
};

export function renderLocalAssetRequired(route: string): void {
  const title = labels[route] ?? "本地完整案例";
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="asset-required" role="status">
      <img src="./brand/yuling-logo.svg" alt="YuLing AI Logo">
      <span class="eyebrow">PUBLIC CORE · 本地资产未挂载</span>
      <h1>${title}</h1>
      <p>该案例的代码已经开源，但地图、视频或 Blender 大型资产不随公开仓库分发。这里不会伪造数据，也不会在运行时从互联网下载替代素材。</p>
      <p>在项目容器内执行 <code>npm run assets:setup</code>，再使用 <code>npm run dev:local</code> 或 <code>npm run classroom</code> 即可进入完整课堂模式。</p>
      <div class="hero-actions"><a class="button-link button-primary" href="#/">返回实验目录</a><a class="button-link" href="#/sources">查看来源与边界</a></div>
    </section>
  `);
}
