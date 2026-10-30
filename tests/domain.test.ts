import { describe, expect, it } from "vitest";
import { interpolateRoute, validateRoute } from "../src/domain/route";
import { clampMembraneSettings, transportDirection } from "../src/domain/membrane";
import { caseManifests } from "../src/data/manifests";
import { elevationToRelief, terrainColor } from "../src/domain/terrain";

describe("长征路线", () => {
  it("拒绝时间倒序和缺少来源的节点", () => {
    expect(() => validateRoute([
      { id: "b", title: "B", date: "1935-01-02", lon: 105, lat: 28, sourceIds: [] },
      { id: "a", title: "A", date: "1935-01-01", lon: 104, lat: 27, sourceIds: ["s1"] },
    ])).toThrow();
  });

  it("把进度稳定插值到首尾节点", () => {
    const nodes = [
      { id: "a", title: "A", date: "1934-01-01", lon: 100, lat: 20, sourceIds: ["s1"] },
      { id: "b", title: "B", date: "1934-01-02", lon: 110, lat: 30, sourceIds: ["s1"] },
    ];
    expect(interpolateRoute(nodes, 0)).toEqual({ lon: 100, lat: 20, segment: 0 });
    expect(interpolateRoute(nodes, 1)).toEqual({ lon: 110, lat: 30, segment: 0 });
  });
});

describe("细胞膜模型", () => {
  it("限制课堂控件边界", () => {
    expect(clampMembraneSettings({ outside: 120, inside: -4, channels: 12, atp: true }))
      .toEqual({ outside: 100, inside: 0, channels: 8, atp: true });
  });

  it("主动运输由 ATP 驱动：有 ATP 时泵入，无 ATP 时停止", () => {
    expect(transportDirection("active", 20, 80, true)).toBe("outside-to-inside");
    expect(transportDirection("active", 20, 80, false)).toBe("stopped");
  });
});

describe("案例清单", () => {
  it("重点案例清单：长征、圆锥曲线、细胞膜与 Blender 火山", () => {
    expect(caseManifests.map((entry) => entry.id)).toEqual([
      "long-march",
      "conic-lab",
      "membrane-lab",
      "blender-volcano",
    ]);
    expect(caseManifests.every((entry) => entry.sources.length > 0)).toBe(true);
    expect(caseManifests.every((entry) => entry.gradeBand === "high")).toBe(true);
  });

  it("迁入的完整目录统一标记为高中基线", async () => {
    const { lessonOrder } = await import("../src/content/catalog");
    expect(lessonOrder).toHaveLength(15);
    expect(lessonOrder.every((entry) => entry.gradeBand === "high")).toBe(true);
  });

  it("公开模式明确隔离需要本地资产的案例", async () => {
    const { requiresPrivateAssets } = await import("../src/routes");
    expect(requiresPrivateAssets("long-march")).toBe(true);
    expect(requiresPrivateAssets("blender")).toBe(true);
    expect(requiresPrivateAssets("geo")).toBe(true);
    expect(requiresPrivateAssets("conic")).toBe(false);
  });
});

describe("长征真实地形", () => {
  it("把高程映射为明显但受控的山体起伏", () => {
    expect(elevationToRelief(0)).toBeCloseTo(.12);
    expect(elevationToRelief(.5)).toBeGreaterThan(.9);
    expect(elevationToRelief(1)).toBeCloseTo(2.7);
  });

  it("高原与低地使用可辨识的分层色带", () => {
    expect(terrainColor(.1).getHex()).not.toBe(terrainColor(.85).getHex());
  });
});

describe("工作坊语言规格书", () => {
  it("找出模糊词并在提示词里保留六格内容", async () => {
    const { analyzeSpec, buildSpecPrompt, findVague } = await import("../src/domain/spec");
    const { WORKSHOP_EXAMPLES } = await import("../src/content/workshopExamples");
    expect(findVague("做一个漂亮的球，加一些粒子")).toEqual(["漂亮", "一些"]);
    const vague = analyzeSpec({ goal: "做一个漂亮生动的课件" });
    const precise = analyzeSpec(WORKSHOP_EXAMPLES[0].spec);
    expect(precise.precision).toBeGreaterThan(vague.precision);
    expect(precise.filled).toBe(6);
    const prompt = buildSpecPrompt(WORKSHOP_EXAMPLES[0].spec, "物理");
    expect(prompt).toContain("x = v₀·t");
    expect(prompt).toContain("单文件 HTML");
  });

  it("示例规格书本身不含模糊词", async () => {
    const { analyzeSpec } = await import("../src/domain/spec");
    const { WORKSHOP_EXAMPLES } = await import("../src/content/workshopExamples");
    for (const example of WORKSHOP_EXAMPLES) expect(analyzeSpec(example.spec).vague, example.topic).toEqual([]);
  });
});
