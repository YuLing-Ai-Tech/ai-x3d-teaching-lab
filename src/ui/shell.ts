export function shell(content: string): string {
  return `
    <header class="topbar">
      <a class="brand" href="#/" aria-label="毓灵 YuLing AI · 智境 AI × 3D 教学实验室首页">
        <img src="./brand/yuling-logo.svg" alt="">
        <span><small>毓灵 YuLing AI</small>智境 AI × 3D 教学实验室</span>
      </a>
      <nav aria-label="主导航">
        <a href="#/deck">主课件</a>
        <a href="#/workshop">工作坊</a>
        <a href="#/cards">方法卡</a>
        <a href="#/sources">来源</a>
      </nav>
    </header>
    <main>${content}</main>
  `;
}

export function labShell(options: {
  subject: string;
  title: string;
  subtitle: string;
  disclaimer: string;
  controls: string;
  accent: string;
  fallbackVideo: string;
}): string {
  return shell(`
    <section class="lab" style="--accent:${options.accent}">
      <div class="stage" id="stage" aria-label="${options.title}三维演示区">
        <div class="stage-overlay">
          <div class="stage-title">
            <span class="badge">${options.subject}</span>
            <h1>${options.title}</h1>
            <p>${options.subtitle}</p>
          </div>
          <div class="stage-caption" id="stage-caption" aria-live="polite"></div>
        </div>
      </div>
      <aside class="control-panel">
        ${options.controls}
        <a class="button-link fallback-link" href="./${options.fallbackVideo}" target="_blank">播放备用录像</a>
        <p class="source-note">${options.disclaimer}</p>
      </aside>
    </section>
  `);
}
