import { describe, expect, it } from "vitest";
import { parseShape, translate } from "../src/domain/compiler";
import { parsePoem } from "../src/domain/poem";
import { parseGravity, predictOrbit } from "../src/domain/gravity";
import { NORMAL_HBB, readGene } from "../src/domain/dna";
import { parseSentence } from "../src/domain/preposition";
import { parseGeo } from "../src/domain/geo";
import { tokenizeSmiles } from "../src/domain/molecule";
import { lessonOrder } from "../src/content/catalog";
import { courseSlides } from "../src/content/slides";

describe("语言编译台", () => {
  it("中文和英文读出同一个世界", () => {
    const zh = parseShape("一个半径为 2 的球").spec!;
    const en = parseShape("A sphere of radius 2").spec!;
    expect(zh).toEqual(en);
    expect(translate(zh).math).toBe("x² + y² + z² = 2²");
  });
  it("没说清楚的数量会被标记为“猜的”，模糊词被标红", () => {
    const { spec, tokens } = parseShape("一个漂亮的球");
    expect(spec!.guessed).toEqual(["r"]);
    expect(tokens.some((token) => token.role === "vague")).toBe(true);
  });
});

describe("古诗即几何", () => {
  it("一个字改变一个几何属性", () => {
    expect(parsePoem("大漠孤烟直，长河落日圆").world).toMatchObject({ smokeShape: "straight", disc: "full", smokeCount: 1, river: true });
    expect(parsePoem("大漠孤烟斜，长河落日缺").world).toMatchObject({ smokeShape: "slant", disc: "broken" });
    expect(parsePoem("大漠孤烟直，长河落月圆").world.body).toBe("moon");
  });
});

describe("一句话定义引力", () => {
  it("平方 / 立方 / 正比 / English", () => {
    expect(parseGravity("引力与距离的平方成反比").law).toEqual({ exponent: 2, mass: 1 });
    expect(parseGravity("引力与距离的立方成反比").law!.exponent).toBe(3);
    expect(parseGravity("引力与距离成正比").law!.exponent).toBe(-1);
    expect(parseGravity("Gravity is inversely proportional to the square of distance").law!.exponent).toBe(2);
    expect(parseGravity("中心天体质量加倍，引力与距离的平方成反比").law!.mass).toBe(2);
  });
  it("只有平方反比与正比给出闭合轨道", () => {
    expect(predictOrbit({ exponent: 2, mass: 1 }).tone).toBe("ok");
    expect(predictOrbit({ exponent: -1, mass: 1 }).tone).toBe("ok");
    expect(predictOrbit({ exponent: 3, mass: 1 }).tone).toBe("warn");
  });
});

describe("DNA 是语言", () => {
  it("正常、同义、错义（镰刀型）、无义", () => {
    expect(readGene(NORMAL_HBB)!.outcome).toBe("normal");
    expect(readGene("ATG GTG CAC CTG ACT CCT GAA GAG AAG")!.outcome).toBe("silent");
    const sickle = readGene("ATG GTG CAC CTG ACT CCT GTG GAG AAG")!;
    expect(sickle.outcome).toBe("missense");
    expect(sickle.protein[6]).toBe("V");
    expect(readGene("ATG GTG CAC CTG ACT CCT TAG GAG AAG")!.outcome).toBe("nonsense");
  });
});

describe("介词即空间", () => {
  it("读出主体、介词、参照物", () => {
    expect(parseSentence("The cat is under the table.").sentence).toEqual({ subject: "cat", relation: "under", landmarks: ["table"] });
    expect(parseSentence("The ball rolls into the box.").sentence!.relation).toBe("into");
    expect(parseSentence("The cat is between the box and the tree.").sentence!.landmarks).toEqual(["box", "tree"]);
    expect(parseSentence("The cat is between the box.").sentence).toBeNull();
    expect(parseSentence("The bird flies through the window.").sentence!.landmarks).toEqual(["window"]);
    expect(parseSentence("The cat walks through the box.").sentence).toBeNull();
  });
});

describe("用坐标说话", () => {
  it("剖面、海平面、等高面、定位", () => {
    expect(parseGeo("沿北纬 31° 做一条东西向剖面").query).toMatchObject({ kind: "profile", axis: "lat", value: 31 });
    expect(parseGeo("沿东经 104° 做一条南北向剖面").query).toMatchObject({ kind: "profile", axis: "lon", value: 104 });
    expect(parseGeo("海平面上升 100 米").query).toEqual({ kind: "flood", metres: 100 });
    expect(parseGeo("海拔 3000 米以上").query).toEqual({ kind: "above", metres: 3000 });
    expect(parseGeo("定位 东经 86.9°，北纬 27.99°").query).toEqual({ kind: "pin", lon: 86.9, lat: 27.99 });
  });
});

describe("SMILES", () => {
  it("区分原子、键、支链、成环", () => {
    const roles = tokenizeSmiles("CC(=O)Oc1ccccc1").map((token) => token.role);
    expect(roles.slice(0, 6)).toEqual(["atom", "atom", "branch", "bond", "atom", "branch"]);
    expect(roles).toContain("ring");
  });
});

describe("讲课流程", () => {
  it("主课件里案例第一次出现的顺序 = 首页讲课顺序，且每个案例都有入口", () => {
    const seen: string[] = [];
    for (const slide of courseSlides) {
      for (const link of [slide.jump, ...(slide.also ?? [])]) if (link && !seen.includes(link.route)) seen.push(link.route);
    }
    expect(seen).toEqual(lessonOrder.map((entry) => entry.route));
  });
});

describe("DNA：只对真正的情形下结论", () => {
  it("镰刀型只认第 7 个密码子 Glu→Val；别处的错义不是镰刀型", async () => {
    const { isSickle } = await import("../src/domain/dna");
    expect(isSickle(readGene("ATG GTG CAC CTG ACT CCT GTG GAG AAG")!)).toBe(true);
    const elsewhere = readGene("ATG GTG CAC GTG ACT CCT GAG GAG AAG")!;  // 第 4 个密码子 Leu→Val
    expect(elsewhere.outcome).toBe("missense");
    expect(isSickle(elsewhere)).toBe(false);
  });

  it("插入或删除一个碱基是移码；之后的氨基酸从改动处开始全部不同", async () => {
    const { firstDivergence } = await import("../src/domain/dna");
    const inserted = readGene("ATG GTG CAC ACTG ACT CCT GAG GAG AAG")!;
    expect(inserted.outcome).toBe("frameshift");
    expect(firstDivergence(inserted)).toBe(4);
    expect(readGene("ATG GTG CAC TG ACT CCT GAG GAG AAG")!.outcome).toBe("frameshift");
  });

  it("末位密码子变成终止也算无义", () => {
    expect(readGene("ATG GTG CAC CTG ACT CCT GAG GAG TAG")!.outcome).toBe("nonsense");
  });
});
