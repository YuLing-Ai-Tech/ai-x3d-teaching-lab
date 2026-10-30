# Blender 火山：一次 Vulcanian 喷发（2026-10-26 重建）

## 环境

- Blender 5.2.2 LTS：`/opt/homebrew/bin/blender`（Cycles + Metal，Mantaflow 自带）
- 课堂 MCP：`ahujasid/mcp-for-blender`，只连 `localhost:9876`，`BLENDER_MCP_SAFE_MODE=1`，`DISABLE_TELEMETRY=true`
- 外部资产（CC0，只放在本机 `.cache/assets/`，约 26 GB，不进 git；缺少时自动退回程序化版本）：
  - JangaFX EmberGen 免费 VDB：`jangafx-smoke-plume/`（灰柱）、`jangafx-dust-shockwave/`（破裂尘环）、`jangafx-ground-explosion/`（破裂炽热爆发）、`jangafx-cloud-pack/`（积云）；`FirePlumeVDB.zip` 已下载未使用
  - Poly Haven：`polyhaven/hdri/kloppenheim_06_puresky_4k.exr`（天空）、`polyhaven/aerial_rocks_02/`（岩石明暗与法线）
- 地形、剖面、火山弹、余烬、岩塞全部由脚本生成。

## 一键重建

```bash
VOLCANO_RES=192 scripts/build-blender-assets.sh              # 教学五步，约 2.2 小时
VOLCANO_RES=192 CINEMATIC=1 scripts/build-blender-assets.sh  # 另加电影版，约再 3–5 小时
scripts/build-blender-assets.sh --preview  # 低分辨率快速版（检查流程用）
```

阶段与产物（耗时写入 `.cache/volcano-build/timing.txt`）：

| 阶段 | 脚本 | 产物 |
|---|---|---|
| 场景 | `build_volcano.py` | `public/blender/volcano-classroom.blend`、`textures/`、`anchors.json` |
| 烘焙 | `bake_plume.py` | `.cache/volcano-bake/`（Mantaflow 灰柱，不进 git） |
| 渲染 | `render_steps.py` | `public/media/blender/step-1..5.jpg`、`steps.json`、`.cache/volcano-frames/` |
| 编码 | `scripts/build-blender-videos.py` | `step-1..5.mp4`、完成版、修改版 |
| 预演 | `live_edit.py` | `volcano-live-edited.blend`、预览图，末行 `LIVE_EDIT_OK` |
| 电影版（CINEMATIC=1） | `cinematic.py` + `scripts/build-blender-cinematic.py` | `.cache/cinematic/shot-N/` → `public/media/volcano-cinematic.mp4` |
| 发布 | `publish_blend.py` | 两个 `.blend` 抽稀为轻量版（约 40 MB），清缓存 |
| 验收 | `scripts/build-blender-verify.py` | `.cache/volcano-shots/` 联系表，末行 `RENDER_VERIFY_OK` |

## 模块

