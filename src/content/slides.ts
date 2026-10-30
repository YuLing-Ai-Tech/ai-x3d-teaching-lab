// 全天主课件：以“语言为王”为主线，案例跳转顺序与 catalog.ts 的讲课顺序一致（单元测试会检查）。

export interface SlideJump { route: string; label: string }
export interface CourseSlide { kicker: string; title: string; body: string; jump?: SlideJump; also?: SlideJump[] }

export const courseSlides: CourseSlide[] = [
  { kicker: "2026.10.29 · 高中教师 AI 应用培训", title: "说清楚，世界就出现", body: "<p>AI 时代以语言为核心的教学</p>" },
  { kicker: "今天的一个判断", title: "大语言模型，就是语言的模型", body: "<p>它没有眼睛和手，只有语言。<br>谁能把话说清楚，谁就能让 AI 把世界造出来。</p>" },
  { kicker: "第一章 · AI 怎样“懂”", title: "意思，是空间里的位置", body: "<ul><li>每个词都是 1024 维空间里的一个点</li><li>“猫”与“cat”相似度 0.81；任意两词平均只有 0.48</li><li>king − man + woman ≈ queen；但 国王 − 男人 + 女人 → 公主（王后只排第 5）</li></ul>", jump: { route: "embedding", label: "打开：词向量宇宙" } },
  { kicker: "第一章 · AI 怎样“说”", title: "它只做一件事：猜下一个词", body: "<ul><li>床前明月光，疑是地上 → 霜（99.8%）</li><li>学生最重要的能力是 → 提问（只有 10.5%）</li><li>确定的语言，得到确定的回答</li></ul>", jump: { route: "next-token", label: "打开：下一个词" } },
  { kicker: "第二章 · 语言为王", title: "中文、英文、数学、代码，都是语言", body: "<p>它们都在做同一件事：<b>用符号表达关系</b>。<br>同一个球，可以写成四种样子——世界是同一个。<br>“一个漂亮的球”——半径多大？没说出口的数量，都是交给机器的决定权。</p>", jump: { route: "compiler", label: "打开：语言编译台" } },
  { kicker: "第三章 · 语文", title: "古诗即几何", body: "<p>“直”是一条垂线，“圆”是一个圆。<br>王维用十个字写了一份不可能画错的构图规格书。</p>", jump: { route: "poem", label: "打开：古诗即几何" } },
  { kicker: "第三章 · 英语", title: "介词即空间逻辑", body: "<p>under(A, B) ⇔ A 在 B 下方，且在 B 的投影内。<br>语法不是规则表，是可执行的空间关系。</p>", jump: { route: "preposition", label: "打开：介词即空间" } },
  { kicker: "第三章 · 数学", title: "数学是表示关系的语言", body: "<p>同一个圆锥，切面与轴的夹角 β 一变，椭圆 → 抛物线 → 双曲线。<br>决定它们的只有一句话：β 比母线的角 α 大、相等，还是小。</p>", jump: { route: "conic", label: "打开：圆锥曲线切出来" } },
  { kicker: "第三章 · 物理", title: "一个词，决定宇宙是否稳定", body: "<p>“平方反比”——轨道闭合；换成“立方”——行星坠毁或逃逸。<br>定律本身，就是一句精确的话。</p>", jump: { route: "gravity", label: "打开：一句话定义引力" } },
  { kicker: "第三章 · 化学", title: "分子也有语言", body: "<p>CCO 是乙醇，COC 是二甲醚。<br>同样的字母，换一个顺序——就是另一种物质。</p>", jump: { route: "molecule", label: "打开：分子也有语言" } },
  { kicker: "第三章 · 生物", title: "DNA，最古老的语言", body: "<ul><li>同义词：换了字母，意思没变</li><li>错别字：一个字母，红细胞变成镰刀形</li><li>提前的句号：蛋白质只写了一半</li></ul>", jump: { route: "dna", label: "打开：DNA，最古老的语言" }, also: [{ route: "membrane", label: "细胞膜运输实验舱" }] },
  { kicker: "第三章 · 地理", title: "坐标，是大地的语言", body: "<p>“沿北纬 35° 剖开”——三级阶梯出现；换成北纬 31°，四川盆地让第二级“消失”了。<br>两个数字，就能把任何人带到同一个地点。</p>", jump: { route: "geo", label: "打开：用坐标说话" } },
  { kicker: "第四章 · 方法", title: "从提示词，到语言规格书", body: "<ol><li>目标：学生最后能说出哪一句话</li><li>概念：关键词分别指什么</li><li>关系：谁和谁怎样相关</li><li>画面：必须出现哪些对象</li><li>交互：学生能改变什么</li><li>验收：怎样判断没有教错</li></ol>", jump: { route: "workshop", label: "打开：语言规格书工作坊" } },
  { kicker: "第四章 · 语言化思维", title: "四个问题，教给每个学生", body: "<ul><li>说清目标：我到底要什么？</li><li>定义概念：这个词指的是什么？</li><li>写出关系：谁和谁，怎样相关？</li><li>给出验收：怎样知道它是对的？</li></ul>", jump: { route: "cards", label: "打开：方法卡" } },
  { kicker: "第四章 · 可靠性", title: "从能运行，到敢上课", body: "<ul><li>史实与模型要有来源</li><li>离线资源不偷偷请求外网</li><li>每个现场操作都有 30 秒回退路径</li><li>震撼，必须是可控的</li></ul>", jump: { route: "blender", label: "打开：Codex + Blender 彩蛋" } },
  { kicker: "第四章 · 工作坊", title: "写你学科的那一句话", body: "<p>选一个知识点 → 写成语言规格书 → 让 AI 生成 → 用验收标准检查。<br>今天下午，每位老师带走一个自己的 3D 作品。</p>", jump: { route: "workshop", label: "开始工作坊" } },
  { kicker: "TAKEAWAY", title: "AI 时代的教育重点", body: "<p>以语言为核心的逻辑思维：<br><b>会提问、会定义、会表达关系、会验证。</b></p>" },
  { kicker: "压轴 · 历史 × 地理", title: "长征：空间，是历史的条件", body: "<p>一万二千公里，用真实地形重走一遍。<br>湘江、乌江、赤水河、金沙江、大渡河、雪山、草地——<br>每一个节点，都是地形写下的一道题。</p>", jump: { route: "long-march", label: "进入：长征 3D 地形叙事" } },
];

/** 某个案例在主课件里第一次出现的页码（1 起）；用于“返回主课件”时回到讲到这里的那一页 */
export function slideForRoute(route: string): number | undefined {
  const index = courseSlides.findIndex((slide) => slide.jump?.route === route || slide.also?.some((link) => link.route === route));
  return index < 0 ? undefined : index + 1;
}
