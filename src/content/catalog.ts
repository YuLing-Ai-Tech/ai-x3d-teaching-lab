// 全天课程的唯一讲课顺序。首页分组、主课件跳转、案例页“上一个 / 下一个”都从这里取，
// 保证三处顺序永远一致：AI 认知 → 语言为王 → 学科巡礼 → 方法与工作坊 → 长征压轴。

export interface CaseEntry { route: string; gradeBand: "high"; title: string; subject: string; line: string; accent: string }
export interface CaseSection { kicker: string; title: string; intro: string; cases: CaseEntry[] }

export const catalog: CaseSection[] = [
  {
    kicker: "第一章 · AI 是语言模型", title: "揭开 AI", intro: "大语言模型做的只有两件事：把词放进意义空间，再一个词一个词地往下说。",
    cases: [
      { route: "embedding", gradeBand: "high", title: "词向量宇宙", subject: "AI 认知", line: "“猫”与“cat”相似度 0.81；国王 − 男人 + 女人 → 公主？", accent: "#8a7bff" },
      { route: "next-token", gradeBand: "high", title: "下一个词", subject: "AI 认知", line: "床前明月光 → 霜 99.8%；本机大模型真实概率", accent: "#ffd38a" },
    ],
  },
  {
    kicker: "第二章 · 语言为王", title: "同一个世界，四种语言", intro: "中文、英文、数学、代码——都是用符号表达关系。说得越清楚，世界越确定。",
    cases: [
      { route: "compiler", gradeBand: "high", title: "语言编译台", subject: "核心", line: "一句话 → 中文 / English / 数学 / 代码 → 粒子重组世界", accent: "#2fd4ff" },
    ],
  },
  {
    kicker: "第三章 · 学科巡礼", title: "每个学科都有自己的语言", intro: "改一个字、一个词、一个字母，世界随之改变——这是最直观的“语言即逻辑”。",
    cases: [
      { route: "poem", gradeBand: "high", title: "古诗即几何", subject: "语文", line: "大漠孤烟直，长河落日圆：直是垂线，圆是圆", accent: "#ffb070" },
      { route: "preposition", gradeBand: "high", title: "介词即空间", subject: "英语", line: "under(A, B) ⇔ A 在 B 下方且在投影内", accent: "#57d8ff" },
      { route: "conic", gradeBand: "high", title: "圆锥曲线切出来", subject: "数学", line: "β 与 α 一个关系定三种曲线；Dandelin 双球推出定义", accent: "#57d8ff" },
      { route: "gravity", gradeBand: "high", title: "一句话定义引力", subject: "物理", line: "平方 → 闭合轨道；立方 → 宇宙崩溃", accent: "#8a7bff" },
      { route: "molecule", gradeBand: "high", title: "分子也有语言", subject: "化学", line: "CCO 是乙醇，COC 是二甲醚：语序即性质", accent: "#3fffb0" },
      { route: "dna", gradeBand: "high", title: "DNA，最古老的语言", subject: "生物", line: "同义词、错别字、提前的句号", accent: "#ff6b8b" },
      { route: "membrane", gradeBand: "high", title: "细胞膜运输实验舱", subject: "生物", line: "数双向穿膜次数：动态平衡、载体饱和、ATP 依赖", accent: "#64f0a4" },
      { route: "geo", gradeBand: "high", title: "用坐标说话", subject: "地理", line: "北纬 35° 切出三级阶梯，北纬 31° 却切不出——为什么？", accent: "#57d8ff" },
    ],
  },
  {
    kicker: "第四章 · 方法与工作坊", title: "从提示词到语言规格书", intro: "目标、概念、关系、画面、交互、验收——把六格说清楚，AI 才能做出能上课的作品。",
    cases: [
      { route: "workshop", gradeBand: "high", title: "语言规格书工作坊", subject: "工作坊", line: "写规格书 → 在线 AI 生成 → 一次只改一层", accent: "#ffd38a" },
      { route: "cards", gradeBand: "high", title: "方法卡", subject: "方法", line: "可打印的六张卡片", accent: "#c58bff" },
      { route: "blender", gradeBand: "high", title: "Codex + Blender 火山", subject: "进阶", line: "七阶段 Vulcanian 喷发 · 地质剖面 · 五步精确提示词", accent: "#ff6947" },
    ],
  },
  {
    kicker: "压轴 · 历史 × 地理", title: "长征：空间，是历史的条件", intro: "用真实地形重走一万二千公里——全天方法的总演示。",
    cases: [
      { route: "long-march", gradeBand: "high", title: "长征 3D 地形叙事", subject: "历史", line: "国界沙盘 · 63 个途经点 · 节点图文讲解", accent: "#ff6a4d" },
    ],
  },
];

/** 讲课顺序里的全部案例（扁平） */
export const lessonOrder: CaseEntry[] = catalog.flatMap((section) => section.cases);
export const caseByRoute = (route: string) => lessonOrder.find((entry) => entry.route === route);
