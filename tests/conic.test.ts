import { describe, expect, it } from "vitest";
import {
  classify, coneResidual, dandelinSpheres, eccentricity, measurePoint, planeToWorld, sampleConic, solveConic,
} from "../src/domain/conic";

// 圆锥曲线：所有断言都回到几何本身——曲线点必须在圆锥上，焦点必须是 Dandelin 球的切点。

const ALPHA = 30;

describe("截线类型只由 β 与 α 的关系决定", () => {
  it("水平切是圆，β > α 椭圆，β = α 抛物线，β < α 双曲线", () => {
    expect(classify(ALPHA, 90)).toBe("circle");
    expect(classify(ALPHA, 62)).toBe("ellipse");
    expect(classify(ALPHA, 30)).toBe("parabola");
    expect(classify(ALPHA, 10)).toBe("hyperbola");
  });

  it("抛物线跟着母线走，不是固定 45°", () => {
    expect(classify(20, 20)).toBe("parabola");
    expect(classify(40, 40)).toBe("parabola");
    expect(classify(40, 45)).toBe("ellipse");
  });

  it("离心率 e = cosβ / cosα，跨过临界角时连续穿过 1", () => {
    expect(eccentricity(ALPHA, 31)).toBeLessThan(1);
    expect(eccentricity(ALPHA, 29)).toBeGreaterThan(1);
    expect(solveConic({ alpha: ALPHA, beta: 30, h: 2 }).e).toBe(1);
    expect(solveConic({ alpha: ALPHA, beta: 90, h: 2 }).e).toBe(0);
  });
});

describe("采样出的曲线确实在圆锥上", () => {
  for (const beta of [90, 62, 30, 12]) {
    it(`β = ${beta}°`, () => {
      const section = solveConic({ alpha: ALPHA, beta, h: 2.2 });
      const runs = sampleConic(section, 5.4);
      expect(runs.length).toBe(beta < ALPHA ? 2 : 1);
      for (const [s, t] of runs.flat()) {
        expect(Math.abs(coneResidual(ALPHA, planeToWorld(section.input, s, t)))).toBeLessThan(1e-6);
      }
    });
  }
});

describe("标准量之间的关系", () => {
  it("椭圆 a² = b² + c²，e = c / a", () => {
    const section = solveConic({ alpha: ALPHA, beta: 55, h: 2 });
    expect(section.a ** 2).toBeCloseTo(section.b ** 2 + section.c ** 2, 9);
    expect(section.c / section.a).toBeCloseTo(section.e, 9);
  });

  it("双曲线 c² = a² + b²，e = c / a", () => {
    const section = solveConic({ alpha: ALPHA, beta: 15, h: 2 });
    expect(section.c ** 2).toBeCloseTo(section.a ** 2 + section.b ** 2, 9);
    expect(section.c / section.a).toBeCloseTo(section.e, 9);
  });

  it("平移切面只放大图形，e 不变，a 与 h 成正比", () => {
    const near = solveConic({ alpha: ALPHA, beta: 50, h: 1 });
    const far = solveConic({ alpha: ALPHA, beta: 50, h: 3 });
    expect(far.e).toBeCloseTo(near.e, 12);
    expect(far.a / near.a).toBeCloseTo(3, 9);
  });

  it("过顶点时退化：点、一条直线、两条相交直线", () => {
    expect(solveConic({ alpha: ALPHA, beta: 60, h: 0 }).degenerate).toBe("point");
    expect(solveConic({ alpha: ALPHA, beta: 30, h: 0 }).degenerate).toBe("line");
    expect(solveConic({ alpha: ALPHA, beta: 10, h: 0 }).degenerate).toBe("line-pair");
  });
});

describe("Dandelin 双球的切点就是焦点，切圆平面给出准线", () => {
  for (const beta of [70, 50, 30, 15]) {
    it(`β = ${beta}°`, () => {
      const input = { alpha: ALPHA, beta, h: 2 };
      const section = solveConic(input);
      const spheres = dandelinSpheres(input);
      expect(spheres.length).toBe(beta === ALPHA ? 1 : 2);
      const sphereFoci = spheres.map((sphere) => sphere.focusT).sort((a, b) => a - b);
      const sphereDirectrices = spheres.map((sphere) => sphere.directrixT).sort((a, b) => a - b);
      const analyticFoci = [...section.foci].sort((a, b) => a - b);
      const analyticDirectrices = [...section.directrices].sort((a, b) => a - b);
      sphereFoci.forEach((focus, index) => expect(focus).toBeCloseTo(analyticFoci[index], 9));
      sphereDirectrices.forEach((line, index) => expect(line).toBeCloseTo(analyticDirectrices[index], 9));
    });
  }
});

describe("动点 P 的定义量", () => {
  it("椭圆：|PF₁| + |PF₂| 恒等于 2a；|PF|/d = e", () => {
    const section = solveConic({ alpha: ALPHA, beta: 60, h: 2 });
    for (const u of [0.05, 0.3, 0.62, 0.9]) {
      const measure = measurePoint(section, u)!;
      expect(measure.invariant).toBeCloseTo(2 * section.a, 9);
      expect(measure.ratio).toBeCloseTo(section.e, 9);
    }
  });

  it("双曲线：||PF₁| − |PF₂|| 恒等于 2a；|PF|/d = e", () => {
    const section = solveConic({ alpha: ALPHA, beta: 18, h: 2 });
    for (const u of [0.1, 0.5, 0.85]) {
      const measure = measurePoint(section, u)!;
      expect(measure.invariant).toBeCloseTo(2 * section.a, 9);
      expect(measure.ratio).toBeCloseTo(section.e, 9);
    }
  });

  it("抛物线：|PF| = d", () => {
    const section = solveConic({ alpha: ALPHA, beta: ALPHA, h: 2 });
    for (const u of [0.1, 0.5, 0.85]) {
      const measure = measurePoint(section, u)!;
      expect(measure.invariant).toBeCloseTo(0, 9);
      expect(measure.ratio).toBeCloseTo(1, 9);
    }
  });
});

describe("参数校验", () => {
  it("拒绝非数字与越界角度", () => {
    expect(() => solveConic({ alpha: Number.NaN, beta: 40, h: 1 })).toThrow();
    expect(() => solveConic({ alpha: 30, beta: 120, h: 1 })).toThrow();
  });
});
