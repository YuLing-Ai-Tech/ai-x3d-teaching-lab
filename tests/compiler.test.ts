import { describe, expect, it } from "vitest";
import { languageForm, parseShape, precisionReport, sameWorld, translate } from "../src/domain/compiler";
import { compilerLesson } from "../src/content/lessons/compiler";
import { checkEvidence } from "../src/ui/inquiry";

// 语言编译台：断言的是学生要记录的证据——哪些参数是说出来的、哪些是机器猜的、两句话是不是同一个世界。

describe("精确度报告：说出来的 vs 机器猜的", () => {
  it("“一个漂亮的球”：半径没说，机器用默认值 2；“漂亮”是模糊词", () => {
    const report = precisionReport("一个漂亮的球");
    expect(report.ok).toBe(true);
    expect(report.kind).toBe("sphere");
    expect(report.stated).toEqual([]);
    expect(report.guessed.map((param) => [param.key, param.label, param.fallback, param.value])).toEqual([["r", "半径", 2, 2]]);
    expect(report.vague).toEqual(["漂亮"]);
    expect(report.decisions).toBe(1);
  });

  it("螺旋线只说圈数：半径和每圈升高被猜", () => {
    const report = precisionReport("一条好看的螺旋线，绕 5 圈");
    expect(report.stated.map((param) => param.key)).toEqual(["turns"]);
    expect(report.guessed.map((param) => `${param.label}=${param.fallback}`)).toEqual(["半径=2", "每圈升高=1"]);
    expect(report.vague).toEqual(["好看"]);
  });

  it("每个参数都写清楚：0 个被猜；模糊词仍可能存在，但没有改变任何参数", () => {
    expect(precisionReport("一个底面半径 2、高 4 的圆锥").guessed).toHaveLength(0);
    const report = precisionReport("一个漂亮的、半径为 2 的球");
    expect(report.guessed).toHaveLength(0);
    expect(report.vague).toEqual(["漂亮"]);
  });

  it("新增的课堂模糊词（适当、合适、稍微）只标红，不改变读出的形状与参数", () => {
    expect(precisionReport("一个合适的圆环").vague).toEqual(["合适"]);
    expect(precisionReport("一个稍微大一点的圆锥").vague).toEqual(["稍微", "大一点"]);
    expect(parseShape("一个合适的圆环").spec).toEqual({ kind: "torus", values: { R: 2.4, r: .7 }, guessed: ["R", "r"] });
  });

  it("写了但超出范围的数：机器悄悄改成边界值，也算交出去的决定", () => {
    const report = precisionReport("一个半径为 10 的球");
    expect(report.guessed).toHaveLength(0);
    expect(report.clamped.map((param) => [param.raw, param.value])).toEqual([[10, 4]]);
    expect(report.decisions).toBe(1);
  });

  it("读不懂的句子：没有形状，不能说“0 个被猜”", () => {
    const report = precisionReport("x² + y² + z² = 4");
    expect(report.ok).toBe(false);
    expect(report.kind).toBeNull();
  });

  it("圆环的 r 叫“管半径”", () => {
    expect(precisionReport("一个大半径 2.6、管半径 0.8 的圆环").stated.map((param) => param.label)).toEqual(["大半径", "管半径"]);
  });
});

describe("同一个世界", () => {
  const spec = (text: string) => parseShape(text).spec;
  it("中文与英文写出的半径为 2 的球是同一个世界", () => {
    expect(sameWorld(spec("一个半径为 2 的球"), spec("A sphere of radius 2")).verdict).toBe("same");
    expect(sameWorld(spec("一个底面半径 2、高 4 的圆锥"), spec("A cone with base radius 2 and height 4")).verdict).toBe("same");
    expect(sameWorld(spec("一条螺旋线，半径 2，绕 3 圈，每圈升高 1"), spec("A helix of radius 2, 3 turns, rising 1 per turn")).verdict).toBe("same");
  });

  it("代码式写法也能读回同一个球", () => {
    expect(sameWorld(spec("一个半径为 2 的球"), spec(translate(spec("一个半径为 2 的球")!).code)).verdict).toBe("same");
  });

  it("“一个球”和“A ball”数值相同，只是因为机器给了同一个默认值", () => {
    expect(sameWorld(spec("一个球"), spec("A ball")).verdict).toBe("same-by-default");
    expect(sameWorld(spec("一个半径为 2 的球"), spec("一个漂亮的球")).verdict).toBe("same-by-default");
  });

  it("数不同、形状不同、读不懂", () => {
    const result = sameWorld(spec("一个半径为 2 的球"), spec("A sphere of radius 3"));
    expect(result.verdict).toBe("different-values");
    expect(result.differences).toEqual([{ key: "r", label: "半径", a: 2, b: 3 }]);
    expect(sameWorld(spec("一个半径为 2 的球"), spec("A cone with base radius 2")).verdict).toBe("different-shape");
    expect(sameWorld(spec("一个半径为 2 的球"), spec("x² + y² + z² = 4")).verdict).toBe("unreadable");
  });
});

describe("语言形态", () => {
  it("中文 / English / 代码式 / 数学式", () => {
    expect(languageForm("一个半径为 2 的球")).toBe("中文");
    expect(languageForm("A sphere of radius 2")).toBe("English");
    expect(languageForm("sphere({ radius: 2 })")).toBe("代码式");
    expect(languageForm("x² + y² + z² = 4")).toBe("数学式");
  });
});

describe("课时设计", () => {
  const task = (id: string) => compilerLesson.tasks.find((item) => item.id === id)!;
  it("四个任务，T3 只给高中，T4 是开放题", () => {
    expect(compilerLesson.tasks.map((item) => item.id)).toEqual(["vague", "rewrite", "world", "best"]);
    expect(task("world").stages).toEqual(["高中"]);
    expect(task("best").openEnded).toBe(true);
    expect(task("best").answer).toBeUndefined();
    expect(compilerLesson.rubric.map((row) => row.criterion)).toEqual(["预测", "证据质量", "推理链", "模型反思"]);
    expect(compilerLesson.standards.every((item) => item.text.includes("要点摘录，待核对原文"))).toBe(true);
  });

  it("T2 证据：必须同时有“有被猜参数”的一行和“0 个被猜参数”的一行", () => {
    const rule = task("rewrite").evidenceRule;
    const vague = { sentence: "一个漂亮的球", guessed: "1", verdict: "有被猜参数" };
    const clear = { sentence: "一个半径为 2 的球", guessed: "0", verdict: "0 个被猜参数" };
    expect(checkEvidence(rule, [vague]).ok).toBe(false);
    expect(checkEvidence(rule, [vague, { ...vague, sentence: "一个球" }]).ok).toBe(false);
    expect(checkEvidence(rule, [clear, { ...clear, sentence: "A sphere of radius 2" }]).ok).toBe(false);
    expect(checkEvidence(rule, [vague, clear]).ok).toBe(true);
  });
});

describe("代码写法往返", () => {
  it("translate 写出的圆环代码能被读回，R 与 r 区分大小写", () => {
    const spec = { kind: "torus" as const, values: { R: 3, r: 0.5 }, guessed: [] };
    expect(parseShape(translate(spec).code).spec).toEqual(spec);
    expect(parseShape(translate(spec).en).spec).toEqual(spec);
  });
});
