# Codex + Blender 彩蛋返工交接（第 2 轮）

## 结论与范围

返工单第 1 节 9 项、渲染质量基线、页面小修和任务书验收命令均已实跑并通过。开工前已执行 `git merge main`，合并提交为 `3d5ca21`；没有 rebase、push 或合并到 main。除该次合并带入的主线文件外，本轮相对 `3d5ca21` 的改动全部位于任务书第 5 节允许范围。

最终场景是一整块连续剖切地形、程序化侵蚀远景山脊、900–1400 K Blackbody 深红—橙红岩浆系统、贴坡冷却熔岩、Principled Volume 火山灰柱和真实逐帧 Cycles 动画。网页标签来自 Blender 导出的二维锚点，不再使用 3D 中文文字。

## 返工单逐条验收

| # | 结果 | 我跑过 / 人工检查依据 |
|---:|:---:|---|
| 1 | PASS | `.cache/codex-blender-shots/renders-contact.jpg`：远景是噪声侵蚀山脊和雾化层次，没有圆锥、球体等基础几何轮廓。实现见 `blender/volcano_geometry.py`。 |
| 2 | PASS | 主山体为单个连续 `Volcano_Terrain` 位移实体和两块干净径向切面；地层由三维噪声/波纹材质表现，没有薄片堆叠、层间缝隙。联系表逐图目视通过。 |
| 3 | PASS | `Magma_Temperature` 节点链保留 900–1400 K Blackbody，并限制高亮、使用深红基色与橙红热点；最终联系表无粉色。岩浆房、弯曲通道和分支岩墙均为不规则形状；冷却熔岩按地形高度投影并以暗壳/亮裂缝表现。 |
| 4 | PASS | `Ash_Volume_Noise` 使用 Principled Volume 与 4D 噪声；增强后灰柱高度约为主山体两倍以上，上部受光、底部受岩浆红光影响。step 2 联系表中灰柱明显增高加密。 |
| 5 | PASS | `scripts/build-blender-verify.py` 实测 step 1/2 RGB MAE=`0.0308`（门槛 `0.025`）；联系表可直接看到灰柱、岩浆和火星增强。 |
| 6 | PASS | 128-sample 最终静帧亮度：step 3=`0.0820`、step 4=`0.0829`、step 5=`0.0851`，均 ≥`0.08`；月光下剖面层界仍可辨。首轮 `0.0758` 和中间生产预览 `0.07982` 均未冒充通过，调整后重做全量产物。 |
| 7 | PASS | 场景只渲染青色锚点；`world_to_camera_view` 把坐标写入 `steps.json`，网页 HTML 叠层显示“沉积岩、凝灰岩、玄武岩、岩浆房”。Playwright 验证 4 个锚点且包含“凝灰岩”。 |
| 8 | PASS | `ORBIT_OK frames=144 duration=6s safe=0.223,0.876,0.133,0.752`；逐帧安全框断言通过，联系表 step 5 中火山完整、居中。 |
| 9 | PASS | 缓存帧数为 step 1–4 各 96 帧、step 5 为 144 帧；step 1 是 Hero→Section 相机运动，step 2 是喷发参数增强，step 3 是昼夜过渡，step 4 是锚点逐个出现，step 5 是 360° 环绕。`VIDEO_OK ... source=real-Blender-Cycles-frames`。 |

## 渲染质量基线

| 项目 | 结果 | 证据 |
|---|:---:|---|
| Cycles + Metal | PASS | `configure_cycles()` 设置 Cycles、Metal/GPU；完整构建成功。 |
| 静帧 128 samples | PASS | `STEPS_OK count=5 samples=128 animations=4`。 |
| OpenImageDenoise | PASS | 最终 blend 读取结果：`DENOISER=OPENIMAGEDENOISE`，且 `use_denoising=True`。 |
| AgX | PASS | `AgX - Medium High Contrast`。 |
| 物理可信材质/光照 | PASS | 程序化地层、Blackbody 岩浆、Principled Volume、太阳/月光/岩浆补光；联系表人工检查通过。 |
| 总片与海报重做 | PASS | 两条总片、五条步骤片、五张静帧、poster、live-edit preview 和两个 blend 均由最终场景重建。 |

