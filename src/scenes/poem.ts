import * as THREE from "three";
import type { PoemWorld } from "../domain/poem";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import type { LangScene } from "../ui/langLab";

// 古诗即几何：黄昏大漠电影镜头。烟的“直/斜/乱”、日的“圆/缺/半”都由诗句里的字决定，
// 悬停形态字时在画面上描出构图线（垂线、圆、地平线）。

const SUN_Z = -300;
const SUN_R = 15;

interface Palette { zenith: number; horizon: number; light: number; lightIntensity: number; sun: number; smoke: number; fog: number }
const PALETTES: Record<string, Palette> = {
  setting: { zenith: 0x1b1036, horizon: 0xff8a3d, light: 0xffb27a, lightIntensity: 3.2, sun: 0xffc27a, smoke: 0xe9dccb, fog: 0x8a4a35 },
  rising: { zenith: 0x1f2a46, horizon: 0xd98c6a, light: 0xffc9a0, lightIntensity: 2.4, sun: 0xffd9a8, smoke: 0xe4dcd6, fog: 0x5a4652 },
  high: { zenith: 0x2b6aa8, horizon: 0xcfe2ee, light: 0xffffff, lightIntensity: 3.4, sun: 0xffffff, smoke: 0xf2f2f2, fog: 0x9fb8c8 },
  moon: { zenith: 0x02040c, horizon: 0x1c2c48, light: 0x9fb8ff, lightIntensity: 1.1, sun: 0xe6eeff, smoke: 0x9aa6bc, fog: 0x101a2c },
};
const GROUND: Record<PoemWorld["ground"], [number, number]> = { desert: [0xb9783e, 0xe0a865], snow: [0xc9d4e2, 0xf4f8fc], grass: [0x4f6b33, 0x8aa356] };

const riverX = (z: number) => 6 * Math.sin(z * .011) + 3 * Math.sin(z * .031 + 1) + (-z) * .07;
function duneHeight(x: number, z: number): number {
  const far = THREE.MathUtils.smoothstep(-z, -10, 120);
  const h = 2.2 * Math.sin(x * .04 + z * .018) + 1.4 * Math.abs(Math.sin(x * .09 - z * .06 + 1.3)) + .6 * Math.sin(x * .21 + z * .17);
  const river = THREE.MathUtils.smoothstep(Math.abs(x - riverX(z)), 4, 16);
  return (h + 1.6) * (.35 + .65 * far) * river - (1 - river) * .6;
}

function sky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `uniform vec3 uZenith, uHorizon, uSunColor; uniform vec3 uSun; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0., 1.); vec3 c = mix(uHorizon, uZenith, pow(h, .45));
        float halo = pow(max(dot(vDir, normalize(uSun)), 0.), 60.) * .55 + pow(max(dot(vDir, normalize(uSun)), 0.), 6.) * .12;
        gl_FragColor = vec4(c + uSunColor * halo * (1. - h * .5), 1.); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), material);
}

function discTexture(disc: PoemWorld["disc"], moon: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 120);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(.85, moon ? "#e8eeff" : "#fff1d0");
  gradient.addColorStop(1, moon ? "#c4cfee" : "#ffd08a");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(128, 128, 120, 0, Math.PI * 2);
  context.fill();
  if (moon) {
    context.fillStyle = "rgba(120,135,170,.25)";
    for (const [x, y, r] of [[90, 100, 22], [160, 150, 30], [140, 80, 12], [100, 170, 14]]) { context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill(); }
  }
  if (disc === "broken") {
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(190, 95, 105, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smokeColumn(): THREE.Points {
  const count = 900;
  const seeds = new Float32Array(count);
  const jitter = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    seeds[index] = Math.random();
    jitter.set([Math.random() * 2 - 1, Math.random() * 2 - 1], index * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aJitter", new THREE.BufferAttribute(jitter, 2));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uChaos: { value: 0 }, uColor: { value: new THREE.Color() }, uHeight: { value: 30 } },
    vertexShader: `attribute float aSeed; attribute vec2 aJitter; uniform float uTime, uWind, uChaos, uHeight; varying float vAlpha;
      void main(){ float s = fract(aSeed + uTime * .045);
        float spread = .12 + s * s * (1.1 + uChaos * 2.5);
        vec3 o = vec3(aJitter.x * spread, s * uHeight, aJitter.y * spread);
        o.x += pow(s, 1.6) * 22. * uWind;
        o.x += sin(s * 8. + uTime * .7 + aSeed * 20.) * 5. * s * uChaos;
        o.z += cos(s * 7. + uTime * .6 + aSeed * 13.) * 5. * s * uChaos;
        vec4 mv = modelViewMatrix * vec4(position + o, 1.);
        gl_PointSize = (2. + s * 11.) * 260. / -mv.z;
        vAlpha = smoothstep(0., .06, s) * (1. - s) * .3;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uColor, smoothstep(.5, .0, d) * vAlpha); }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function beacon(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: .95 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 4.2, 8), material);
  base.position.y = 2.1;
  base.castShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.6, .5, 8), material);
  top.position.y = 4.45;
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  fire.scale.setScalar(3.2);
  fire.position.y = 4.9;
  fire.name = "fire";
  group.add(base, top, fire);
  return group;
}

