import { describe, expect, it } from "vitest";
import { frontBack, judge, type Box, type SpatialMeasure } from "../src/domain/preposition";

// 介词：每个空间谓词由几何量判定；behind 随观察者改变，以参照物自身为准时不变。

const box = (x: number, y: number, z: number, hx: number, h: number, hz: number): Box => ({ min: [x - hx, y, z - hz], max: [x + hx, y + h, z + hz] });
const TABLE = box(0, 0, 0, 0.75, 0.98, 0.45);
const measure = (subject: Box, extra: Partial<SpatialMeasure> = {}): SpatialMeasure => ({ subject, path: [], landmarks: [TABLE], openings: [undefined], viewer: [5.5, 5.2, 9.5], ...extra });

describe("位置介词", () => {
  it("on：贴着顶面且在投影内；悬空就不成立", () => {
    expect(judge({ subject: "cat", relation: "on", landmarks: ["table"] }, measure(box(0, 0.98, 0, 0.3, 0.5, 0.2))).holds).toBe(true);
    expect(judge({ subject: "cat", relation: "on", landmarks: ["table"] }, measure(box(0, 1.5, 0, 0.3, 0.5, 0.2))).holds).toBe(false);
  });

  it("under：低于桌面且在投影内；放在旁边就不成立", () => {
    expect(judge({ subject: "cat", relation: "under", landmarks: ["table"] }, measure(box(0, 0, 0, 0.3, 0.5, 0.2))).holds).toBe(true);
    expect(judge({ subject: "cat", relation: "under", landmarks: ["table"] }, measure(box(2, 0, 0, 0.3, 0.5, 0.2))).holds).toBe(false);
  });
});

describe("路径介词", () => {
  const TUNNEL = box(0, 0, 0, 2.2, 1.7, 1.7);
  const straight = (y: number) => [-6, -3, 0, 3, 6].map((x) => [x, y, 0] as [number, number, number]);
  it("through：要有开口，且在开口高度内从一侧到另一侧", () => {
    const through = (opening: SpatialMeasure["openings"][number], y: number) => judge({ subject: "car", relation: "through", landmarks: ["tunnel"] },
      { subject: box(-6, 0, 0, 0.5, 0.5, 0.3), path: straight(y), landmarks: [TUNNEL], openings: [opening], viewer: [5, 5, 9] });
    expect(through({ bottom: 0, top: 1.3 }, 0).holds).toBe(true);
    expect(through(undefined, 0).holds).toBe(false);
    expect(through({ bottom: 0, top: 1.3 }, 2.5).holds).toBe(false);
  });

  it("around：绕满一圈且不穿过参照物", () => {
    const circle = Array.from({ length: 65 }, (_, i) => [Math.cos(i / 64 * 2 * Math.PI) * 3, 0, Math.sin(i / 64 * 2 * Math.PI) * 3] as [number, number, number]);
    expect(judge({ subject: "bird", relation: "around", landmarks: ["house"] }, { subject: box(3, 0, 0, 0.3, 0.3, 0.3), path: circle, landmarks: [TABLE], openings: [undefined], viewer: [5, 5, 9] }).holds).toBe(true);
    expect(judge({ subject: "bird", relation: "around", landmarks: ["house"] }, { subject: box(3, 0, 0, 0.3, 0.3, 0.3), path: circle.slice(0, 33), landmarks: [TABLE], openings: [undefined], viewer: [5, 5, 9] }).holds).toBe(false);
  });
});

describe("behind 取决于参照系", () => {
  const BOX = box(0, 0, 0, 0.5, 1, 0.5);
  const ball = box(0.3, 0, -2.2, 0.4, 0.8, 0.4);
  it("从前面看成立；绕到后面看就不成立；以盒子自身前后为准始终成立", () => {
    const front = frontBack("behind", { subject: ball, path: [], landmarks: [BOX], openings: [undefined], viewer: [2, 3, 9] });
    const back = frontBack("behind", { subject: ball, path: [], landmarks: [BOX], openings: [undefined], viewer: [-1, 3, -9] });
    expect(front.observer.holds).toBe(true);
    expect(back.observer.holds).toBe(false);
    expect(front.intrinsic.holds).toBe(true);
    expect(back.intrinsic.holds).toBe(true);
  });
});
