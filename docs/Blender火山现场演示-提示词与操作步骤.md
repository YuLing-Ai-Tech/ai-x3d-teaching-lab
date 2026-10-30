# Blender 火山现场演示：提示词与操作步骤

> 用途：课堂上**真的**“改一句话，画面就变”。网页 `#/blender` 播放的是课前渲染好的结果；这份文档教你在 Mac 上打开 Blender，用 AI（通过 MCP 连接 Blender）现场执行提示词，让三维画面当场改变。
> 适用：第 6 课 30–45 分钟“Codex + Blender”段。建议现场演示 3 步（第 1、3、5 步）+ 岩浆加热 1 步，其余用网页录像。
> 原则：**只在副本上操作**；任何一步 30 秒没出结果，立刻切回网页播放录像。
> 四段“保险版” Python 已于 2026-10-28 在本项目场景副本上实测通过（剖面相机 35 mm、岩浆 4→9、夜景曝光 +1.6、环绕 144 帧）。

---

## 一、课前准备（提前 30 分钟，约 10 分钟做完）

### 1. 复制一个练习用的场景副本（必须）

打开“终端”，粘贴下面两行（回车执行）：

```bash
cd ~/Documents/Project/培训课程/高中教师AI应用培训-deepen
cp public/blender/volcano-classroom.blend ~/Desktop/火山-课堂副本.blend
```

以后所有操作都在桌面上的 `火山-课堂副本.blend` 里做，原文件不动。演砸了就再复制一次。

### 2. 用 Blender 打开副本

- 双击桌面上的 `火山-课堂副本.blend`（或在 Blender 里“文件 → 打开”）。
- 第一次打开如果提示“自动运行脚本已禁用”，点“允许执行”。
- 打开后右上角视图里能看到火山地形即可。

### 3. 打开 MCP 插件并启动连接

1. 鼠标放在三维视图里，按键盘 **N**，右侧出现侧栏。
2. 侧栏里找到 **BlenderMCP** 标签页（竖排文字）。
3. 点 **Connect / Start MCP Server**（不同版本按钮名略有差异），状态显示正在监听 `localhost:9876` 即可。
4. 不要勾选任何需要联网下载素材的选项（例如 Poly Haven、Hyper3D 等），课堂不需要。

### 4. 打开 AI 客户端并确认连上了 Blender

用你平时连 Blender 的那个 AI 客户端（Codex 或 Claude Desktop，已配置好 `blender-mcp`）。新开一个对话，先发这句**连接检查**：

```text
请通过 Blender MCP 列出当前场景里所有相机和灯光对象的名字，以及当前活动相机。只读取，不要修改任何东西。
```

**应当看到**：相机里有 `Camera_Hero`、`Camera_Section`、`Camera_Vent`、`Camera_Climax`、`Camera_Orbit`；灯光里有 `Sun`、`Moon_Fill`、`Studio_Key`、`Studio_Fill`、`Rim_Light`、`Eruption_Flash`、`Vent_Glow`。
**如果 AI 说连不上**：回到第 3 步重新点 Connect；还不行，今天就用网页录像，不要现场调试。

### 5. 把视图调成“边改边看”

- 三维视图左上角或右上角的着色方式切到 **“材质预览”**（第三个小球图标）。
- 菜单 **视图 → 摄像机 → 活动摄像机**（或小键盘 0），从当前相机看出去。
- 投影到大屏前，把 Blender 窗口最大化。

### 6. 彩排一遍

课前把下面第二节的 4 步按顺序各执行一次，确认每步 30 秒内画面都会变。彩排完，**关掉 Blender 不保存**，重新复制一份副本（第 1 步），留给正式上课用。

---

## 二、课堂演示：四步提示词

每一步都按同一个节奏讲：

1. **先发模糊的话**：让学员看到 AI 只能猜，结果每次可能不一样。
2. **再发精确的话**：对象、参数、数值、条件都写清楚，画面按我们说的变。
3. **保险版**：如果精确的话执行得不对，直接发保险版——它让 AI 运行项目里已经验证过的同一段代码，结果和网页上的录像一致。