export function mountPoem(stage: HTMLElement): LangScene<PoemWorld> {
  const context = createCinematicStage(stage, new THREE.Vector3(-4, 3.4, 30), {
    accent: 0xffb070, grid: false, dust: 260, target: new THREE.Vector3(0, 6, -40), bloom: { strength: .7, radius: .6, threshold: .86 },
  });
  const { scene, renderer, controls, camera } = context;
  camera.far = 2500;
  renderer.toneMappingExposure = .92;
  camera.updateProjectionMatrix();
  scene.children.filter((object) => (object as THREE.Light).isLight).forEach((light) => scene.remove(light));
  controls.maxPolarAngle = Math.PI * .495;
  controls.minDistance = 8;
  controls.maxDistance = 80;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.fog = new THREE.FogExp2(0x8a4a35, .0042);
  const skyDome = sky();
  scene.add(skyDome);

  const groundGeometry = new THREE.PlaneGeometry(700, 520, 320, 260);
  groundGeometry.rotateX(-Math.PI / 2);
  groundGeometry.translate(0, 0, -220);
  const position = groundGeometry.getAttribute("position") as THREE.BufferAttribute;
  const shade = new Float32Array(position.count);
  for (let index = 0; index < position.count; index += 1) {
    const h = duneHeight(position.getX(index), position.getZ(index));
    position.setY(index, h);
    shade[index] = THREE.MathUtils.clamp(.5 + h * .09 + (Math.random() - .5) * .06, 0, 1);
  }
  groundGeometry.computeVertexNormals();
  groundGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const riverPoints: THREE.Vector3[] = [];
  for (let z = 32; z > -420; z -= 2) riverPoints.push(new THREE.Vector3(riverX(z), -.35, z));
  const riverGeometry = new THREE.BufferGeometry();
  const riverPositions: number[] = [];
  riverPoints.forEach((point) => riverPositions.push(point.x - 4.2, point.y, point.z, point.x + 4.2, point.y, point.z));
  const riverIndex: number[] = [];
  for (let index = 0; index < riverPoints.length - 1; index += 1) { const a = index * 2; riverIndex.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  riverGeometry.setAttribute("position", new THREE.Float32BufferAttribute(riverPositions, 3));
  riverGeometry.setIndex(riverIndex);
  const riverMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uSunX: { value: 0 }, uSky: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: "varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uSunX, uTime; uniform vec3 uSky, uSun, uCam; varying vec3 vWorld;
      void main(){ float t = clamp((uCam.z - vWorld.z) / (uCam.z - ${SUN_Z}.), 0., 1.);
        float lineX = mix(uCam.x, uSunX, t);
        float width = 1.2 + (uCam.z - vWorld.z) * .02;
        float sparkle = pow(max(0., sin(vWorld.z * 2.3 + uTime * 2.1) * sin(vWorld.x * 5.7 - uTime * 1.3 + vWorld.z * .8)), 3.);
        float glint = exp(-pow((vWorld.x - lineX) / width, 2.)) * (.3 + 1.1 * sparkle);
        vec3 c = mix(uSky * .55, uSky, t) + uSun * glint * 1.4;
        gl_FragColor = vec4(c, .92); }`,
  });
  const river = new THREE.Mesh(riverGeometry, riverMaterial);
  scene.add(river);

  const sunMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 2, SUN_R * 2), sunMaterial);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunGlow.scale.setScalar(SUN_R * 3.4);
  scene.add(sunGlow, sun);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 700 });
  scene.add(light, light.target);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x2a1810, .6);
  scene.add(ambient);

  const columns: Array<{ smoke: THREE.Points; tower: THREE.Group }> = [];
  const guides = new THREE.Group();
  scene.add(guides);
  const guideMaterial = new THREE.LineBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, fog: false, toneMapped: false });
  let world: PoemWorld | null = null;
  let wind = 0, chaos = 0, clock = 0, guideTimer = 0;
  let highlighted: string | null = null;
  let sunCenter = new THREE.Vector3();

  const buildGuides = () => {
    guides.clear();
    if (!world) return;
    const first = columns[0];
    if (first) {
      const base = first.tower.position.clone().add(new THREE.Vector3(0, 5, 0));
      const top = base.clone().add(new THREE.Vector3(world.smokeShape === "slant" ? 22 : 0, 30, 0));
      guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), guideMaterial));
    }
    const circle = new THREE.EllipseCurve(0, 0, SUN_R * 1.12, SUN_R * 1.12).getPoints(96).map((p) => new THREE.Vector3(sunCenter.x + p.x, sunCenter.y + p.y, SUN_Z + 2));
    guides.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle), guideMaterial));
    guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-500, 1, SUN_Z + 4), new THREE.Vector3(500, 1, SUN_Z + 4)]), guideMaterial));
  };

  const removeFrame = context.onFrame((delta) => {
    clock += delta;
    if (!world) return;
    wind = THREE.MathUtils.damp(wind, world.smokeShape === "slant" ? 1 : 0, 1.6, delta);
    chaos = THREE.MathUtils.damp(chaos, world.smokeShape === "chaos" ? 1 : 0, 1.6, delta);
    for (const { smoke, tower } of columns) {
      const uniforms = (smoke.material as THREE.ShaderMaterial).uniforms;
      uniforms.uTime.value = clock;
      uniforms.uWind.value = wind;
      uniforms.uChaos.value = chaos;
      (tower.getObjectByName("fire") as THREE.Sprite).scale.setScalar(3 + Math.sin(clock * 9 + tower.position.x) * .35);
    }
    riverMaterial.uniforms.uTime.value = clock;
    riverMaterial.uniforms.uCam.value.copy(context.camera.position);
    sun.lookAt(context.camera.position);
    guideTimer = Math.max(0, guideTimer - delta);
    guideMaterial.opacity = THREE.MathUtils.damp(guideMaterial.opacity, highlighted === "shape" ? 1 : guideTimer > 0 ? .85 : 0, 4, delta);
  });

  return {
    update: (next) => {
      const previous = world;
      world = next;
      const palette = PALETTES[next.body === "moon" ? "moon" : next.phase];
      const sunX = next.phase === "rising" ? -55 : 38;
      const sunY = next.phase === "high" ? 82 : next.disc === "half" ? 0 : SUN_R + 1.5;
      sunCenter = new THREE.Vector3(sunX, sunY, SUN_Z);
      sun.position.copy(sunCenter);
      sunGlow.position.copy(sunCenter).add(new THREE.Vector3(0, 0, -5));
      if (!previous || previous.disc !== next.disc || previous.body !== next.body) {
        sunMaterial.map?.dispose();
        sunMaterial.map = discTexture(next.disc, next.body === "moon");
        sunMaterial.needsUpdate = true;
      }
      sunMaterial.color.set(palette.sun);
      (sunGlow.material as THREE.SpriteMaterial).color.set(palette.sun).multiplyScalar(next.body === "moon" ? .3 : .45);
      const skyUniforms = (skyDome.material as THREE.ShaderMaterial).uniforms;
      skyUniforms.uZenith.value.set(palette.zenith);
      skyUniforms.uHorizon.value.set(palette.horizon);
      skyUniforms.uSunColor.value.set(palette.sun).multiplyScalar(next.body === "moon" ? .25 : 1);
      skyUniforms.uSun.value.copy(sunCenter);
      (scene.fog as THREE.FogExp2).color.set(palette.fog);
      light.color.set(palette.light);
      light.intensity = palette.lightIntensity;
      light.position.copy(sunCenter).normalize().multiplyScalar(260).setY(Math.max(18, sunCenter.y * .6 + 18));
      light.target.position.set(0, 0, -30);
      ambient.intensity = next.body === "moon" ? .35 : .6;
      riverMaterial.uniforms.uSunX.value = sunX;
      riverMaterial.uniforms.uSky.value.set(palette.horizon);
      riverMaterial.uniforms.uSun.value.set(palette.sun).multiplyScalar(next.body === "moon" ? .5 : 1);
      river.visible = next.river;
      const [low, high] = GROUND[next.ground];
      const colors = groundGeometry.getAttribute("color") as THREE.BufferAttribute;
      const a = new THREE.Color(low), b = new THREE.Color(high), c = new THREE.Color();
      for (let index = 0; index < shade.length; index += 1) { c.copy(a).lerp(b, shade[index]); colors.setXYZ(index, c.r, c.g, c.b); }
      colors.needsUpdate = true;
      if (!previous || previous.smokeCount !== next.smokeCount) {
        columns.forEach(({ smoke, tower }) => scene.remove(smoke, tower));
        columns.length = 0;
        for (let index = 0; index < next.smokeCount; index += 1) {
          const x = -24 + index * 11 + (index % 2) * 3;
          const z = -62 - index * 9;
          const tower = beacon();
          tower.position.set(x, duneHeight(x, z), z);
          const smoke = smokeColumn();
          smoke.position.copy(tower.position).add(new THREE.Vector3(0, 5, 0));
          scene.add(tower, smoke);
          columns.push({ smoke, tower });
        }
      }
      columns.forEach(({ smoke }) => (smoke.material as THREE.ShaderMaterial).uniforms.uColor.value.set(palette.smoke));
      buildGuides();
      guideTimer = 3.2;
      context.pulse(.6);
    },
    highlight: (role) => {
      highlighted = role;
      if (role && role !== "shape") context.pulse(.5);
    },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