联系表：`.cache/codex-blender-shots/renders-contact.jpg`。我用看图方式检查了 5 张 step 静帧和 poster：无基础几何轮廓、无薄片缝隙、无粉色岩浆；体积烟柱可见，夜景层理可读，标签锚点和环绕构图正常。

## 主要实现

- `blender/volcano_geometry.py`：连续剖切地形、侵蚀山脊、不规则岩浆房/通道/岩墙、贴坡熔岩、体积灰柱、锚点和稳定相机。
- `blender/volcano_materials.py`：三维噪声地层、900–1400 K Blackbody 岩浆、冷却暗壳、Principled Volume。
- `blender/render_steps.py`：128-sample 静帧、四段 96 帧参数动画、二维标签锚点与 `steps.json`。
- `blender/render_orbit.py`：144 帧真实环绕和逐帧安全取景断言。
- `scripts/build-blender-videos.py`：只接受真实 Blender 帧序列，编码 1920×1080 H.264/yuv420p。
- `scripts/build-blender-verify.py`：尺寸、亮度、step 1/2 差异、标签坐标、视频编码/时长/体积、总媒体量和联系表门禁。
- `src/pages/blender.ts` / `src/styles/blender.css`：HTML 标签、剪贴板失败提示、按钮焦点空格保护、同页重渲自清理。
- `tests/e2e/blender.spec.ts`：增加坐标/标签、剪贴板失败、焦点空格、同页 hash 重渲竞态和三视口截图检查。

## 重建与实测

### 完整媒体重建

```bash
/usr/bin/time -p scripts/build-blender-assets.sh
```

我跑过并通过：

```text
BUILD_OK objects=196
STEPS_OK count=5 samples=128 animations=4
ORBIT_OK frames=144 duration=6s safe=0.223,0.876,0.133,0.752
VIDEO_OK steps=5 demo=26s live=22s source=real-Blender-Cycles-frames
RENDER_VERIFY_OK step-1=0.5443 step-2=0.5152 step-3=0.0820 step-4=0.0829 step-5=0.0851 mae12=0.0308 total=41.3MB
real 1256.88
```

### 无 MCP 的课堂修改生产路径

```bash
/usr/bin/time -p /opt/homebrew/bin/blender \
  public/blender/volcano-classroom.blend \
  --background --python blender/live_edit.py
```

我跑过：`LIVE_EDIT_OK magma=9.0 ash=0.51 sparks=160 camera=Camera_Section lens=35`，`real 9.19`。随后再次运行渲染验证器，`RENDER_VERIFY_OK`，最终媒体合计 `41.5MB`。

## 页面和课程验收

```bash
npm run test && npm run build && npm run verify:offline && npm run verify:files && npm run verify:media
```

- 我跑过：2 个测试文件、20 个单测通过。
- 我跑过：TypeScript + Vite 构建成功。
- 我跑过：offline、file length、media verification 全部通过。
- 构建仅报告既有约 2.74MB 主 chunk 警告。

```bash
PW_PORT=4299 npx playwright test tests/e2e/blender.spec.ts
```

- 我跑过：20/20 通过；`.last-run.json` 为 `passed`。
- 覆盖五步数据、二维标签、焦点空格、剪贴板失败、键盘/Esc、媒体离线读取、390px 溢出、同页 hash 重渲竞态和 15 张截图。
- 新截图已重新拼接为 `contact-1920.png`、`contact-1366.png`、`contact-390.png` 并看图检查；三种视口的标题、正文、参数与图像均一致，无第 4/5 步串写。

```bash
PW_PORT=4299 npx playwright test tests/e2e/course.spec.ts -g "blender|Blender"
```

