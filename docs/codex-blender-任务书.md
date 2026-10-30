# Codex 任务书：重做「Codex + Blender 彩蛋」

> 本任务由 Codex 独立完成，Claude 同时在主目录开发其他模块。**严格遵守第 5 节的文件边界**，否则会产生代码冲突。

## 0. 工作位置（必须）

- 只在 git worktree 中工作：`~/Documents/Project/培训课程/高中教师AI应用培训-codex-blender`，分支 `codex/blender`。
- **不要进入、读写主目录** `高中教师AI应用培训-20261029`（Claude 正在那里改代码）。
- `node_modules` 已用 APFS 克隆复制到 worktree，**不要 `npm install`，不要新增依赖**。
- 每完成一个阶段就 `git commit`（中文提交信息即可），**不要 merge、rebase 或 push**，合并由 Claude 负责。
- 端口：开发服务器用 `npx vite --port 5299 --strictPort`；e2e 用 `PW_PORT=4299 npx playwright test ...`。**不要用 5199 和 4173**（Claude 和课堂预览在用）。

## 1. 课程背景

- 课程：2026-10-29 高中教师 AI 应用培训，一整天。主线是“AI 时代语言为王”：AI 是大语言模型，中文、英文、数学、代码都是表达关系的语言；**以语言为核心的逻辑思维是 AI 时代教育的重点**。
- 本彩蛋是“方法与工作坊”章节的高潮：**一句话（自然语言）→ Codex → Blender 3D 场景随之改变**。要让老师直观感到：语言写得越精确，AI 做出的 3D 就越可控。
- 风格要求（用户原话）：“高级感、科技感、足够震撼、视觉冲击力”，写实场景“要真实质感”。用户评价现版本“完全没有做完，没有震撼的感觉”，要“高级、精细”。
- 技术栈：Vite + TypeScript + three@0.180（不加依赖）。Blender 5.2.2 LTS（`/opt/homebrew/bin/blender`），Apple Silicon，Cycles 可用 Metal GPU。站点必须**完全离线**运行（`npm run verify:offline`）。
- 现状：`blender/build_volcano.py` 用基础几何体拼了一座火山（锥体加球体，质感粗糙）；`src/pages/blender.ts` 只有两张卡片。相关：`blender/README.md`、`blender/live_edit.py`、`public/blender/*.blend`、`public/media/blender-*.mp4/png`。

## 2. 要做出的效果

### 2.1 Blender 场景：电影级火山剖面

用 Python 确定性生成（固定随机种子，任何时候重跑结果一致）。要求：

- **地形**：程序化位移的真实山体（噪声叠加侵蚀感），不是光滑圆锥；植被线、裸岩、火山渣、冷却熔岩分层材质；远景山脉和大气透视。
- **剖面**：一刀切开的截面上看到真实地质分层（沉积层、火山岩层的颜色和纹理），以及岩浆房 → 火山通道 → 火山口的连贯发光岩浆（温度渐变：暗红 → 橙 → 黄白），截面边缘干净。
- **喷发**：体积火山灰柱（Principled Volume + 噪声密度），火山弹或火花粒子，熔岩沿坡流下并带冷却硬壳。
- **光照**：只用物理光源（太阳、天空、岩浆自发光），HDRI 用程序化天空（Nishita/Sky Texture），不下载外部资产；加景深和轻微镜头光晕。
- **对象命名必须稳定、语义化**，因为课堂上要用自然语言点名修改。例如 `Magma_Chamber`、`Conduit`、`Ash_Column`、`Lava_Flow`、`Strata_*`、`Sun`、`Camera_Hero`、`Camera_Section`、`Camera_Orbit`。所有“可被语言修改的参数”集中写在场景自定义属性或一个 `CONTROLS` 字典里。

### 2.2 “一句话 → 一个变化”的五步演示序列

设计 **5 条递进的课堂提示词**，每条只改一个维度。每条都要先写“不精确说法”再写“精确说法”，体现语言为王。示例（可以改进）：

1. 镜头：“让我看看里面” → “切换到 Camera_Section，焦距 35mm，对准 Magma_Chamber”
2. 强度：“喷得猛一点” → “Magma_Chamber 发光强度 4→9，Ash_Column 密度 +60%，火花数量 ×2”
3. 时间：“换成晚上” → “太阳高度 35°→-4°，天空切换为夜晚，仅岩浆照明”
4. 地质：“标出地层” → “为 Strata_1..4 显示中文标签：沉积岩 / 凝灰岩 / 玄武岩 / 岩浆房”
5. 运镜：“转一圈” → “Camera_Orbit 在 6 秒内绕火山 360°，高度 12m，始终看向火山口”

每一步都要输出（用 `scripts/build-blender-*.py/sh` 或 `blender/*.py` 一键重建）：

- `public/media/blender/step-N.jpg`：1920×1080 成片静帧，Cycles 加降噪，**WebP 或 JPG 单张 ≤ 900KB**；
- `public/media/blender/step-N.mp4`：2–6 秒的过渡或运镜短片，H.264，`yuv420p`，`+faststart`，1920×1080，单个 ≤ 12MB；
- `public/media/blender/steps.json`：每步的模糊提示词、精确提示词、被修改的对象、参数的修改前和修改后数值（**由 Blender 脚本导出，不要手写**），以及媒体路径。

另外更新：

