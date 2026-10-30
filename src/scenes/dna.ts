import * as THREE from "three";
import { AMINO, isSickle, type Gene } from "../domain/dna";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import type { LangScene } from "../ui/langLab";

// DNA 双螺旋（按输入序列着色）→ 阅读框逐个密码子扫描 → 氨基酸珠串长出 → 背景红细胞随结果变形。

const BASE_COLOR: Record<string, number> = { A: 0xff5d6c, T: 0xffd34d, G: 0x4dffa0, C: 0x4db8ff };
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
const KIND_COLOR = { hydrophobic: 0xffa04d, acidic: 0xff4d7a, basic: 0x6f8bff, polar: 0x4dffc8, stop: 0xffffff };
const STEP = .42;
const HELIX_Y = 2.2;
const CHAIN_Y = 4.9;

function bloodCell(sickle: boolean, pale: boolean): THREE.Object3D {
  const color = pale ? 0x7a5560 : 0xd8283c;
  const material = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .2, roughness: .35, clearcoat: .8, transparent: true, opacity: pale ? .5 : .95 });
  if (sickle) return new THREE.Mesh(new THREE.TorusGeometry(.9, .24, 16, 40, Math.PI * 1.15), material);
  // 双凹圆盘：厚边（圆环）+ 薄中心（扁圆柱）
  const cell = new THREE.Group();
  cell.add(new THREE.Mesh(new THREE.TorusGeometry(.72, .3, 18, 40).scale(1, 1, .75), material));
  cell.add(new THREE.Mesh(new THREE.CylinderGeometry(.74, .74, .16, 40).rotateX(Math.PI / 2), material));
  return cell;
}

export function mountDna(stage: HTMLElement): LangScene<Gene> {
  const context = createCinematicStage(stage, new THREE.Vector3(1.5, 5.2, 13.5), { accent: 0xff6b8b, target: new THREE.Vector3(0, 3.2, 0), dust: 900, bloom: { strength: .75, radius: .45, threshold: .6 } });
  context.scene.add(new THREE.DirectionalLight(0xffffff, 1.5).translateX(2).translateY(8).translateZ(8));
  let helix = new THREE.Group();
  let chain = new THREE.Group();
  let cells = new THREE.Group();
  const reader = new THREE.Mesh(new THREE.TorusGeometry(.75, .045, 12, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }));
  reader.rotation.y = Math.PI / 2;
  const readerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe0f0, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  readerGlow.scale.setScalar(2.4);
  reader.add(readerGlow);
  context.scene.add(reader);
  let gene: Gene | null = null;
  let clock = 0;
  let highlighted: string | null = null;
  const beads: THREE.Mesh[] = [];
  const mutationMarks: THREE.Object3D[] = [];

  const removeFrame = context.onFrame((delta) => {
    clock += delta;
    if (!gene) return;
    helix.rotation.x += delta * .35;
    const n = gene.codons.length;
    const cycle = n * .75 + 2.5;
    const t = clock % cycle;
    const reading = Math.min(n - .001, t / .75);
    const codonIndex = Math.floor(reading);
    const x0 = -(n * 3 - 1) * STEP / 2;
    reader.position.set(x0 + (codonIndex * 3 + 1) * STEP, HELIX_Y, 0);
    reader.visible = t < n * .75;
    const stopAt = gene.codons.findIndex((codon) => codon.amino === "*");
    beads.forEach((bead, index) => {
      const shown = index < (t < n * .75 ? codonIndex + 1 : n) && (stopAt < 0 || index < stopAt);
      const s = THREE.MathUtils.damp(bead.scale.x, shown ? 1 : 0, 10, delta);
      bead.scale.setScalar(s * (highlighted === "mutation" && gene!.codons[index].mutated ? 1.35 + Math.sin(clock * 9) * .1 : 1));
    });
    mutationMarks.forEach((mark) => { mark.visible = true; (mark as THREE.Sprite).material.opacity = .45 + Math.sin(clock * 6) * .35 + (highlighted === "mutation" ? .3 : 0); });
    cells.children.forEach((cell, index) => {
      cell.rotation.x += delta * (.2 + index * .03);
      cell.rotation.y += delta * .15;
      cell.position.y = cell.userData.y + Math.sin(clock * .6 + index) * .25;
    });
  });

  return {
    update: (next) => {
      gene = next;
      clock = 0;
      [helix, chain, cells].forEach((group) => context.scene.remove(group));
      helix = new THREE.Group();
      chain = new THREE.Group();
      cells = new THREE.Group();
      beads.length = 0;
      mutationMarks.length = 0;
      const letters = next.codons.map((codon) => codon.bases).join("");
      const x0 = -(letters.length - 1) * STEP / 2;
      const strandA: THREE.Vector3[] = [];
      const strandB: THREE.Vector3[] = [];
      [...letters].forEach((base, index) => {
        const angle = index * .62;
        const x = x0 + index * STEP;
        const a = new THREE.Vector3(x, Math.cos(angle) * .95, Math.sin(angle) * .95);
        const b = new THREE.Vector3(x, -a.y, -a.z);
        strandA.push(a); strandB.push(b);
        const codon = next.codons[Math.floor(index / 3)];
        for (const [from, letter] of [[a, base], [b, PAIR[base]]] as Array<[THREE.Vector3, string]>) {
          const rung = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .95, 8), new THREE.MeshStandardMaterial({ color: BASE_COLOR[letter], emissive: BASE_COLOR[letter], emissiveIntensity: codon.mutated ? 1.4 : .45 }));
          rung.position.copy(from).multiplyScalar(.5);
          rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().setX(0).normalize());
          rung.position.x = x;
          helix.add(rung);
        }
      });
      for (const strand of [strandA, strandB]) {
        helix.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strand), strand.length * 6, .09, 10), new THREE.MeshStandardMaterial({ color: 0x9fbbe6, emissive: 0x4f78d6, emissiveIntensity: .22, roughness: .3 })));
      }
      helix.position.y = HELIX_Y;
      next.codons.forEach((codon, index) => {
        if (codon.mutated) {
          const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3355, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          mark.scale.setScalar(2.6);
          mark.position.set(x0 + (index * 3 + 1) * STEP, HELIX_Y, 0);
          chain.add(mark);
          mutationMarks.push(mark);
        }
        const info = AMINO[codon.amino];
        const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 3), new THREE.MeshPhysicalMaterial({ color: KIND_COLOR[info.kind], emissive: KIND_COLOR[info.kind], emissiveIntensity: codon.mutated ? .9 : .35, roughness: .25, clearcoat: 1 }));
        bead.position.set(x0 + (index * 3 + 1) * STEP, CHAIN_Y + Math.sin(index * 1.3) * .25, 0);
        bead.scale.setScalar(0);
        if (codon.mutated) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .04, 10, 40), new THREE.MeshBasicMaterial({ color: 0xff3355 }));
          bead.add(ring);
        }
        chain.add(bead);
        beads.push(bead);
      });
      const sickle = isSickle(next);  // 只有第 7 个密码子 Glu→Val 才画镰刀形
      const pale = next.outcome === "nonsense" || next.outcome === "frameshift";
      for (let index = 0; index < 9; index += 1) {
        const cell = bloodCell(sickle && index % 3 !== 0, pale);
        cell.position.set(-11 + index * 2.8, 0, -13 - (index % 3) * 2.5);
        cell.userData.y = 8.2 + (index % 2) * 1.6;
        cell.scale.setScalar(1 + (index % 3) * .2);
        cells.add(cell);
      }
      context.scene.add(helix, chain, cells);
      context.pulse(.8);
    },
    highlight: (role) => { highlighted = role; },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
