import { describe, expect, it } from "vitest";
import { simulateOrbit, theoryPrecession } from "../src/domain/gravity";

// 引力：断言的是学生要记录的证据——结局、闭合、进动、数值误差——都来自同一个可复现的模拟。

const MARS = 2;   // r0 = 6，初速度 1.1 倍圆轨道速度：明显的椭圆
const EARTH = 1;  // r0 = 4.2，0.86 倍

describe("平方反比：轨道闭合", () => {
  it("近日点每圈几乎不动，近/远日点稳定", () => {
    const report = simulateOrbit({ exponent: 2, mass: 1 }, MARS);
    expect(report.fate).toBe("stable");
    expect(report.periapses).toBeGreaterThanOrEqual(5);
    expect(Math.abs(report.precession!)).toBeLessThan(0.5);
    expect(report.aphelion!).toBeGreaterThan(report.perihelion!);
  });

  it("蛙跳积分的能量误差很小（数值误差可量化）", () => {
    expect(simulateOrbit({ exponent: 2, mass: 1 }, MARS).energyError).toBeLessThan(1e-3);
  });
});

describe("偏离平方：进动与失稳", () => {
  it("2.1 次方：每圈同向进动，接近近圆理论 π/√(3−n)", () => {
    for (const planet of [EARTH, MARS]) {
      const report = simulateOrbit({ exponent: 2.1, mass: 1 }, planet);
      expect(report.fate).toBe("stable");
      expect(report.precession!).toBeGreaterThan(15);
      expect(Math.abs(report.precession! - theoryPrecession(2.1)!) / theoryPrecession(2.1)!).toBeLessThan(0.1);
    }
  });

  it("一次方（反比）：稳定但不闭合，近日点倒退", () => {
    const report = simulateOrbit({ exponent: 1, mass: 1 }, MARS);
    expect(report.fate).toBe("stable");
    expect(report.precession!).toBeLessThan(-90);
  });

  it("立方：没有稳定轨道，坠落或逃逸", () => {
    expect(simulateOrbit({ exponent: 3, mass: 1 }, EARTH).fate).toBe("crash");
    expect(simulateOrbit({ exponent: 3, mass: 1 }, MARS).fate).toBe("escape");
  });

  it("胡克力（正比，n = −1）：闭合——每半圈一个近日点", () => {
    const report = simulateOrbit({ exponent: -1, mass: 1 }, MARS);
    expect(report.fate).toBe("stable");
    expect(report.apsidalAdvance!).toBeCloseTo(180, 0);
  });
});

describe("中心质量", () => {
  it("质量减半：同样的初速度下外侧行星逃逸；质量加倍：仍然束缚", () => {
    expect(simulateOrbit({ exponent: 2, mass: 0.5 }, MARS).fate).toBe("escape");
    expect(simulateOrbit({ exponent: 2, mass: 2 }, MARS).fate).toBe("stable");
  });
});

describe("可复现", () => {
  it("同样的输入得到完全相同的结果", () => {
    expect(simulateOrbit({ exponent: 2.1, mass: 1 }, MARS)).toEqual(simulateOrbit({ exponent: 2.1, mass: 1 }, MARS));
  });
});
