import { describePoem, parsePoem, type PoemWorld } from "../domain/poem";
import { mountPoem } from "../scenes/poem";
import { renderLangLab } from "../ui/langLab";

// 语文 · 古诗即几何：一首诗就是一份极简的构图规格书。

export function renderPoem(): Promise<() => void> {
  return renderLangLab<PoemWorld>({
    id: "poem",
    subject: "语文",
    title: "古诗即几何",
    subtitle: "王维只用十个字，就把一幅画说得不可能画错：“直”是一条垂线，“圆”是一个圆。改一个字，世界就变了。",
    accent: "#ffb070",
    language: "汉语 · 古典诗句",
    roles: {
      scene: { label: "景物", color: "#ffb070" },
      shape: { label: "形态（几何）", color: "#ffe28a" },
      count: { label: "数量", color: "#9fe0ff" },
      time: { label: "时间 / 方位", color: "#ff8fa8" },
    },
    variants: [
      { label: "王维原句", text: "大漠孤烟直，长河落日圆" },
      { label: "直 → 斜", text: "大漠孤烟斜，长河落日圆" },
      { label: "圆 → 缺", text: "大漠孤烟直，长河落日缺" },
      { label: "孤 → 群", text: "大漠群烟乱，长河落日圆" },
      { label: "日 → 月", text: "大漠孤烟直，长河落月圆" },
      { label: "落 → 旭", text: "雪原孤烟直，长河旭日圆" },
    ],
    parse: (text) => {
      const { world, tokens, recognised } = parsePoem(text);
      return recognised
        ? { ok: true, params: world, tokens }
        : { ok: false, params: world, tokens, message: "没有读到景物或形态字。试试“漠、烟、河、日、月、直、斜、圆、缺、孤、群”。" };
    },
    mount: mountPoem,
    explain: ({ params }) => ({
      title: "一首诗 = 三条构图线",
      body: `${describePoem(params)}<p class="lang-ok">诗人没有写“美”，只写了形状和关系——这正是 AI 最能执行的语言。</p>`,
    }),
    question: "把“直”换成“斜”，画面多了什么看不见的东西？（风）——好的语言，一个字就能带出一个物理条件。",
    disclaimer: "意境由程序按字生成，用于说明“精确的字 → 确定的画面”，不代表唯一的诗歌解读。",
    fallbackVideo: "media/poem-demo.mp4",
  });
}
