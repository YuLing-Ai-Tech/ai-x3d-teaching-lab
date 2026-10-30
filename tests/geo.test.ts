import { describe, expect, it } from "vitest";
import { analyzeProfile, insideOutline, landGrid, shareAbove, type ProfileSample } from "../src/domain/geo";

// 地理：结论来自采样——有三级阶梯才说三级阶梯。

const profile = (heights: Array<[number, number]>): ProfileSample[] => heights.map(([at, metres]) => ({ at, metres, inside: true }));
const line = (from: number, to: number, metres: number, step = 0.5) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => [from + i * step, metres] as [number, number]);

describe("剖面分析", () => {
  it("高原 → 盆地/高原 → 平原：判定为三级阶梯，并给出分界位置", () => {
    const result = analyzeProfile(profile([...line(80, 100, 4500), ...line(100.5, 110, 1200), ...line(110.5, 121, 50)]));
    expect(result.staircase).toBe(true);
    expect(result.boundaries.map((b) => b.at)).toEqual([100.5, 110.5]);
  });

  it("没有第一级（只在 500–3000 米与平原之间）：不是三级阶梯", () => {
    const result = analyzeProfile(profile([...line(80, 105, 1300), ...line(105.5, 120, 80)]));
    expect(result.staircase).toBe(false);
    expect(result.tiers).toEqual([2, 3]);
  });

  it("短于 1.5° 的孤峰并入相邻段，不算一级台阶", () => {
    const result = analyzeProfile(profile([...line(80, 95, 1200), ...line(95.5, 96, 3500), ...line(96.5, 110, 1200), ...line(110.5, 120, 50)]));
    expect(result.tiers).toEqual([2, 3]);
  });

  it("境外采样不计入", () => {
    const samples = [...profile(line(80, 100, 4500)), { at: 101, metres: 9000, inside: false }];
    expect(analyzeProfile(samples).max.metres).toBe(4500);
  });
});

describe("国界内外判定", () => {
  const square = { features: [{ geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }] };
  it("点在多边形内 / 外", () => {
    expect(insideOutline(square, 5, 5)).toBe(true);
    expect(insideOutline(square, 15, 5)).toBe(false);
  });
});

describe("面积占比", () => {
  it("网格按纬度余弦加权：高纬度格点的面积更小", () => {
    const box = { features: [{ geometry: { type: "Polygon" as const, coordinates: [[[100, 20], [101, 20], [101, 50], [100, 50], [100, 20]]] } }] };
    const grid = landGrid(box, 0.5);
    expect(grid.length).toBe(2 * 60);
    // 北半段（35°–50°）海拔 1000 米，南半段为 0：北半段面积小于一半
    const share = shareAbove(grid, 500, (_lon, lat) => (lat > 35 ? 1000 : 0));
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
  });
});
