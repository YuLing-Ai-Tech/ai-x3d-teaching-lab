import * as THREE from "three";
import type { MembraneState, TransportMode } from "../domain/membrane";
import { createStage } from "../three/setup";
import { createTagLayer } from "../three/tags";

// 细胞膜实验舱：画面里的粒子数严格跟随模拟里的计数（domain/membrane.ts）。
// 粒子在各自小室里做布朗运动、碰壁反弹（不再“从顶部穿越到底部”）；只有模拟判定穿膜时，
// 才沿通道 / 载体 / 磷脂双层走一段可见的穿膜路径。主动运输每运一个粒子，泵上闪一下黄色（消耗 1 个 ATP）。

const HALF_X = 6.2;
const HALF_Z = 2.4;
const ROOF = 4.2;
const GAP = 0.62;
const MAX_PARTICLES = 220;
const CROSS_SECONDS = 0.7;

interface Particle { side: 1 | -1; pos: THREE.Vector3; vel: THREE.Vector3; cross?: { t: number; from: THREE.Vector3; via: THREE.Vector3; to: THREE.Vector3 } }

export interface MembraneSceneApi {
  sync: (state: MembraneState, events: { inward: number; outward: number }, dt: number) => void;
  setMode: (mode: TransportMode, channels: number, atp: boolean) => void;
  reset: (state: MembraneState) => void;
  dispose: () => void;
}

