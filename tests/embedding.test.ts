import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cosine, createSpace, decodeVectors, dequantise, parseQuery, quantise, toBase64, type EmbeddingData } from "../src/domain/embedding";
import { embeddingLesson } from "../src/content/lessons/embedding";

// 词向量：断言学生要记录的证据——1024 维相似度、近邻名次、类比名次、三维距离——都由同一份数据现算，
// 并与构建脚本写进 JSON 的数值一致。

const data = JSON.parse(readFileSync(new URL("../public-core/data/embeddings.json", import.meta.url), "utf8")) as EmbeddingData;
const space = createSpace(data);
const at = (word: string) => { const index = space.index(word); expect(index, word).toBeGreaterThanOrEqual(0); return index; };

/** 可复现的伪随机单位向量 */
function randomUnit(dim: number, seed: number): Float64Array {
  let state = seed;
  const next = () => { state = (state * 1664525 + 1013904223) % 2 ** 32; return state / 2 ** 32 - .5; };
  const v = Float64Array.from({ length: dim }, next);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

describe("余弦相似度", () => {
  it("同向为 1，反向为 −1，正交为 0，与长度无关", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [-3, 0])).toBeCloseTo(-1, 12);
    expect(cosine([1, 0, 0], [0, 5, 0])).toBeCloseTo(0, 12);
  });

  it("页面用的是 1024 维向量：与 JSON 中记录的中英文对相似度一致", () => {
    expect(data.vectors?.dim).toBe(1024);
    for (const pair of data.pairs) expect(space.similarity(pair.zh, pair.en)).toBeCloseTo(pair.similarity, 3);
  });

  it("全部词对平均值由数据现算，与构建脚本记录的一致（不再写死 0.48）", () => {
    expect(space.meanSimilarity).toBeCloseTo(data.meanSimilarity!, 3);
    expect(space.pairMean).toBeGreaterThan(space.meanSimilarity + .2);
  });

  it("任务 1 证据：猫–cat ＞ 猫–狗 ＞ 猫–数学，而猫–数学约等于平均（不是 0）", () => {
    const cat = at("猫");
    const [withCat, withDog, withMath] = ["cat", "狗", "数学"].map((word) => space.pair(cat, at(word)));
    expect(withCat.similarity).toBeGreaterThan(withDog.similarity);
    expect(withDog.similarity).toBeGreaterThan(withMath.similarity);
    expect(withCat.rankAB).toBe(1);
    expect(Math.abs(withMath.similarity - space.meanSimilarity)).toBeLessThan(.05);
  });

  it("近邻名次与 JSON 的 near 表一致；名次对称地各算各的", () => {
    for (const index of [0, 1, 20, 77]) {
      expect(space.neighbours(index, 5).map((item) => item.index)).toEqual(data.words[index].near);
      data.words[index].near.forEach((other, rank) => expect(space.pair(index, other).rankAB).toBe(rank + 1));
    }
  });
});

describe("类比 A − B + C", () => {
  it("每个预设的结果、第二名与期望答案名次都能在浏览器里复现", () => {
    for (const preset of data.analogies) {
      const r = space.analogy(preset.a, preset.b, preset.c, preset.expected);
      expect(r.result).toBe(preset.result);
      expect(r.runnerUp).toBe(preset.runnerUp);
      expect(r.score).toBeCloseTo(preset.score, 3);
      expect(r.expectedRank).toBe(preset.expectedRank);
      expect([preset.a, preset.b, preset.c]).not.toContain(r.result);
    }
  });

  it("king − man + woman 命中 queen；国王 − 男人 + 女人 没有命中王后", () => {
    const king = space.analogy(at("king"), at("man"), at("woman"), at("queen"));
    expect(king.expectedRank).toBe(1);
    const zh = space.analogy(at("国王"), at("男人"), at("女人"), at("王后"));
    expect(zh.result).not.toBe(at("王后"));
    expect(zh.expectedRank).toBeGreaterThan(1);
    expect(zh.ranked[zh.expectedRank! - 1].index).toBe(at("王后"));
  });

  it("预设里至少有一组未命中（任务 2 需要真实的失败例子）", () => {
    expect(data.analogies.filter((item) => item.expectedRank !== 1).length).toBeGreaterThanOrEqual(1);
    expect(data.analogies.filter((item) => item.expectedRank === 1).length).toBeGreaterThanOrEqual(1);
  });

  it("任意类比都能解析（不只是预设）；预设自动带期望答案", () => {
    const free = parseQuery(data, "dog - 狗 + 猫", space).query;
    expect(free?.kind).toBe("analogy");
    if (free?.kind === "analogy") { expect(data.words[free.analogy.result].text).toBe("cat"); expect(free.analogy.expected).toBeUndefined(); }
    const preset = parseQuery(data, "国王 - 男人 + 女人", space).query;
    if (preset?.kind === "analogy") expect(preset.analogy.expected).toBe(at("王后"));
    expect(parseQuery(data, "猫 - 狗 + 外星人", space).query).toBeNull();
  });

  it("期望答案就是 A/B/C 之一时，名次为 null 而不是 0", () => {
    expect(space.analogy(at("king"), at("man"), at("woman"), at("king")).expectedRank).toBeNull();
  });
});

describe("int8 量化", () => {
  it("往返误差有界：每分量误差 ≤ scale / 2，余弦 ≥ 0.9995", () => {
    for (const seed of [1, 2, 3]) {
      const v = randomUnit(1024, seed);
      const { q, scale } = quantise(v);
      for (let i = 0; i < v.length; i++) expect(Math.abs(q[i] * scale - v[i])).toBeLessThanOrEqual(scale / 2 + 1e-12);
      expect(cosine(dequantise(q, scale), v)).toBeGreaterThan(.9995);
    }
  });

  it("base64 编码可逆，还原后的向量是单位向量", () => {
    const { q, scale } = quantise(randomUnit(1024, 9));
    const [back] = decodeVectors({ dim: 1024, scales: [scale], data: [toBase64(q)] });
    expect(Math.hypot(...back)).toBeCloseTo(1, 12);
    expect(cosine(back, dequantise(q, scale))).toBeCloseTo(1, 12);
  });
});

describe("三维图距离", () => {
  it("与 xyz 坐标一致，并能与 1024 维名次对照（猫–cat 在图上不是最近）", () => {
    const [a, b] = [at("猫"), at("cat")];
    const [p, r] = [data.words[a].xyz, data.words[b].xyz];
    const report = space.pair(a, b);
    expect(report.distance).toBeCloseTo(Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]), 9);
    expect(report.rankAB).toBe(1);
    expect(report.rank3dAB).toBeGreaterThan(1);
  });
});

describe("课时设计", () => {
  it("三个任务、四行评价量规，开放题没有唯一答案", () => {
    expect(embeddingLesson.caseId).toBe("embedding");
    expect(embeddingLesson.tasks.map((task) => task.id)).toEqual(["pairs", "analogy", "picture"]);
    expect(embeddingLesson.rubric.map((row) => row.criterion)).toEqual(["预测", "证据质量", "推理链", "模型反思"]);
    const picture = embeddingLesson.tasks[2];
    expect(picture.openEnded).toBe(true);
    expect(picture.answer).toBeUndefined();
    for (const task of embeddingLesson.tasks) { expect(task.reasonPrompt).toBeTruthy(); expect(task.reflection).toBeTruthy(); }
    expect(embeddingLesson.standards.every((item) => item.text.includes("要点摘录，待核对原文"))).toBe(true);
  });
});
