#!/usr/bin/env python3
"""Bake 3D coordinates for the SMILES lab (offline at class time).

Run with:  uv run --with rdkit python scripts/build-molecules.py
Output:    public/data/molecules.json  (atoms, bonds, formula, aliases)
"""

from __future__ import annotations

import json
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolDescriptors

MOLECULES = [
    ("CCO", "乙醇", "俗称酒精；酒类饮品是含少量乙醇的混合物，工业酒精、高浓度乙醇不可饮用", ["OCC", "C(O)C"]),
    ("COC", "二甲醚", "与乙醇分子式相同、连接方式不同", []),
    ("O", "水", "", []),
    ("C", "甲烷", "天然气的主要成分", []),
    ("O=C=O", "二氧化碳", "", ["C(=O)=O"]),
    ("N", "氨", "", []),
    ("CC", "乙烷", "", []),
    ("C=C", "乙烯", "植物激素，可催熟果实", []),
    ("C#C", "乙炔", "", []),
    ("CCCC", "正丁烷", "", []),
    ("CC(C)C", "异丁烷", "和正丁烷互为同分异构体", ["C(C)(C)C"]),
    ("c1ccccc1", "苯", "", ["C1=CC=CC=C1"]),
    ("C1CCCCC1", "环己烷", "", []),
    ("CC(=O)O", "乙酸", "醋的主要成分", ["OC(C)=O", "CC(O)=O"]),
    ("NCC(=O)O", "甘氨酸", "最简单的氨基酸", []),
    ("OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "葡萄糖", "环状结构", []),
    ("CC(=O)Oc1ccccc1C(=O)O", "阿司匹林", "", []),
    ("Cn1cnc2c1c(=O)n(C)c(=O)n2C", "咖啡因", "", []),
]


def bake(smiles: str) -> dict:
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    AllChem.EmbedMolecule(mol, randomSeed=7)
    AllChem.MMFFOptimizeMolecule(mol)
    conf = mol.GetConformer()
    centre = [sum(conf.GetAtomPosition(i)[k] for i in range(mol.GetNumAtoms())) / mol.GetNumAtoms() for k in range(3)]
    atoms = [[a.GetSymbol(), *[round(conf.GetAtomPosition(a.GetIdx())[k] - centre[k], 3) for k in range(3)]] for a in mol.GetAtoms()]
    bonds = [[b.GetBeginAtomIdx(), b.GetEndAtomIdx(), 1.5 if b.GetIsAromatic() else b.GetBondTypeAsDouble()] for b in mol.GetBonds()]
    return {"atoms": atoms, "bonds": bonds, "formula": rdMolDescriptors.CalcMolFormula(mol)}


def main() -> None:
    out = []
    for smiles, name, note, aliases in MOLECULES:
        entry = {"smiles": smiles, "name": name, "note": note, "aliases": aliases, **bake(smiles)}
        out.append(entry)
        print(f"{name:6} {smiles:42} {entry['formula']:10} atoms={len(entry['atoms'])}")
    path = Path(__file__).resolve().parents[1] / "public" / "data" / "molecules.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(path, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
