import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextTokenLesson } from "../src/content/lessons/nextToken";
import { applyTemperature, certainty, entropyBits, percent, rankByCertainty, renormalise, stepStats, type Candidate } from "../src/domain/nextToken";

// 下一个词：断言学生要记录的证据（p1、差距、熵、温度）都由同一组纯函数从离线数据算出，
// 课时设计里引用的数字与数据一致。

interface Data { model: string; prompts: Array<{ label: string; prompt: string; steps: Candidate[][]; completion: string }> }
const data = JSON.parse(readFileSync(new URL("../public-core/data/next-token.json", import.meta.url), "utf8")) as Data;
const byPrompt = (text: string) => data.prompts.find((prompt) => prompt.prompt === text)!;
const OPEN = byPrompt("在人工智能时代，学生最重要的能力是");
const PARIS = byPrompt("The capital of France is");
const FROST = byPrompt("床前明月光，疑是地上");
const c = (...ps: number[]) => ps.map((p, index) => ({ token: `w${index}`, p }));

describe("熵与重新归一", () => {
  it("已知分布的熵", () => {
    expect(entropyBits([1, 0, 0])).toBe(0);
    expect(entropyBits([0.5, 0.5])).toBeCloseTo(1, 12);
    expect(entropyBits(Array(8).fill(1 / 8))).toBeCloseTo(3, 12);
    expect(entropyBits([0.5, 0.25, 0.25])).toBeCloseTo(1.5, 12);
  });

  it("熵先重新归一：只给部分概率时按比例放大", () => {
    expect(entropyBits([0.2, 0.2])).toBeCloseTo(1, 12);
    const q = renormalise([0.1, 0.3]);
    expect(q[0]).toBeCloseTo(0.25, 12);
    expect(q[0] + q[1]).toBeCloseTo(1, 12);
  });

  it("stepStats：p1 是原始值，q1 是重新归一后的值", () => {
    const stats = stepStats(c(0.1, 0.3, 0.1));
    expect(stats.top.token).toBe("w1");
    expect(stats.p1).toBeCloseTo(0.3, 12);
    expect(stats.margin).toBeCloseTo(0.2, 12);
    expect(stats.covered).toBeCloseTo(0.5, 12);
    expect(stats.q1).toBeCloseTo(0.6, 12);
  });
});

describe("温度（只在前 8 个里重新归一）", () => {
  const sample = c(0.5, 0.2, 0.1, 0.05, 0.02);

  it("T = 1 等于重新归一", () => {
    const scaled = applyTemperature(sample, 1);
    renormalise(sample.map((x) => x.p)).forEach((q, index) => expect(scaled[index].p).toBeCloseTo(q, 12));
  });

  it("每个温度下总和都是 1，排名不变", () => {
    for (const t of [0.3, 0.5, 1, 1.5, 2]) {
      const scaled = applyTemperature(sample, t);
      expect(scaled.reduce((sum, x) => sum + x.p, 0)).toBeCloseTo(1, 12);
      for (let i = 1; i < scaled.length; i++) expect(scaled[i].p).toBeLessThanOrEqual(scaled[i - 1].p);
    }
  });

  it("温度越高：第一名份额单调下降、熵单调上升", () => {
    let lastTop = Infinity;
    let lastH = -Infinity;
    for (let t = 0.3; t <= 2.0001; t += 0.1) {
      const scaled = applyTemperature(sample, t);
      const h = entropyBits(scaled.map((x) => x.p));
      expect(scaled[0].p).toBeLessThan(lastTop);
      expect(h).toBeGreaterThan(lastH);
      lastTop = scaled[0].p;
      lastH = h;
    }
  });

  it("等价于 softmax(z/T)：候选之间的比例是 (p_i/p_j)^(1/T)", () => {
    const scaled = applyTemperature(sample, 0.5);
    expect(scaled[0].p / scaled[1].p).toBeCloseTo((0.5 / 0.2) ** 2, 9);
  });

  it("存成 0 的候选在任何温度下都是 0；极低温度不下溢", () => {
    const scaled = applyTemperature(c(0.9982, 0.0005, 0), 0.3);
    expect(scaled[2].p).toBe(0);
    expect(scaled[0].p).toBeCloseTo(1, 6);
    expect(() => applyTemperature(sample, 0)).toThrow();
  });
});

