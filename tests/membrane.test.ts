import { describe, expect, it } from "vitest";
import { CARRIER_VMAX, createMembraneSim, netRate } from "../src/domain/membrane";

// 细胞膜：断言的是课堂要用的证据——双向计数、动态平衡、载体饱和、能量依赖、粒子守恒。

const run = (sim: ReturnType<typeof createMembraneSim>, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) sim.step(0.05);
  return sim.state;
};

describe("自由扩散", () => {
  it("两个方向都有粒子穿膜，净移动从高浓度到低浓度", () => {
    const state = run(createMembraneSim("diffusion", { outside: 80, inside: 20, channels: 0, atp: false }, 1), 20);
    expect(state.inward).toBeGreaterThan(0);
    expect(state.outward).toBeGreaterThan(0);
    expect(state.inward).toBeGreaterThan(state.outward);
  });

  it("最终达到动态平衡：浓度接近相等，但两个方向的计数仍在增加", () => {
    const sim = createMembraneSim("diffusion", { outside: 90, inside: 10, channels: 0, atp: false }, 2);
    run(sim, 400);
    expect(Math.abs(sim.state.outside - sim.state.inside)).toBeLessThan(18);
    const before = { inward: sim.state.inward, outward: sim.state.outward };
    run(sim, 60);
    expect(sim.state.inward - before.inward).toBeGreaterThan(10);
    expect(sim.state.outward - before.outward).toBeGreaterThan(10);
  });

  it("粒子总数守恒", () => {
    const state = run(createMembraneSim("diffusion", { outside: 73, inside: 41, channels: 0, atp: false }, 3), 120);
    expect(state.outside + state.inside).toBe(114);
  });
});

describe("协助扩散", () => {
  it("没有载体就不运输", () => {
    const state = run(createMembraneSim("facilitated", { outside: 80, inside: 0, channels: 0, atp: false }, 4), 30);
    expect(state.inward + state.outward).toBe(0);
  });

  it("浓度差变大时速率趋于饱和；上限由载体数决定", () => {
    const rate = (outside: number, channels: number) => netRate("facilitated", { outside, inside: 0, channels, atp: false });
    expect(rate(40, 4) / rate(20, 4)).toBeLessThan(2);
    expect(rate(100, 4) / rate(40, 4)).toBeLessThan(1.5);
    expect(rate(100, 4)).toBeLessThan(4 * CARRIER_VMAX);
    expect(rate(100, 8)).toBeCloseTo(2 * rate(100, 4), 9);
  });
});

describe("主动运输", () => {
  it("消耗 ATP 把粒子泵入膜内，可以逆浓度梯度累积；每运一个耗一个 ATP", () => {
    const state = run(createMembraneSim("active", { outside: 50, inside: 50, channels: 4, atp: true }, 5), 30);
    expect(state.inside).toBeGreaterThan(state.outside);
    expect(state.atpUsed).toBe(state.inward);
  });

  it("关闭 ATP 后立即停止", () => {
    const sim = createMembraneSim("active", { outside: 50, inside: 50, channels: 4, atp: true }, 6);
    run(sim, 10);
    sim.set({ atp: false });
    const snapshot = { ...sim.state };
    run(sim, 10);
    expect(sim.state.inward).toBe(snapshot.inward);
    expect(sim.state.inside).toBe(snapshot.inside);
  });

  it("顺浓度梯度时泵也在工作并消耗 ATP（判断依据是耗能与载体）", () => {
    const state = run(createMembraneSim("active", { outside: 80, inside: 0, channels: 4, atp: true }, 7), 5);
    expect(state.inward).toBeGreaterThan(0);
    expect(state.atpUsed).toBeGreaterThan(0);
  });
});

describe("可复现", () => {
  it("同一种子得到同一结果", () => {
    const a = run(createMembraneSim("diffusion", { outside: 80, inside: 20, channels: 0, atp: false }, 42), 30);
    const b = run(createMembraneSim("diffusion", { outside: 80, inside: 20, channels: 0, atp: false }, 42), 30);
    expect(a).toEqual(b);
  });
});