> 下面的 Python 从环境变量 `ZHIJING_PROJECT_ROOT` 读取项目工作区。开课前先把它设为当前 worktree 的绝对路径；不要把个人路径写进提示词或公开仓库。

### 第 1 步　把视线说清楚（剖面相机 + 焦距）

**模糊的话**（先发，看 AI 怎么猜）：

```text
让我看看里面。
```

**精确的话**（主演示）：

```text
通过 Blender MCP 执行以下修改，不要改动其他任何对象：
1. 把场景切换为“剖面展示”：隐藏 Landscape 集合（渲染和视图都隐藏），显示 Section 集合；把 World 节点树中名为 Studio_Mix 的混合节点的系数设为 1；让 Studio_Key、Studio_Fill、Rim_Light 三盏灯参与渲染。
2. 把场景的活动相机设为 Camera_Section，它的焦距设为 35 mm。
3. 把三维视图切换到从活动相机观看。
完成后告诉我：活动相机名字、焦距数值。
```

**让学员改一个参数**（现场互动）：请一位老师说“把焦距改成 50 mm”，你发：

```text
只把 Camera_Section 的焦距从 35 mm 改成 50 mm，其他都不变，然后告诉我新的焦距。
```

画面会被拉近——**参数一变，画面就变**。再改回 35 mm。

**保险版**：

```text
请在 Blender 里执行下面这段 Python，然后把视图切到活动相机：
import os, sys, bpy
sys.path.insert(0, os.path.join(os.environ["ZHIJING_PROJECT_ROOT"], "blender"))
from volcano_scene import set_presentation
set_presentation("section")
cam = bpy.data.objects["Camera_Section"]
bpy.context.scene.camera = cam
cam.data.lens = 35
print("OK", cam.name, cam.data.lens)
```

### 第 2 步　让岩浆更热（岩浆房发光强度 4 → 9）

这一步接在第 1 步后面，画面里能看到岩浆房和火山通道。

**模糊的话**：

```text
岩浆再亮一点。
```

**精确的话**：

```text
只修改材质 Section_Geology：把节点 Magma_Emission_Strength 的第 2 个输入，设为材质自定义属性 base_gain 乘以 (9 ÷ 4) 的平方；并把材质的自定义属性 classroom_emission_strength 设为 9。不要改其他节点和对象。完成后告诉我这个输入的新数值。
```

**为什么这么写**：课堂参数 4 → 9，发光强度按平方变化（约 5 倍），所以 9 不只是“更亮”，而是“更热”。

**保险版**：

```text
请在 Blender 里执行下面这段 Python：
import os, sys
sys.path.insert(0, os.path.join(os.environ["ZHIJING_PROJECT_ROOT"], "blender"))
from render_steps import magma_emission
node = magma_emission(9.0)
print("OK", node.inputs[1].default_value)
```

想恢复原样：把上面的 `9.0` 改成 `4.0` 再执行一次。

### 第 3 步　把时间变成参数（白天 → 夜晚）

先回到外景（不在剖面里）。

**模糊的话**：

```text
换成晚上。
```

**精确的话**：

```text
通过 Blender MCP 执行以下修改：
1. 切换为“外景展示”：显示 Landscape 集合，隐藏 Section 集合；World 节点 Studio_Mix 的系数设为 0；Studio_Key、Studio_Fill、Rim_Light 三盏灯不参与渲染。
2. 活动相机设为 Camera_Hero。
3. 夜景：World 节点 Night_Mix 的系数设为 1；灯光 Sun 的强度设为 0；灯光 Moon_Fill 的强度设为 0.06；场景色彩管理的曝光设为 +1.6。
4. 把时间轴跳到第 110 帧（喷发后、火山弹在空中）。
完成后告诉我 Night_Mix 的系数、Sun 的强度和曝光值。
```

把视图着色切到 **“渲染”**（第四个小球）才能看到夜景发光；如果画面卡顿，就停在“材质预览”，口头说明“正式渲染里火山弹会发光”，并播放网页第 3 步短片。

**保险版**：

