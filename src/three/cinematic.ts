import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createStage, type StageContext } from "./setup";

// 统一的“科技感”舞台：辉光后期 + 全息网格地面 + 漂浮粒子 + 电影式镜头。
// 新的“语言 ↔ 世界”案例都从这里起步，保证全天课件视觉是一个体系。

export interface CinematicOptions {
  accent?: number;
  background?: number;
  bloom?: { strength: number; radius: number; threshold: number };
  grid?: boolean;
  /** 网格上扩散的光圈；写实场景可关闭 */
  ripple?: boolean;
  dust?: number;
  /** 开场镜头：从远处推近到 cameraPosition */
  intro?: boolean;
  target?: THREE.Vector3;
}

export interface CinematicStage extends StageContext {
  flyTo: (position: THREE.Vector3, target: THREE.Vector3, duration?: number) => void;
  /** 0–1，随镜头/语言变化短暂提亮的“冲击”脉冲 */
  pulse: (amount?: number) => void;
}

const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let cachedGlow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (cachedGlow) return cachedGlow;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(.25, "rgba(255,255,255,.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  cachedGlow = new THREE.CanvasTexture(canvas);
  return cachedGlow;
}

function holoGrid(color: THREE.Color, ripple = true): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: color }, uTime: { value: 0 }, uRipple: { value: ripple ? 1 : 0 } },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uRipple; varying vec3 vWorld;
      float line(float v, float w){ float d = abs(fract(v - .5) - .5) / fwidth(v); return 1. - min(d / w, 1.); }
      void main(){
        float minor = max(line(vWorld.x, .7), line(vWorld.z, .7)) * .09;
        float major = max(line(vWorld.x / 5., 1.), line(vWorld.z / 5., 1.)) * .3;
        float r = length(vWorld.xz);
        float fade = smoothstep(34., 4., r);
        float ring = smoothstep(1.2, 0., abs(r - mod(uTime * 6., 46.))) * .5 * uRipple;
        gl_FragColor = vec4(uColor, (max(minor, major) + ring * (minor + major + .15)) * fade);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

function dustField(count: number, color: THREE.Color): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions.set([(Math.random() - .5) * 70, Math.random() * 26 - 2, (Math.random() - .5) * 70], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    map: glowTexture(), color, size: .12, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

export function createCinematicStage(container: HTMLElement, cameraPosition: THREE.Vector3, options: CinematicOptions = {}): CinematicStage {
  const stage = createStage(container, options.intro === false ? cameraPosition : cameraPosition.clone().multiplyScalar(2.6).add(new THREE.Vector3(0, 6, 0)));
  const { scene, camera, renderer, controls } = stage;
  const accent = new THREE.Color(options.accent ?? 0x57d8ff);
  const background = new THREE.Color(options.background ?? 0x02060a);
  scene.background = background;
  scene.fog = new THREE.FogExp2(background, .018);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  controls.enableDamping = true;
  controls.dampingFactor = .06;
  if (options.target) controls.target.copy(options.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomSettings = options.bloom ?? { strength: 1.15, radius: .55, threshold: .18 };
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomSettings.strength, bloomSettings.radius, bloomSettings.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  stage.onResize((width, height) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  });
  stage.setRender(() => composer.render());

  const grid = options.grid === false ? null : holoGrid(accent.clone().lerp(new THREE.Color(0xffffff), .15), options.ripple !== false);
  if (grid) scene.add(grid);
  const dust = options.dust === 0 ? null : dustField(options.dust ?? 900, accent);
  if (dust) scene.add(dust);

  const tween = { active: false, t: 0, duration: 2, fromPosition: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPosition: new THREE.Vector3(), toTarget: new THREE.Vector3() };
  const flyTo = (position: THREE.Vector3, target: THREE.Vector3, duration = 2) => {
    tween.fromPosition.copy(camera.position);
    tween.fromTarget.copy(controls.target);
    tween.toPosition.copy(position);
    tween.toTarget.copy(target);
    tween.t = 0;
    tween.duration = duration;
    tween.active = true;
  };
  controls.addEventListener("start", () => { tween.active = false; });
  let pulseLevel = 0;
  let clock = 0;
  // 避让遮挡：舞台里如果有讲解卡（.lang-explain），把投影中心移到卡片之外的区域，
  // 让 3D 主体始终落在没被遮住的地方。每 10 帧量一次，卡片内容/窗口大小变化都能跟上。
  let frameCount = 0;
  const shift = { x: 0, y: 0 };
  const updateViewOffset = () => {
    const card = container.querySelector<HTMLElement>(".lang-explain, .geo-chart:not([hidden])");
    const width = container.clientWidth;
    const height = container.clientHeight;
    let targetX = 0;
    let targetY = 0;
    if (card && card.offsetWidth && width > 700) {
      const box = card.getBoundingClientRect();
      const host = container.getBoundingClientRect();
      const coverX = Math.max(0, host.right - box.left);
      const coverY = Math.max(0, host.bottom - box.top);
      // 卡片已缩小：只做轻微避让，主体保持在视觉中央附近
      targetX = coverX * .3;
      targetY = coverY * .18;
    }
    shift.x += (targetX - shift.x) * .25;
    shift.y += (targetY - shift.y) * .25;
    if (Math.abs(shift.x) < .5 && Math.abs(shift.y) < .5) camera.clearViewOffset();
    else camera.setViewOffset(width, height, shift.x, shift.y, width, height);
  };
  stage.onFrame((delta) => {
    clock += delta;
    if (frameCount++ % 10 === 0) updateViewOffset();
    if (tween.active) {
      tween.t = Math.min(1, tween.t + delta / tween.duration);
      const k = easeInOut(tween.t);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.t >= 1) tween.active = false;
    }
    pulseLevel = Math.max(0, pulseLevel - delta * 1.6);
    bloom.strength = bloomSettings.strength * (1 + pulseLevel * .9);
    if (grid) (grid.material as THREE.ShaderMaterial).uniforms.uTime.value = clock;
    if (dust) {
      dust.rotation.y += delta * .012;
      dust.position.y = Math.sin(clock * .2) * .4;
    }
  });
  if (options.intro !== false) flyTo(cameraPosition, controls.target.clone(), 3.2);

  return {
    ...stage,
    flyTo,
    pulse: (amount = 1) => { pulseLevel = Math.min(1.4, pulseLevel + amount); },
    dispose: () => {
      composer.dispose();
      stage.dispose();
    },
  };
}

/**
 * 粒子重组：几千个发光粒子在“世界”之间流动。setTargets 换形状时粒子先炸散再归位，
 * 用来表达“语言变了，世界随之重组”。
 */
export function createParticleMorph(count: number, color: number, size = .07) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  for (let index = 0; index < count; index += 1) {
    const r = 18 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 4, r * Math.sin(phi) * Math.sin(theta)], index * 3);
    colors.set([base.r, base.g, base.b], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    map: glowTexture(), size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let settle = 0;
  return {
    points,
    /** targets 长度不足时循环复用；colorFor 可按目标位置给每个粒子上色 */
    setTargets: (next: Float32Array, colorFor?: (index: number, out: THREE.Color) => void, burst = 1) => {
      const n = next.length / 3;
      const scratch = new THREE.Color();
      for (let index = 0; index < count; index += 1) {
        const source = (index % n) * 3;
        targets[index * 3] = next[source];
        targets[index * 3 + 1] = next[source + 1];
        targets[index * 3 + 2] = next[source + 2];
        velocities[index * 3] += (Math.random() - .5) * 9 * burst;
        velocities[index * 3 + 1] += (Math.random() - .2) * 9 * burst;
        velocities[index * 3 + 2] += (Math.random() - .5) * 9 * burst;
        if (colorFor) {
          colorFor(index % n, scratch);
          colors.set([scratch.r, scratch.g, scratch.b], index * 3);
        }
      }
      (geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      settle = 0;
    },
    update: (delta: number) => {
      settle = Math.min(1, settle + delta * .55);
      const stiffness = 10 + settle * 26;
      const damping = Math.exp(-delta * (3.2 + settle * 4));
      for (let index = 0; index < count * 3; index += 1) {
        velocities[index] = (velocities[index] + (targets[index] - positions[index]) * stiffness * delta) * damping;
        positions[index] += velocities[index] * delta;
      }
      (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    },
    setOpacity: (value: number) => { material.opacity = value; },
  };
}
