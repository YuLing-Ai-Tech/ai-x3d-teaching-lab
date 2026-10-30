# 智境 AI × 3D 教学实验室

![YuLing AI Logo](./yuling-logo.svg)

**毓灵 YuLing AI · AI × 3D Teaching Lab**

面向小学、初中和高中的本地优先 3D 教学实验项目。公开基线完整保留 2026 年 10 月 29 日高中教师培训系统的代码、教学设计和 15 个案例；受限地图与大型火山资产保存在本地私有资产层，不进入公开 Git 历史。

## 开课

1. 完整本地项目双击 `start-class.command`，或运行 `npm run classroom`。
2. 脚本会显示局域网地址和二维码，并打开讲师首页。
3. 手机与本机连接同一 Wi-Fi 后扫码访问。
4. 主课件用方向键翻页，`F` 进入全屏。

冻结版应急启动：双击 `start-frozen.command`。它只需要系统 Python，直接提供已验收的 `dist`，不会在开课前重新构建；首页仍会按局域网地址生成手机二维码。

课堂不需要互联网。来源页包含可点击的外部参考链接，但案例运行不主动请求它们。

公开仓库的无资产模式使用 `npm run dev`；它不会下载或伪造受限素材。项目容器内可运行 `npm run dev:local` 挂载 `private-assets/`，恢复长征、地理和火山的完整课堂体验。

## 内容

讲课顺序由 `src/content/catalog.ts` 统一管理（15 个案例）；主课件 `#/deck` 18 页，从第 N 页进入案例后可一键回到第 N 页。

重点案例（含初中 / 高中两档、课标与目标、预测 → 操作 → 证据 → 解释 → 评价、教师提示与 30 秒回退）：

- `#/conic`：圆锥曲线实验台——平面与双圆锥真实求交、Dandelin 双球、焦点与准线、摊平的直角坐标方程。
- `#/membrane`：细胞膜运输实验舱——随机穿膜模型、双向计数、浓度曲线、载体饱和、ATP 依赖。
- `#/blender`：Vulcanian 火山——Blender 重建的地形与地质剖面、七阶段喷发、五步精确提示词。
- `#/long-march`：长征 3D 地形叙事（视觉与交互标杆）。

其余：AI 认知（词向量、下一个词）、语言编译台、各学科“语言 ↔ 世界”案例、`#/workshop` 语言规格书工作坊、`#/cards` 方法卡、`#/sources` 来源台账。

页面按路由按需加载：首屏 JS 约 43 KB，Three.js / MapLibre / deck.gl 只在用到的页面下载。

## 验证

```bash
npm run verify
```

该命令依次运行单元测试、生产构建、首屏体积检查、离线资源检查、文件长度检查、媒体检查与 1920×1080 / 390×844 两套浏览器测试（`scripts/run-e2e.mjs`；全部用例结束后若 Playwright 20 秒内仍未退出，由 `scripts/e2e-exit-guard.mjs` 按实际结果退出）。

## 录像

`npm run record:web` 从最终生产站点录制 12 个 Web 案例的备用录像。默认每条约 60–65 秒；快速验证可使用 `VIDEO_STEP_MS=200 npm run record:web`。

Blender 的生成、现场修改与录像说明见 `blender/README.md`。

## 项目与 worktree

- `main/` 是唯一集成工作区。
- `worktrees/` 中每个目录只对应一个实验或明确修复。
- 学段属于产品内容，不属于永久分支；当前迁入案例标记为 `high`。

## 开源和品牌边界

- 代码与文档采用 Apache-2.0，见 `LICENSE`。
- YuLing、YuLing AI、毓灵及相关 Logo 不随 Apache-2.0 授权，见 `TRADEMARKS.md`。
- 可公开资产记录在 `assets/manifest.json`；本地完整资产和迁移排除项见 `BASELINE_MANIFEST.md`。