- 完成版总片 `public/media/blender-volcano-demo.mp4`（20–30 秒，作为备用录像）；
- `public/media/blender-live-edit-demo.mp4`（现场修改版）；
- 两张 poster 图；
- `public/blender/volcano-classroom.blend` 和 `volcano-live-edited.blend`。

**这些文件名是 e2e 和媒体检查依赖的，不要改名。**

新增媒体总量控制在 100MB 以内。渲染耗时写进交接文档。

### 2.3 网页 `#/blender`：全屏电影式讲台

- 首屏全屏播放成片（静音、自动播放、循环），叠加大标题和一句主张，例如“一句话，改变一座火山”。暗场高级排版，沿用 `:root` 的 `--bg/--gold/--cyan/--lava` 色板。
- “提示词终端”面板：
  - 逐字打出提示词，先打模糊说法，划掉后再打精确说法；
  - 显示“Codex → Blender”的执行日志动画，内容来自 steps.json 的参数差异，例如 `Magma_Chamber.emission 4 → 9`。
- 结果区：修改前后对比，可以拖动对比滑块，或交叉淡入淡出到 step-N.mp4。参数差异表要做数值滚动动画。
- 翻页笔和键盘：`PageDown`、`→`、空格进入下一步，`PageUp`、`←` 回到上一步；底部显示 1–5 步的进度点。
- **Esc 约定**：
  - 只有在关闭本页自己的弹层或全屏视频时，才 `event.preventDefault()`；
  - 其他情况不要拦截，由全站导航返回主课件；
  - 不要在 `window` 上注册 Esc 之外的全局监听而不清理。离开页面时要移除所有监听、暂停视频。
- 保留“现场真做”路径：
  - 一个折叠区“现场用 MCP 真改”，写清步骤（见 `blender/README.md`）；
  - 复制精确提示词的按钮；
  - 30 秒回退规则。
- 必须保留的元素（现有 e2e 依赖）：可见的链接“播放完成版”指向 `media/blender-volcano-demo.mp4`，可见的链接“播放修改版”；页面没有控制台错误。
- 不要改 `shell()`。顶栏的 `nav.case-nav`（返回主课件 · 第 N 页 / 上一个 / 下一个）由 `src/main.ts` 在渲染后插到 `.brand` 后面，**页面内容不能遮住顶栏**。
- 响应式：1920×1080 投屏是主场景，1366×768 不能遮挡或截断，390×844 手机可以纵向堆叠但不能横向滚动。中文标题用 `word-break: keep-all; text-wrap: balance`，避免单字掉行。

## 3. 质量标准

- 静帧拿出来要像专业概念渲染，不能看出是“几何体拼的”。如果某个效果做不精细，宁可去掉，也不要放粗糙版本。
- 所有手写源文件 ≤ 800 行（`npm run verify:files`），超过 400 行就拆分，例如拆成 `blender/volcano_terrain.py`、`blender/volcano_materials.py`、`blender/volcano_steps.py`。
- 运行时不请求任何外网资源。

## 4. 验收（在 worktree 内执行，全部通过才算完成）

```bash
npm run test && npm run build && npm run verify:offline && npm run verify:files && npm run verify:media
PW_PORT=4299 npx playwright test tests/e2e/blender.spec.ts
PW_PORT=4299 npx playwright test tests/e2e/course.spec.ts -g "blender|Blender"
```

- 新建 `tests/e2e/blender.spec.ts`，覆盖以下内容：
  - steps.json 能加载；
  - 翻页键能走完 5 步，进度点随之变化；
  - Esc 在没有弹层时会回到主课件（访问 `/#/blender?from=17`，按 Esc 后期望 URL 匹配 `#/deck?s=17`）；
  - 媒体链接有效；
  - 手机视口没有横向滚动。
- 用 Playwright 截图 1920×1080、1366×768、390×844 三种尺寸，每一步至少一张，存到 `.cache/codex-blender-shots/`。**逐张亲自检查**有没有遮挡、截断或单字掉行。

## 5. 文件边界（防冲突，最重要）

**只允许新建或修改：**

- `src/pages/blender.ts`；如需拆分，新建 `src/pages/blender/**`
- `src/styles/blender.css`（新建，在 blender.ts 里 `import "../styles/blender.css"`）
- `blender/**`
- `public/blender/**`、`public/media/blender/**`、`public/media/blender-*`
- `tests/e2e/blender.spec.ts`
- `scripts/build-blender-*`
- `docs/codex-blender-交接.md`

**禁止修改（Claude 负责）**：其他所有文件，尤其是：

- `src/main.ts`、`src/content/*`、`src/ui/*`、`src/three/*`、`src/data/*`、`src/style.css`
- `tests/e2e/course.spec.ts`、`tests/*.test.ts`
- `scripts/verify-*.mjs`、`package.json`、`package-lock.json`、`playwright.config.ts`、`index.html`

如果确实需要改上面的文件，比如要给 verify-media 加检查项，或修改 manifests 里的免责说明，**不要自己改**，把精确的修改内容写进 `docs/codex-blender-交接.md` 的“请 Claude 合并”一节。

## 6. 交接文档 `docs/codex-blender-交接.md`

需要写清：

- 改动文件清单；
- 每个重建命令和对应耗时；
- 五步提示词的最终文案；
- 课堂操作流程，包括现场 MCP 路径和回退方式；
- 已知不足；
- “请 Claude 合并”的修改清单；
- 验收命令的输出摘要。

完成后在最后一次 commit 信息里写“READY FOR MERGE”。
