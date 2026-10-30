import * as THREE from "three";
import { CRASH_RADIUS, ESCAPE_RADIUS, SIM_DT, initialOrbit, stepOrbit, type GravityLaw, type OrbitState } from "../domain/gravity";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import { createPlanet, createStar, type PlanetKind } from "../three/planets";
import type { LangScene } from "../ui/langLab";

// 引力实验：恒星 + 五颗行星，用 domain/gravity.ts 的同一个蛙跳积分器（固定步长）回放，拖出发光轨迹。
// 画面与学生记录的证据来自同一套计算；初速度按“平方反比”下的轨道设置（可乘以初速度倍数）。

const TRAIL = 900;
const SIM_RATE = 1.6;  // 每秒真实时间推进的模型时间
const PLANETS: Array<{ r: number; boost: number; color: number; size: number; kind: PlanetKind }> = [
  { r: 2.6, boost: 1, color: 0xb8b0a6, size: .26, kind: "mercury" },
  { r: 4.2, boost: .86, color: 0x6fb6ff, size: .42, kind: "terran" },
  { r: 6, boost: 1.1, color: 0xff8f6b, size: .36, kind: "rocky" },
  { r: 8, boost: .93, color: 0xffd6a0, size: .66, kind: "gas" },
  { r: 10.2, boost: 1.04, color: 0x8fe8ff, size: .5, kind: "ice" },
];

interface Body { orbit: OrbitState; position: THREE.Vector3; mesh: THREE.Group; trail: THREE.Points; history: Float32Array; head: number; filled: number; alive: boolean; color: THREE.Color }

export interface GravityScene extends LangScene<GravityLaw> {
  setSpeedFactor: (factor: number) => void;
  setTracked: (index: number) => void;
}

export function mountGravity(stage: HTMLElement): GravityScene {
  const context = createCinematicStage(stage, new THREE.Vector3(0, 17, 21), { accent: 0x8a7bff, grid: true, ripple: false, dust: 1400, bloom: { strength: .5, radius: .3, threshold: 1 } });
  const { scene } = context;
  context.controls.target.set(0, 0, 0);
  // 只有太阳是光源：移除舞台默认的半球光与主光
  scene.children.filter((object) => (object as THREE.Light).isLight).forEach((light) => scene.remove(light));
  const sun = createStar(.8);
  const star = sun.group;
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a40, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false }));
  corona.scale.setScalar(4);
  star.add(corona);
  star.position.y = .8;
  scene.add(star);
  const sunlight = new THREE.PointLight(0xfff0d8, 2.4, 0, 0);
  sunlight.position.y = .8;
  scene.add(sunlight, new THREE.AmbientLight(0x1a2230, .04));

  const bodies: Body[] = PLANETS.map((planet, index) => {
    const color = new THREE.Color(planet.color);
    const mesh = createPlanet(planet.kind, planet.size, index * 7 + 3);
    const history = new Float32Array(TRAIL * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const trail = new THREE.Points(geometry, new THREE.PointsMaterial({ map: glowTexture(), size: .13, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false;
    scene.add(mesh, trail);
    return { orbit: initialOrbit(index), position: new THREE.Vector3(), mesh, trail, history, head: 0, filled: 0, alive: true, color };
  });

  let law: GravityLaw = { exponent: 2, mass: 1 };
  let highlighted: string | null = null;
  let speedFactor = 1;
  let running = true;
  let tracked = -1;
  let resets = 0;
  const reset = () => {
    stage.dataset.resets = String(++resets);  // 供测试确认：局部操作（如记录证据）不会重置模型
    bodies.forEach((body, index) => {
      body.orbit = initialOrbit(index, speedFactor);
      body.position.set(body.orbit.x, 0, body.orbit.y);
      body.alive = true;
      body.head = 0;
      body.filled = 0;
      body.mesh.visible = true;
      body.mesh.scale.setScalar(index === tracked ? 1.35 : 1);
      body.mesh.position.copy(body.position).add(new THREE.Vector3(0, .8, 0));
      body.trail.geometry.setDrawRange(0, 0);
    });
  };
  let emptyFor = 0;
  let pending = 0;
  const removeFrame = context.onFrame((delta) => {
    // 预测锁定前模型不运行（行星停在起点）；所有行星都坠毁或逃逸后，停 2.5 秒再重演一遍。
    if (!running) { star.rotation.y += delta * .08; sun.update(performance.now() / 1000); return; }
    emptyFor = bodies.some((body) => body.alive) ? 0 : emptyFor + delta;
    if (emptyFor > 2.5) { emptyFor = 0; reset(); context.pulse(.6); }
    pending += Math.min(delta, .05) * SIM_RATE;
    const steps = Math.floor(pending / SIM_DT);
    pending -= steps * SIM_DT;
    for (const body of bodies) {
      if (!body.alive) continue;
      for (let step = 0; step < steps; step += 1) stepOrbit(body.orbit, law, SIM_DT);
      body.position.set(body.orbit.x, 0, body.orbit.y);
      const r = body.position.length();
      if (r < CRASH_RADIUS || r > ESCAPE_RADIUS) {
        body.alive = false;
        body.mesh.visible = false;
        body.trail.geometry.setDrawRange(0, 0);
        context.pulse(r < CRASH_RADIUS ? 1 : .3);
        continue;
      }
      body.mesh.position.copy(body.position).add(new THREE.Vector3(0, .8, 0));
      body.history.set([body.mesh.position.x, body.mesh.position.y, body.mesh.position.z], body.head * 3);
      body.head = (body.head + 1) % TRAIL;
      body.filled = Math.min(TRAIL, body.filled + 1);
      const positions = body.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      const colors = body.trail.geometry.getAttribute("color") as THREE.BufferAttribute;
      const emphasis = (highlighted === "quantity" || highlighted === "relation" ? 1.4 : 1) * (tracked >= 0 && bodies.indexOf(body) !== tracked ? .35 : tracked >= 0 ? 2.2 : 1);
      for (let index = 0; index < body.filled; index += 1) {
        const source = (body.head - body.filled + index + TRAIL) % TRAIL;
        positions.setXYZ(index, body.history[source * 3], body.history[source * 3 + 1], body.history[source * 3 + 2]);
        const fade = Math.pow(index / body.filled, 1.25) * .35 * emphasis;
        colors.setXYZ(index, body.color.r * fade, body.color.g * fade, body.color.b * fade);
      }
      body.trail.geometry.setDrawRange(0, body.filled);
      positions.needsUpdate = true;
      colors.needsUpdate = true;
    }
    star.rotation.y += delta * .08;
    sun.update(performance.now() / 1000);
    bodies.forEach((body, index) => { body.mesh.getObjectByName("surface")!.rotation.y += delta * (.6 - index * .08); });
    corona.scale.setScalar(4 * law.mass ** .35 * (1 + Math.sin(performance.now() * .002) * .04));
  });

  return {
    update: (next) => {
      law = next;
      star.scale.setScalar(law.mass ** .33);
      reset();
      context.pulse(.9);
    },
    setRunning: (next) => {
      stage.dataset.running = String(next);
      if (next === running) return;
      running = next;
      if (!running) reset();
    },
    setSpeedFactor: (factor) => { speedFactor = factor; reset(); },
    setTracked: (index) => { tracked = index; stage.dataset.tracked = String(index); reset(); },
    highlight: (role) => {
      highlighted = role;
      if (role === "object") context.pulse(.6);
    },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