- `volcano_config.py`：唯一参数源——`TIME_SCALE`（画面时间压缩 5 倍）、七个喷发阶段 `PHASES`、物理参数 `ERUPTION`、课堂参数 `CONTROLS`、五步提示词 `STEPS`。
- `terrain.py`：1 单位 = 100 m 的 12 km 高度场。非对称下凹锥体 + Somma 式古火山缘 + 北翼侧翼塌陷马蹄形洼地与碎屑丘 + 寄生锥 + 放射状冲沟 + 向量化水滴侵蚀 + 火口与英安岩岩塞 + 老块状熔岩流（侧堤、厚前缘）。
- `geology.py`：y = 0 剖面的地质图（numpy 绘制）。片麻岩基底、褶皱并被两条断层错开的沉积层、不整合面、透镜状尖灭的熔岩/火山碎屑互层、闪长岩体、晶粥岩浆房（熔体透镜 + 结晶外壳 + 接触变质晕）、雁列状岩墙与岩床、带冷凝边的火山通道、岩塞、热液蚀变带。同时输出热图（驱动黑体发光）和 11 个结构的锚点。
- `surface.py`：由坡度、高程、汇流量、风向推出地表颜色（植被带、裸露火山渣、冲沟、新鲜火山灰、硫黄沉淀、熔岩暗壳），以及熔岩前缘裂缝热图。
- `volcano_scene.py`：网格（外景整块地形 + 剖面半块 + 侧壁）、材质、天空、灯光、镜头；`set_presentation("landscape" | "section")` 切换外景与剖面沙盘。
- `eruption.py`：岩塞（蓄压抬升、裂缝发光、破裂）、火山弹与火山砾、闪光、落地扬尘；Mantaflow 近景烟只在缺少 VDB 时使用。
- `plume.py`：灰柱。有 VDB 时按羽流理论自相似放大（宽 ∝ 高，顶 ∝ t^0.75，到 3.2 km），否则用程序化 MTT 羽流着色器。
- `shockwave.py`：破裂尘环（VDB），从火口边缘扩到约 2 km，随山坡下移。
- `effects.py`：余烬火星（粒子，约 80 m/s，重力按时间压缩换算）、火山弹发光尾迹（弹道最后 0.35 s）、火口熔岩光与灰柱底部暖光。
- `burst.py`：破裂炽热爆发（VDB，flames 按 1050 K 黑体光）。
- `clouds.py`：云底 1.4–2 km 的积云，只放在镜头后方与两侧。
- `vdb_asset.py`：读取、重定时借用的 VDB 序列。
- `cinematic.py`：电影版七个镜头（含剖面岩浆镜头）（同一次喷发的多机位），`scripts/build-blender-cinematic.py` 剪辑、字幕、胶片颗粒。
- `ballistics.py`：火山弹弹道——重力 + 空气阻力（RK4），按真实时间积分后按 `TIME_SCALE` 采样到画面帧，落在高度场上。

## 五步课堂提示词（与 `steps.json` 一致）

1. “让我看看里面” → 切换到 `Camera_Section`，焦距 30→35 mm，对准 `Magma_Chamber`。
2. “喷得猛一点” → `Vent_Plug` 蓄压 2.4 秒后破裂；气灰喷流 160 m/s；28 枚 0.6–3.5 m 火山弹按带阻力弹道落在 2.4 km 内；约 2 km 尘环；灰柱约一分钟升到 3.2 km（时间压缩 5 倍）。
3. “换成晚上” → `Sun` 10° → −4°，夜景，曝光 +1.6 EV，只保留炽热火山弹、喷口与灰柱底部自发光。
4. “标出地层” → 在剖面上标出 11 个结构（HTML 标签，由 Blender 投影锚点）。
5. “转一圈” → `Camera_Orbit` 6 秒内绕剖面沙盘中心转 120°。

## 现场修改（无 MCP 的确定性复现）

```bash
/opt/homebrew/bin/blender public/blender/volcano-classroom.blend --background --python blender/live_edit.py
# 末行：LIVE_EDIT_OK magma=9.0 camera=Camera_Section lens=35
```

MCP 现场路径：复制 `.blend` 只开副本 → 侧栏确认 `localhost:9876` → 复制网页上的精确提示词，只改点名的对象与参数 → 先低采样预览 → 任何一步超过 30 秒，播放完成版录像。

## 坑

1. Cycles 把 `heat`、`density`、`flame`、`temperature` 当作烟雾体积的内置属性名；网格属性另起名字。
2. AgX 会把黑体熔岩渲染成鲑鱼粉，用 Filmic + Medium High Contrast。
3. Blender 5 的多重散射天空（原 Nishita）亮度远高于旧版：天空强度 0.018 左右才能让太阳光主导明暗。
4. 体积步长 `volume_step_rate` 大于 1 会把灰柱细节糊掉。
5. 侵蚀与网格分辨率有关：预览与正式版用同一套 769² 高度场，只降低贴图与渲染分辨率。
6. 旧分支 `codex/blender`（18787e4、2474147）未合入；只借鉴了阶段时间轴、两类喷发物、种子化随机与运动验收思路。
6. 借用 VDB 的坑：EmberGen 是 Y 轴向上（旋转 X 90°）；`sequence_mode = EXTEND` 在起始帧之前也显示第一帧，要用 `hide_render` 关键帧挡住；Principled Volume 的自发光不随密度衰减，要乘密度；Cycles 默认 `volume_bounces = 0`，灰柱会像墨，设 3。
7. 放在霾体积里的强点光源会照出一个发光球壳：闪光灯关闭 `visible_volume_scatter`。
