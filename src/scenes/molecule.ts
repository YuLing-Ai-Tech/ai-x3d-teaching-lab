import * as THREE from "three";
import type { Molecule } from "../domain/molecule";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import type { LangScene } from "../ui/langLab";

// 发光球棍模型 + 电子云粒子。换分子时旧分子炸散，新原子依次“长”出来。

const ELEMENT: Record<string, { color: number; radius: number }> = {
  H: { color: 0xb9c4d0, radius: .26 },
  C: { color: 0x5d6b7e, radius: .4 },
  N: { color: 0x4f7dff, radius: .4 },
  O: { color: 0xff4f5e, radius: .4 },
  S: { color: 0xffd34d, radius: .48 },
};
const elementOf = (symbol: string) => ELEMENT[symbol] ?? { color: 0xffb04d, radius: .44 };
const LIFT = 2.8;

interface Built { group: THREE.Group; atoms: THREE.Mesh[]; bonds: THREE.Mesh[]; cloud: THREE.Points; born: number }

function build(molecule: Molecule): Built {
  const group = new THREE.Group();
  group.position.y = LIFT;
  const atoms = molecule.atoms.map(([symbol, x, y, z], index) => {
    const { color, radius } = elementOf(symbol);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 40, 28),
      new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .07, roughness: .28, metalness: .05, clearcoat: 1, clearcoatRoughness: .12 }),
    );
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0);
    mesh.userData = { index, target: 1 };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: symbol === "H" ? .08 : .22, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(radius * 3);
    mesh.add(halo);
    group.add(mesh);
    return mesh;
  });
  const up = new THREE.Vector3(0, 1, 0);
  const bonds: THREE.Mesh[] = [];
  for (const [a, b, order] of molecule.bonds) {
    const start = atoms[a].position;
    const end = atoms[b].position;
    const direction = end.clone().sub(start);
    const length = direction.length();
    const side = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) < .9 ? up : new THREE.Vector3(1, 0, 0)).normalize();
    const count = order >= 3 ? 3 : order >= 1.5 ? 2 : 1;
    for (let lane = 0; lane < count; lane += 1) {
      const offset = (lane - (count - 1) / 2) * .17;
      for (const [from, color] of [[start, elementOf(molecule.atoms[a][0]).color], [end, elementOf(molecule.atoms[b][0]).color]] as Array<[THREE.Vector3, number]>) {
        const half = new THREE.Mesh(
          new THREE.CylinderGeometry(count > 1 ? .055 : .085, count > 1 ? .055 : .085, length / 2, 14),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: order === 1.5 && lane === 1 ? .55 : .3, roughness: .35, transparent: true }),
        );
        const mid = start.clone().add(end).multiplyScalar(.5);
        half.position.copy(from).add(mid).multiplyScalar(.5).addScaledVector(side, offset);
        half.quaternion.setFromUnitVectors(up, direction.clone().normalize());
        half.scale.set(1, 0, 1);
        half.userData = { order, index: Math.min(a, b) };
        group.add(half);
        bonds.push(half);
      }
    }
  }
  // 电子云：按原子半径做高斯散布的发光粒子
  const per = Math.max(60, Math.floor(2600 / molecule.atoms.length));
  const cloudPositions = new Float32Array(molecule.atoms.length * per * 3);
  const cloudColors = new Float32Array(molecule.atoms.length * per * 3);
  const color = new THREE.Color();
  molecule.atoms.forEach(([symbol, x, y, z], atom) => {
    color.set(elementOf(symbol).color);
    for (let index = 0; index < per; index += 1) {
      const spread = elementOf(symbol).radius * 2.1;
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * spread;
      const offset = (atom * per + index) * 3;
      cloudPositions.set([x + g(), y + g(), z + g()], offset);
      cloudColors.set([color.r, color.g, color.b], offset);
    }
  });
  const cloudGeometry = new THREE.BufferGeometry();
  cloudGeometry.setAttribute("position", new THREE.BufferAttribute(cloudPositions, 3));
  cloudGeometry.setAttribute("color", new THREE.BufferAttribute(cloudColors, 3));
  const cloud = new THREE.Points(cloudGeometry, new THREE.PointsMaterial({ map: glowTexture(), size: .06, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(cloud);
  return { group, atoms, bonds, cloud, born: performance.now() };
}

export function mountMolecule(stage: HTMLElement): LangScene<Molecule> {
  const context = createCinematicStage(stage, new THREE.Vector3(0, 4.2, 10.5), { accent: 0x3fffb0, target: new THREE.Vector3(0, LIFT, 0), dust: 1100, bloom: { strength: .7, radius: .45, threshold: .72 } });
  context.controls.autoRotate = true;
  context.controls.autoRotateSpeed = 1.1;
  context.scene.add(new THREE.DirectionalLight(0xffffff, 1.6).translateX(4).translateY(6).translateZ(5));
  const rim = new THREE.DirectionalLight(0x6fe9ff, 1.2);
  rim.position.set(-5, 2, -6);
  context.scene.add(rim);
  let current: Built | null = null;
  const leaving: Array<{ built: Built; t: number }> = [];
  let highlighted: string | null = null;

  const removeFrame = context.onFrame((delta) => {
    const now = performance.now();
    if (current) {
      const age = (now - current.born) / 1000;
      current.atoms.forEach((atom) => {
        const local = THREE.MathUtils.clamp((age - atom.userData.index * .045) / .5, 0, 1);
        const grow = local === 0 ? 0 : 1 + 2.4 * Math.pow(local - 1, 3) + 1.4 * Math.pow(local - 1, 2);
        const pulse = highlighted === "atom" ? 1 + Math.sin(now * .008 + atom.userData.index) * .12 : 1;
        atom.scale.setScalar(grow * pulse);
      });
      current.bonds.forEach((bond) => {
        const local = THREE.MathUtils.clamp((age - .25 - bond.userData.index * .045) / .45, 0, 1);
        bond.scale.set(1, local, 1);
        const material = bond.material as THREE.MeshStandardMaterial;
        const lit = highlighted === "bond" ? bond.userData.order > 1 : highlighted === "ring" ? bond.userData.order === 1.5 : false;
        material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, lit ? 1.8 : .3, 6, delta);
      });
      const cloudMaterial = current.cloud.material as THREE.PointsMaterial;
      cloudMaterial.opacity = THREE.MathUtils.damp(cloudMaterial.opacity, age > 1 ? .5 : 0, 2, delta);
      current.cloud.rotation.y += delta * .05;
    }
    for (let index = leaving.length - 1; index >= 0; index -= 1) {
      const entry = leaving[index];
      entry.t += delta;
      entry.built.group.children.forEach((child) => {
        child.position.multiplyScalar(1 + delta * 3.2);
        child.scale.multiplyScalar(1 - delta * 2.5);
      });
      if (entry.t > .6) {
        context.scene.remove(entry.built.group);
        entry.built.group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []).forEach((material) => material.dispose());
        });
        leaving.splice(index, 1);
      }
    }
  });

  return {
    update: (molecule) => {
      if (current) leaving.push({ built: current, t: 0 });
      current = build(molecule);
      context.scene.add(current.group);
      // 镜头按分子大小自动取景：小分子拉近，咖啡因这样的大分子退后
      const extent = Math.max(1.2, ...molecule.atoms.map(([, x, y, z]) => Math.hypot(x, y, z)));
      const direction = context.camera.position.clone().sub(context.controls.target).normalize();
      const target = new THREE.Vector3(0, LIFT, 0);
      context.flyTo(target.clone().addScaledVector(direction, Math.max(6, extent * 3.4)), target, 1.4);
      context.pulse(.7);
    },
    highlight: (role) => { highlighted = role; },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
