// 语言规格书：六格字段、模糊词检测、生成给在线 AI 工具的提示词。

export const SPEC_FIELDS = [
  { id: "goal", label: "目标 · 学生最后应理解什么", hint: "写成学生能说出的一句话" },
  { id: "concept", label: "概念 · 关键词分别指什么", hint: "给出定义、单位、取值范围" },
  { id: "relation", label: "关系 · 谁和谁怎样相关", hint: "用学科语言写：公式、介词、坐标、语序" },
  { id: "objects", label: "画面 · 必须出现哪些对象", hint: "写清数量、尺寸、颜色、位置" },
  { id: "interaction", label: "交互 · 学生能改变什么", hint: "控件、范围、步长、重置" },
  { id: "acceptance", label: "验收 · 怎样判断没有教错", hint: "可检查的现象或数值" },
] as const;

export type SpecId = (typeof SPEC_FIELDS)[number]["id"];
export type Spec = Record<SpecId, string>;

/** 课堂上最常见的“交给 AI 去猜”的词 */
export const VAGUE_WORDS = [
  "漂亮", "好看", "美观", "酷炫", "炫酷", "高级", "震撼", "生动", "形象", "有趣",
  "一些", "一点", "有些", "若干", "很多", "丰富", "适当", "合适", "合理", "大概", "差不多", "比较", "等等", "之类",
];

export interface SpecAnalysis {
  vague: string[];
  numbers: number;
  filled: number;
  /** 0–100：填写完整度、数量表达与模糊词的综合提示，不是评分标准 */
  precision: number;
}

export function findVague(text: string): string[] {
  return VAGUE_WORDS.filter((word) => text.includes(word));
}

export function analyzeSpec(spec: Partial<Spec>): SpecAnalysis {
  const texts = SPEC_FIELDS.map(({ id }) => (spec[id] ?? "").trim());
  const all = texts.join("\n");
  const vague = [...new Set(findVague(all))];
  const numbers = (all.match(/\d+(?:\.\d+)?/g) ?? []).length;
  const filled = texts.filter(Boolean).length;
  const precision = Math.max(0, Math.min(100, Math.round(filled / SPEC_FIELDS.length * 60 + Math.min(numbers, 8) * 5 - vague.length * 8)));
  return { vague, numbers, filled, precision };
}

export function buildSpecPrompt(spec: Partial<Spec>, subject: string): string {
  const line = (id: SpecId, label: string) => `${label}：${spec[id]?.trim() || "（请先补充）"}`;
  return [
    `请为高中${subject || ""}课堂制作一个可交互的 3D 教学网页。`,
    "",
    "【语言规格书】",
    line("goal", "学习目标"),
    line("concept", "概念定义"),
    line("relation", "核心关系"),
    line("objects", "画面对象"),
    line("interaction", "学生交互"),
    line("acceptance", "验收标准"),
    "",
    "【输出要求】",
    "1. 先用 5 行以内复述你理解的对象、关系和交互；有歧义的地方先列出你的假设。",
    "2. 输出一个完整的单文件 HTML（CSS、JS 都写在同一个文件里），可以用 CDN 引入 three.js；浏览器直接打开即可运行。",
    "3. 界面文字用中文，投屏 1920×1080 时字号清楚；提供“重置”按钮，支持鼠标拖动旋转视角。",
    "4. 涉及公式、数据的地方，在画面里显示当前数值；示意性的内容要在页面角落注明“教学示意”。",
    "5. 最后按“验收标准”逐条说明，你的代码怎样满足它。",
  ].join("\n");
}

/** 一次只改一层：三条后续修改提示词，加一条报错修复 */
export const REVISION_PROMPTS = [
  { label: "只改数据", text: "只修改数据和数值，不要改界面和交互：把【在这里写要改的数据】改为【新数据】。改完列出所有改动的数值，并检查它们是否仍满足验收标准。" },
  { label: "只改交互", text: "只修改交互，不要改数据和 3D 场景：增加【在这里写新的操作，例如“拖动滑块 0–90°”】。保留原有的重置按钮，改完说明新操作对应哪条学习目标。" },
  { label: "只改叙事", text: "只修改讲解顺序和文字，不要改数据和交互：先让学生【预测/观察】，再显示【结论】；每一步只出现一句话。" },
  { label: "报错修复", text: "页面运行时出现以下报错，只修复这一处，不要重写其他部分：\n【在这里粘贴报错原文】" },
];