describe("真实数据（课前离线计算）", () => {
  it("已核对的事实", () => {
    expect(stepStats(FROST.steps[0]).top.token).toBe("霜");
    expect(stepStats(FROST.steps[0]).p1).toBeCloseTo(0.9982, 6);
    expect(stepStats(PARIS.steps[0]).top.token).toBe(" Paris");
    expect(stepStats(PARIS.steps[0]).p1).toBeCloseTo(0.623, 6);
    const open = stepStats(OPEN.steps[0]);
    expect(open.top.token).toBe("提问");
    expect(open.p1).toBeCloseTo(0.1053, 6);
    expect(open.second?.token).toBe("（");
  });

  it("确定程度只由数据决定", () => {
    expect(certainty(stepStats(FROST.steps[0]))).toBe("sure");
    expect(certainty(stepStats(PARIS.steps[0]))).toBe("lean");
    expect(certainty(stepStats(OPEN.steps[0]))).toBe("unsure");
  });

  it("最确定是古诗“疑是地上”，最犹豫是开放问题（任务 1 的参考答案）", () => {
    const ranked = rankByCertainty(data.prompts);
    expect(ranked[0]).toBe(FROST);
    expect(ranked.at(-1)).toBe(OPEN);
    const entropies = data.prompts.map((prompt) => stepStats(prompt.steps[0]).entropy);
    expect(Math.max(...entropies)).toBe(stepStats(OPEN.steps[0]).entropy);
  });

  it("课时设计里引用的数字与数据一致", () => {
    const text = nextTokenLesson.tasks.map((task) => task.conclusion).join("\n");
    const open = stepStats(OPEN.steps[0]);
    expect(text).toContain(`熵 ${open.entropy.toFixed(2)} 比特`);
    expect(text).toContain(`前 8 名合计只有 ${percent(open.covered)}`);
    expect(text).toContain(`熵 ${stepStats(FROST.steps[0]).entropy.toFixed(2)} 比特`);
    const at = (t: number) => applyTemperature(PARIS.steps[0], t);
    expect(text).toContain(`Paris 占 ${percent(at(0.5)[0].p)}`);
    expect(text).toContain(`T = 1.5 时 ${percent(at(1.5)[0].p)}`);
    expect(text).toContain(`熵 ${entropyBits(at(1.5).map((x) => x.p)).toFixed(2)} 比特`);
    expect(text).toContain(`原有 ${percent(1 - stepStats(PARIS.steps[0]).covered)} 的概率`);
  });

  it("课时设计结构完整：3 个任务、4 行评价量表、开放题没有标准答案", () => {
    expect(nextTokenLesson.caseId).toBe("next-token");
    expect(nextTokenLesson.rubric.map((row) => row.criterion)).toEqual(["预测", "证据质量", "推理链", "模型反思"]);
    expect(nextTokenLesson.tasks.map((task) => task.id)).toEqual(["certainty", "temperature", "importance"]);
    expect(nextTokenLesson.tasks.find((task) => task.id === "temperature")!.stages).toEqual(["高中"]);
    const open = nextTokenLesson.tasks.find((task) => task.id === "importance")!;
    expect(open.openEnded).toBe(true);
    expect(open.answer).toBeUndefined();
    for (const task of nextTokenLesson.tasks) {
      expect(task.reasonPrompt).toBeTruthy();
      expect(task.reflection).toBeTruthy();
      expect(task.evidenceRule).toBeTruthy();
    }
    expect(nextTokenLesson.standards.every((item) => item.text.includes("要点摘录，待核对原文"))).toBe(true);
  });
});
