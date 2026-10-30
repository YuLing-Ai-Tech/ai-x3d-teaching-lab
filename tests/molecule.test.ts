import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeMolecule, relation, type Molecule, type PropertyTable } from "../src/domain/molecule";

// 分子：结构证据来自离线三维数据；性质数据必须带来源与适用条件。

const library = JSON.parse(readFileSync("public-core/data/molecules.json", "utf8")) as Molecule[];
const properties = JSON.parse(readFileSync("public-core/data/molecule-properties.json", "utf8")) as PropertyTable;
const get = (smiles: string) => library.find((molecule) => molecule.smiles === smiles)!;

describe("CCO 与 COC", () => {
  it("分子式相同、连接不同：同分异构体；氧的连接方式不同", () => {
    expect(get("CCO").formula).toBe(get("COC").formula);
    expect(relation(get("CCO"), get("COC"))).toBe("isomer");
    expect(analyzeMolecule(get("CCO")).oxygen).toContain("羟基");
    expect(analyzeMolecule(get("COC")).oxygen).toContain("醚键");
  });

  it("同一分子与自己是“同一物质”", () => {
    expect(relation(get("CCO"), get("CCO"))).toBe("same");
  });
});

describe("CCCC 与 CC(C)C", () => {
  it("主链 4 对 3、支链点 0 对 1，分子式相同", () => {
    const normal = analyzeMolecule(get("CCCC"));
    const iso = analyzeMolecule(get("CC(C)C"));
    expect([normal.mainChain, normal.branchPoints]).toEqual([4, 0]);
    expect([iso.mainChain, iso.branchPoints]).toEqual([3, 1]);
    expect(relation(get("CCCC"), get("CC(C)C"))).toBe("isomer");
  });
});

describe("C–C、C=C、C≡C", () => {
  it("键级越高键越短；乙炔线形、乙烯共面、乙烷立体", () => {
    const ethane = analyzeMolecule(get("CC"));
    const ethene = analyzeMolecule(get("C=C"));
    const ethyne = analyzeMolecule(get("C#C"));
    expect(ethane.ccLengths.single!).toBeGreaterThan(1.48);
    expect(ethene.ccLengths.double!).toBeGreaterThan(1.30);
    expect(ethene.ccLengths.double!).toBeLessThan(1.37);
    expect(ethyne.ccLengths.triple!).toBeGreaterThan(1.17);
    expect(ethyne.ccLengths.triple!).toBeLessThan(1.23);
    expect(ethyne.shape).toBe("线形");
    expect(ethene.shape).toBe("平面");
    expect(ethane.shape).toBe("立体");
    expect(ethyne.angle!.value).toBeGreaterThan(178);
    expect(Math.abs(ethene.angle!.value - 120)).toBeLessThan(4);
    expect(Math.abs(ethane.angle!.value - 109.5)).toBeLessThan(3);
  });
});

describe("性质数据", () => {
  it("每一条都有来源链接、数值与适用条件", () => {
    expect(properties.conditions).toContain("101.325 kPa");
    for (const smiles of ["CCO", "COC", "CCCC", "CC(C)C", "C=C", "C#C"]) {
      const item = properties.items[smiles];
      expect(item.url).toMatch(/^https:\/\/webbook\.nist\.gov\//);
      expect(item.boilingK).toBeGreaterThan(100);
      expect(item.state25C).toMatch(/液体|气体|固体/);
    }
    expect(properties.items.CCO.boilingK).toBeGreaterThan(properties.items.COC.boilingK);
    expect(properties.items.CCCC.boilingK).toBeGreaterThan(properties.items["CC(C)C"].boilingK);
  });
});