function seeded(index: number): number {
  const value = Math.sin(index * 9283.17 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function mountMembrane(stage: HTMLElement): MembraneSceneApi {
  const context = createStage(stage, new THREE.Vector3(6.5, 2.6, 14.5));  // nearly side-on: both compartments visible
  const { scene, camera, controls } = context;
  controls.target.set(0, 0, 0);
  scene.fog = new THREE.FogExp2(0x02070b, 0.018);
  const tags = createTagLayer(stage);
  context.onFrame(() => tags.update(camera));
  tags.add("膜外（细胞外）", new THREE.Vector3(-HALF_X + 1.2, ROOF - 0.3, 0), "tag-muted");
  tags.add("膜内（细胞质）", new THREE.Vector3(-HALF_X + 1.2, -ROOF + 0.3, 0), "tag-muted");
  tags.add("磷脂双分子层", new THREE.Vector3(HALF_X + 0.3, 0, HALF_Z), "tag-muted");

  // 磷脂双层：亲水头（球）+ 疏水尾（细圆柱），用实例化网格，几千个分子也只占几次绘制
  const spacing = 0.42;
  const columns = Math.floor((2 * HALF_X) / spacing);
  const rows = Math.floor((2 * HALF_Z) / spacing);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9946a, roughness: 0.45 }), columns * rows * 2);
  const tails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 5), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.8 }), columns * rows * 4);
  const matrix = new THREE.Matrix4();
  let h = 0;
  let t = 0;
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const x = -HALF_X + (i + 0.5) * spacing + (seeded(i * 97 + j) - 0.5) * 0.06;
      const z = -HALF_Z + (j + 0.5) * spacing + (seeded(i * 31 + j * 7) - 0.5) * 0.06;
      for (const leaflet of [1, -1]) {
        matrix.makeTranslation(x, leaflet * 0.5, z);
        heads.setMatrixAt(h++, matrix);
        for (const offset of [-0.05, 0.05]) {
          matrix.makeTranslation(x + offset, leaflet * 0.24, z);
          tails.setMatrixAt(t++, matrix);
        }
      }
    }
  }
  scene.add(heads, tails);

  // 通道 / 载体 / 泵：同一组位置，按模式换外观
  const slots = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(-HALF_X + 1.0 + i * ((2 * HALF_X - 2) / 7), 0, Math.sin(i * 2.1) * 1.2));
  const proteinGroup = new THREE.Group();
  scene.add(proteinGroup);
  const channelMaterial = new THREE.MeshStandardMaterial({ color: 0xb08cff, emissive: 0x2a1650, emissiveIntensity: 0.9, roughness: 0.4 });
  const pumpMaterial = new THREE.MeshStandardMaterial({ color: 0xff9c4a, emissive: 0x3a1600, emissiveIntensity: 0.9, roughness: 0.4 });
  const flashes: Array<{ mesh: THREE.Mesh; life: number }> = [];
  const proteins = slots.map((slot) => {
    const group = new THREE.Group();
    group.position.copy(slot);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 20, 1, true), channelMaterial);
    const pore = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x150a2a, side: THREE.BackSide }));
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0 }));
    flash.position.y = -0.85;
    group.add(ring, pore, flash);
    proteinGroup.add(group);
    return { group, ring, flash };
  });

  const particleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const outsideColor = new THREE.Color(0x6fe3ff);
  const insideColor = new THREE.Color(0x7dffb0);
  scene.add(particleMesh);
  let particles: Particle[] = [];
  let mode: TransportMode = "diffusion";
  let activeChannels = 4;
  // 通道按间隔排开：4 个时用第 0、2、4、6 个位置，避免都挤在左边
  const ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
  const activeSlots = () => ORDER.slice(0, Math.max(1, activeChannels)).map((index) => slots[index]);

  const randomIn = (side: 1 | -1, index: number) => new THREE.Vector3(
    (seeded(index * 3 + 1) - 0.5) * 2 * (HALF_X - 0.3),
    side * (GAP + 0.2 + seeded(index * 3 + 2) * (ROOF - GAP - 0.4)),
    (seeded(index * 3 + 3) - 0.5) * 2 * (HALF_Z - 0.3),
  );

  const crossing = (particle: Particle, toSide: 1 | -1) => {
    const through = mode === "diffusion"
      ? new THREE.Vector3(particle.pos.x, 0, particle.pos.z)
      : activeSlots()[Math.floor(Math.random() * activeSlots().length)].clone();
    particle.cross = { t: 0, from: particle.pos.clone(), via: through, to: new THREE.Vector3(through.x + (Math.random() - 0.5) * 1.2, toSide * (GAP + 0.4 + Math.random() * 1.4), through.z + (Math.random() - 0.5) * 1.2) };
    particle.side = toSide;
    if (mode === "active") {
      const index = slots.findIndex((slot) => slot.x === through.x && slot.z === through.z);
      if (index >= 0) flashes.push({ mesh: proteins[index].flash, life: 0.5 });
    }
  };

  const pick = (side: 1 | -1, count: number) => {
    const pool = particles.filter((particle) => particle.side === side && !particle.cross);
    for (let i = 0; i < count && pool.length; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      crossing(pool[index], side === 1 ? -1 : 1);
      pool.splice(index, 1);
    }
  };

  const draw = () => {
    particles.forEach((particle, index) => {
      matrix.makeTranslation(particle.pos.x, particle.pos.y, particle.pos.z);
      particleMesh.setMatrixAt(index, matrix);
      particleMesh.setColorAt(index, particle.cross ? new THREE.Color(0xffffff) : particle.side === 1 ? outsideColor : insideColor);
    });
    particleMesh.count = particles.length;
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  };

  const animate = (dt: number) => {
    for (const particle of particles) {
      if (particle.cross) {
        particle.cross.t += dt / CROSS_SECONDS;
        const k = Math.min(1, particle.cross.t);
        const a = k < 0.5 ? particle.cross.from : particle.cross.via;
        const b = k < 0.5 ? particle.cross.via : particle.cross.to;
        particle.pos.lerpVectors(a, b, k < 0.5 ? k * 2 : (k - 0.5) * 2);
        if (k >= 1) { particle.pos.copy(particle.cross.to); particle.cross = undefined; }
        continue;
      }
      particle.vel.x += (Math.random() - 0.5) * 16 * dt;
      particle.vel.y += (Math.random() - 0.5) * 16 * dt;
      particle.vel.z += (Math.random() - 0.5) * 16 * dt;
      particle.vel.multiplyScalar(0.96);
      particle.pos.addScaledVector(particle.vel, dt);
      const low = particle.side === 1 ? GAP : -ROOF;
      const high = particle.side === 1 ? ROOF : -GAP;
      if (particle.pos.y < low) { particle.pos.y = low; particle.vel.y *= -1; }
      if (particle.pos.y > high) { particle.pos.y = high; particle.vel.y *= -1; }
      if (Math.abs(particle.pos.x) > HALF_X - 0.15) { particle.pos.x = Math.sign(particle.pos.x) * (HALF_X - 0.15); particle.vel.x *= -1; }
      if (Math.abs(particle.pos.z) > HALF_Z - 0.15) { particle.pos.z = Math.sign(particle.pos.z) * (HALF_Z - 0.15); particle.vel.z *= -1; }
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      flashes[i].life -= dt;
      (flashes[i].mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, flashes[i].life * 2);
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
    draw();
  };
  context.onFrame(animate);

  const scale = (count: number) => Math.round(count);

  return {
    sync: (state, events) => {
      pick(1, events.inward);
      pick(-1, events.outward);
      // 安全网：画面计数偏离模拟时（例如快进），直接按模拟纠正
      const outsideNow = particles.filter((particle) => particle.side === 1).length;
      if (outsideNow !== scale(state.outside)) {
        const diff = scale(state.outside) - outsideNow;
        const from: 1 | -1 = diff > 0 ? -1 : 1;
        particles.filter((particle) => particle.side === from && !particle.cross).slice(0, Math.abs(diff)).forEach((particle) => { particle.side = from === 1 ? -1 : 1; particle.pos.copy(randomIn(particle.side, Math.floor(Math.random() * 1000))); });
      }
    },
    setMode: (next, channels, atp) => {
      mode = next;
      activeChannels = channels;
      proteins.forEach((protein, index) => {
        protein.group.visible = next !== "diffusion" && ORDER.indexOf(index) < channels;
        protein.ring.material = next === "active" ? pumpMaterial : channelMaterial;
        pumpMaterial.emissiveIntensity = atp ? 1.2 : 0.15;
      });
    },
    reset: (state) => {
      const total = Math.min(MAX_PARTICLES, scale(state.outside) + scale(state.inside));
      particles = Array.from({ length: total }, (_, index) => {
        const side: 1 | -1 = index < scale(state.outside) ? 1 : -1;
        return { side, pos: randomIn(side, index), vel: new THREE.Vector3() };
      });
      draw();
    },
    dispose: () => {
      tags.dispose();
      context.dispose();
    },
  };
}