```text
请在 Blender 里执行下面这段 Python：
import os, sys, bpy
sys.path.insert(0, os.path.join(os.environ["ZHIJING_PROJECT_ROOT"], "blender"))
from volcano_scene import set_presentation
from render_steps import set_night
set_presentation("landscape")
bpy.context.scene.camera = bpy.data.objects["Camera_Hero"]
set_night(1.0)
bpy.context.scene.frame_set(110)
print("OK night")
```

换回白天：把 `set_night(1.0)` 改成 `set_night(0.0)` 再执行。

### 第 4 步　把运镜写成约束（绕剖面沙盘转 120°）

**模糊的话**：

```text
转一圈。
```

**精确的话**：

```text
通过 Blender MCP 执行以下修改：
1. 切换为“剖面展示”（同第 1 步第 1 条）。
2. 给相机 Camera_Orbit 做环绕动画：第 1 帧到第 144 帧（24 帧/秒，即 6 秒），绕点 (0, 22, -12) 水平转 120°，从 -110° 转到 +10°，半径 165、高度 48（1 单位 = 100 米，即半径 16.5 km、高 4.8 km），每一帧都朝向这个中心点，逐帧插入位置和旋转关键帧。
3. 活动相机设为 Camera_Orbit，时间轴范围设为 1–144，跳到第 1 帧。
完成后告诉我关键帧数量。
```

然后按 **空格** 在视图里播放（材质预览下即可流畅播放），再按空格停止。

**保险版**：

```text
请在 Blender 里执行下面这段 Python，然后把视图切到活动相机并从第 1 帧播放：
import os, sys, bpy
sys.path.insert(0, os.path.join(os.environ["ZHIJING_PROJECT_ROOT"], "blender"))
from volcano_scene import set_presentation
from render_steps import orbit
set_presentation("section")
orbit("Camera_Orbit", 144)
scene = bpy.context.scene
scene.camera = bpy.data.objects["Camera_Orbit"]
scene.frame_start, scene.frame_end = 1, 144
scene.frame_set(1)
print("OK orbit")
```

---

## 三、哪些不在 Blender 里现场做

| 网页上的步骤 | 课堂怎么做 | 原因 |
|---|---|---|
| 第 2 步 喷发全过程（破裂、尘环、灰柱） | 播放网页第 2 步短片和电影版 | 灰柱、尘环、云都是大体积素材，现场实时渲染太慢 |
| 第 4 步 标出 11 个结构 | 用网页第 4 步的标签 | 标签是网页上的 HTML，不在 Blender 场景里 |

可以这样对学员说：“能马上改、马上看的，我们现场改；要算很久的，我们课前算好了——**两者用的是同一句精确的话**。”

---

## 四、30 秒回退

| 情况 | 立刻做什么 |
|---|---|
| AI 说连不上 Blender | 网页点“播放修改版”；说一句“高阶工具的价值和边界，都在这个失败里。” |
| AI 执行了，但画面不对 | 发这一步的“保险版”；还不对就播放网页对应短片 |
| 渲染视图卡住 | 着色切回“材质预览”；仍卡就按 Esc，播放网页短片 |
| 不小心改乱了场景 | 关掉 Blender，**不保存**；重新复制副本（第一节第 1 步）再打开 |
| Blender 崩溃 | 不要重启演示，直接用网页继续讲 |

---

## 五、讲解要点（边演示边说）

- **模糊的话**：AI 只能猜；“让我看看里面”可能被理解成拉近、剖开、换角度，每次都不一样。
- **精确的话**回答四个问题：**什么对象**（Camera_Section）、**什么参数**（焦距）、**多少数值**（35 mm）、**在什么条件下**（不改动其他对象）。
- **保险版**说明一件事：精确到可以直接执行的程度，结果就可以复现——这就是“说得越精确，世界越可控”。
- 收束句：**AI 能稳定操作 3D，是因为对象先被人用语言组织好了。**

---

## 六、课后恢复

- 桌面上的 `火山-课堂副本.blend` 可以删掉，项目里的原文件没有被改动。
- 如果课上保存过副本，也不影响网页和服务器上的课件。
