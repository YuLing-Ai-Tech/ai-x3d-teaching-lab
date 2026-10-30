import type { LessonDesign } from "../../types";

// 《介词即空间》课时设计。证据来自 domain/preposition.ts 对场景几何的判定（包围盒、路径、开口、镜头位置）。
// 课标引文为要点摘录，正式使用前请与课标原文逐字核对。

export const prepositionLesson: LessonDesign = {
  caseId: "preposition",
  title: "介词即空间",
  stages: [
    { stage: "初中", fit: "七—八年级方位介词：用 3D 判定 on / under / in / through 等是否成立，并说出依据。只做任务 1、2。" },
    { stage: "高中", fit: "语法与语义：把介词写成空间条件（逻辑式），讨论 behind / in front of 的观察者视角与歧义。" },
  ],
  standards: [
    { stage: "初中", source: "义务教育英语课程标准（2022 年版）· 语言知识", text: "在语境中理解和运用表示方位、位置的介词（要点摘录，待核对原文）。" },
    { stage: "高中", source: "普通高中英语课程标准（2017 年版 2020 年修订）· 语言能力", text: "在语境中理解语法项目的形式、意义和使用；发展逻辑性与批判性思维（要点摘录，待核对原文）。" },
  ],
  objectives: [
    "把一个介词说成一组可以检查的空间条件。",
    "区分位置介词（一个位置）与路径介词（一条路径），并说出 through 与 over 的区别。",
    "说明 behind / in front of 可能取决于观察者，也可能取决于参照物自身的前后（高中）。",
  ],
  variables: [
    { name: "英文句子", range: "13 个名词 × 15 个介词", meaning: "在“语言”里直接写，或点下面的句子按钮。" },
    { name: "观察视角", range: "拖动 3D 画面旋转", meaning: "转动后点“按当前视角重新判定”。" },
  ],
  evidence: [
    "每个条件是否满足（接触、投影、高度、开口、路径起止）。",
    "behind / in front of：以观察者为准、以参照物自身为准的两种判定结果。",
  ],
  misconceptions: [
    { wrong: "on 就是“在上面”，离得近就行", fix: "看判定：on 要求底面贴着顶面；悬空就是 above，不是 on。" },
    { wrong: "through 和 over 都是“过去”", fix: "through 要求参照物有开口并在开口里穿行；over 要求从上方经过。试试 through the box——盒子没有开口。" },
    { wrong: "behind 的意思是固定的", fix: "绕到盒子后面再判定：以说话人为准时结论会变，以盒子自身的前后为准时不变。" },
  ],
  tasks: [
    {
      id: "position", title: "位置即条件",
      question: "The cat is on the table. / The cat is under the table. 要让句子成立，3D 里各需要满足什么？",
      options: [
        { value: "near", label: "离得近就行" },
        { value: "conditions", label: "on：底面贴着桌面且在投影内；under：低于桌面且在投影内" },
        { value: "height", label: "只要比桌子高或比桌子低" },
      ],
      answer: "conditions",
      reasonPrompt: "我这样想，是因为……",
      operate: "点“on”“under”“in”三句，看判定卡里每个条件是否满足；再试着写 The bird is above the tree.",
      evidence: "on、under、in 各一组。",
      evidenceRule: { minRows: 3, mustInclude: { relation: ["on", "under", "in"] } },
      frames: ["on 成立需要：", "under 和 on 的区别在于：", "用逻辑式写出 under(A, B)："],
      reflection: "模型反思：判定用的是长方体包围盒，真实的猫和桌子不是长方体，会影响哪些判断？",
      conclusion: "on(A,B)：A 的底面贴着 B 的顶面，且 A 在 B 的投影范围内；under(A,B)：A 低于 B 的顶面，且在 B 的投影范围内；in(A,B)：A 的每一边都在 B 内部。介词就是一组可以检查的空间条件。",
    },
    {
      id: "path", title: "through 与 over",
      question: "The car goes through the tunnel 与 The ball jumps over the box，路径条件有什么不同？",
      options: [
        { value: "same", label: "一样，都是从一边到另一边" },
        { value: "different", label: "through 要有开口、在开口高度内穿过；over 要从上方经过" },
        { value: "touch", label: "over 必须碰到顶面" },
      ],
      answer: "different",
      reasonPrompt: "我这样想，是因为……",
      operate: "点“through 隧道”“over”两句记录；再在“语言”里写 The car goes through the box，看系统怎样回答。",
      evidence: "through 与 over 各至少一组。",
      evidenceRule: { minRows: 2, mustInclude: { relation: ["through", "over"] } },
      frames: ["through 的条件：", "over 的条件：", "through the box 不成立，因为"],
      reflection: "模型反思：through the forest（穿过森林）没有一个明确的“开口”，这个判定规则还适用吗？",
      conclusion: "两者都是路径介词，都要求从一侧到另一侧；through 还要求参照物有开口、路径在开口的高度范围内穿过实体内部，over 要求经过时整段路径都高于参照物顶面。盒子没有开口，所以 through the box 不成立。",
    },
    {
      id: "frame", title: "behind 取决于谁", stages: ["高中"], openEnded: true,
      question: "The ball is behind the box. 如果你绕到盒子后面看，这句话还对吗？",
      options: [
        { value: "true", label: "还对" },
        { value: "false", label: "不对了" },
        { value: "depends", label: "取决于以谁为参照：说话人的视角，还是盒子自身的前后" },
      ],
      reasonPrompt: "我这样想，是因为……",
      operate: "点“behind”，先在默认视角判定一次；拖动画面转到盒子后面，点“按当前视角重新判定”再记录。",
      evidence: "至少两个不同视角（前方 / 侧面 / 后方）各一组。",
      evidenceRule: { minRows: 2, distinctBy: "view", minDistinct: 2, mustInclude: { relation: ["behind"] } },
      frames: ["我的观点：", "证据：前方视角时 ___；后方视角时 ___", "另一种理解及其理由："],
      reflection: "模型反思：盒子本来就没有“正面”，这里把 +z 当作它的前方是一种约定。换成汽车、房子这样有正面的物体，你的结论会变吗？",
      conclusion: "没有唯一答案。以说话人（观察者）为参照时，behind 指“从我看过去被 B 挡住”，绕到后面就不成立；以参照物自身为参照时（汽车、房子有正面），behind 指“在它的背面”，与观察者无关。英语中两种用法都存在，语境决定哪一种——评价看的是证据和理由是否清楚。",
    },
  ],
  teacherTips: [
    "先让学生说“on 是什么意思”，再看判定卡把它拆成两个条件：这就是“把语言说清楚”。",
    "through the box 被拒绝是好素材：问学生“为什么不行”，引出“开口”这个条件。",
    "behind 任务没有标准答案：让持不同观点的学生各自用证据说明，再讨论汉语“后面”是否也有同样的歧义。",
    "判定使用长方体包围盒，是简化模型。",
  ],
  rubric: [
    { criterion: "预测", levels: ["只选答案", "写出理由", "理由中用到接触、投影、开口或视角"] },
    { criterion: "证据质量", levels: ["证据不全", "按任务记录完整", "主动构造反例（如 through the box）"] },
    { criterion: "推理链", levels: ["复述意思", "条件与判定结果对应", "能写出逻辑式并说明每个条件的作用"] },
    { criterion: "模型反思", levels: ["没有", "指出一条简化", "说明简化可能造成的误判"] },
  ],
  fallback: [
    "画面卡顿：只看判定卡，判定不依赖动画。",
    "WebGL 打不开：播放备用录像；用课桌、书包现场摆放。",
    "全部失效：请两名学生站位演示 behind，让第三名学生从前后两侧描述。",
  ],
};