- 我跑过：`4 passed (8.3s)`；桌面/手机均无控制台错误，完成版与修改版链接可用。

## 设计批判记录

问题证据：返工前联系表可直接看到圆锥背景、薄片地层、粉色规则岩浆、网格烟团、近似静态短片和过暗夜景；返工中自动门禁又实测发现夜景亮度不足，网页截图发现同页重渲串写。

| 方案 | 成本与副作用 | 评分 | 结论 |
|---|---|---:|---|
| 保留旧几何，只调材质/阈值 | 成本低，但轮廓、连续性、动画真实性和视觉问题仍存在 | 24 | 拒绝 |
| 导入外部扫描资产/HDRI | 可能更写实，但破坏离线、可重建和确定性要求 | 35 | 拒绝 |
| 连续程序化地形 + 物理节点 + 真实帧动画 + 自动/目视双门禁 | 渲染成本高（约 21 分钟），但问题可验证、产物可离线重建 | 95 | 采用 |
| 仅把夜景门槛降到 `0.075` | 无需重渲，但掩盖返工单明确失败 | 5 | 拒绝；提高曝光并全量重渲 |
| 只改截图等待时间掩盖串写 | 不修实际监听/定时器残留 | 12 | 拒绝；增加实例自清理和回归测试 |

## 已知限制与非目标

- 场景使用程序化几何/节点，没有外部扫描贴图或 HDRI；优点是完全离线、确定性、可重建，细节不等同于影视资产库。
- 为控制离线包体和约 21 分钟构建时间，step 1–4 动画用 Cycles 4 samples、50% 渲染后 Lanczos 放大到 1920×1080；它们仍是 Blender 真实参数动画帧，不是静帧推拉。静帧为原生 1920×1080、128 samples。
- 我跑过 `live_edit.py` 的生产形状路径；课堂 MCP 插件与 Codex 的实时网络握手未在无人值守验收中执行，课前仍应按 README 彩排并保留 30 秒录像回退。
- Vite 主 chunk 警告未在本任务范围内处理。

## 请 Claude 合并时补一行

`src/main.ts` 受第 5 节保护，本 worktree 未修改。当前 `renderBlender()` 已能自清理重复实例并在离页时自行释放；为与其他路由生命周期一致，合并时仍建议把：

```ts
else if (path === "blender") renderBlender();
```

改为：

```ts
else if (path === "blender") cleanup = renderBlender();
```

`scripts/verify-media.mjs` 同样受保护，本轮未改；步骤片/JPG 的专用媒体门禁已由 `scripts/build-blender-verify.py` 覆盖。

## 第 3 轮（Claude，2026-10-16）

用户审查第 2 轮联系表后，认为画面仍不够“高级、精细”：

- 火山主体像光滑的玩具楔形；
- 地层像大理石纹；
- 远景是有台阶感的低多边形；
- 岩浆房像一串浆果，通道像塑料管。

于是由 Claude 在 Mac 上重做 `blender/volcano_geometry.py` 和 `blender/volcano_materials.py`，设计说明见 `blender/README.md` 的“场景设计”一节。

页面、`steps.json` 导出、标签投影、视频编码、校验脚本和 e2e 全部沿用第 2 轮。对象名、材质名和节点名保持不变。

### 本轮其他改动

- `render_steps.py`：
  - 发光改为平方映射，并同步缩放岩浆补光；
  - 夜景改为新的摄影棚世界节点；
  - 第 2 步灰柱长高 1.35 倍；
  - 色彩管理改为 Filmic。表格中原先的“AgX PASS”作废，原因见 README。
- `render_orbit.py`、`volcano_config.py`：环绕中心改为 y = 6，半径 52。
- `build-blender-verify.py`：第 1/2 步的差异只在中央岩浆/灰柱区域计算。
- 修正 Cycles 保留属性名 `heat` 导致岩浆始终不发光的问题。第 1、2 轮的岩浆其实只有裂缝在发光，所以看起来像瓷砖。
