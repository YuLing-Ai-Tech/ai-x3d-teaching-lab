import * as THREE from "three";

// 写实星球：纹理全部由程序生成（离线可用）。表面用分形噪声，外加大气菲涅尔辉光。

export type PlanetKind = "terran" | "rocky" | "gas" | "ice" | "lava" | "mercury";

/** 太阳在世界坐标中的位置：大气散射只出现在受光的一侧 */
export const SUN_POSITION = new THREE.Vector3(0, .8, 0);

function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** 球面无缝分形噪声：把 (u,v) 映射到柱面上取样，经度方向首尾相接 */
function fbm(u: number, v: number, seed: number, octaves = 5, scale = 4): number {
  const angle = u * Math.PI * 2;
  let sum = 0, amp = .5, freq = scale;
  for (let i = 0; i < octaves; i += 1) {
    const r = freq / (Math.PI * 2);
    sum += amp * (noise(Math.cos(angle) * r + 50, v * freq, seed + i) * .5 + noise(Math.sin(angle) * r + 80, v * freq + 30, seed + i) * .5);
    amp *= .5; freq *= 2;
  }
  return sum;
}

const mix = (a: number[], b: number[], t: number) => a.map((value, i) => value + (b[i] - value) * Math.max(0, Math.min(1, t)));

function paint(kind: PlanetKind, seed: number, width = 512, height = 256): { map: THREE.CanvasTexture; emissive?: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(width, height);
  const glowCanvas = kind === "lava" ? document.createElement("canvas") : null;
  const glowImage = glowCanvas ? (glowCanvas.width = width, glowCanvas.height = height, glowCanvas.getContext("2d")!.createImageData(width, height)) : null;
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    const lat = Math.abs(v - .5) * 2;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      let rgb: number[];
      if (kind === "terran") {
        const h = fbm(u, v, seed, 6, 3);
        const cloud = fbm(u + .3, v * 1.3, seed + 9, 5, 5);
        if (h < .5) rgb = mix([12, 40, 92], [30, 92, 150], (h - .3) / .2);
        else rgb = mix(mix([62, 110, 52], [150, 128, 82], (h - .5) / .18), [235, 235, 240], (lat - .78) / .1);
        if (lat > .86) rgb = [236, 242, 248];
        const c = Math.max(0, (cloud - .52) * 3);
        rgb = mix(rgb, [250, 250, 252], c * .85);
      } else if (kind === "rocky") {
        const h = fbm(u, v, seed, 6, 5);
        const crater = fbm(u, v, seed + 3, 3, 14);
        rgb = mix([92, 42, 24], [196, 104, 62], h * 1.3 - .2);
        rgb = mix(rgb, [60, 30, 20], Math.max(0, crater - .62) * 4);
        if (lat > .9) rgb = mix(rgb, [230, 220, 215], (lat - .9) * 10);
      } else if (kind === "gas") {
        const turbulence = fbm(u, v, seed, 5, 6) - .5;
        const band = Math.sin((v + turbulence * .06) * Math.PI * 18) * .5 + .5;
        const band2 = Math.sin((v + turbulence * .03) * Math.PI * 7 + 1.3) * .5 + .5;
        rgb = mix(mix([176, 132, 92], [236, 214, 178], band), [140, 96, 70], band2 * .35);
        // 大红斑
        const dx = (u - .62) * 2.2, dy = (v - .62) * 6;
        const spot = Math.exp(-(dx * dx + dy * dy) * 3);
        rgb = mix(rgb, [196, 92, 60], spot * .9);
      } else if (kind === "ice") {
        const turbulence = fbm(u, v, seed, 4, 4) - .5;
        const band = Math.sin((v + turbulence * .04) * Math.PI * 9) * .5 + .5;
        rgb = mix([62, 132, 196], [150, 214, 236], band * .7 + turbulence * .5);
      } else if (kind === "mercury") {
        const h = fbm(u, v, seed, 6, 5);
        const crater = fbm(u, v, seed + 3, 4, 16);
        const rim = fbm(u, v, seed + 7, 3, 28);
        rgb = mix([88, 84, 80], [168, 162, 154], h * 1.2 - .1);
        rgb = mix(rgb, [52, 50, 48], Math.max(0, crater - .6) * 3.5);
        rgb = mix(rgb, [196, 190, 182], Math.max(0, rim - .66) * 3);
      } else {
        const h = fbm(u, v, seed, 6, 4);
        const crack = Math.abs(fbm(u, v, seed + 5, 4, 7) - .5);
        rgb = mix([30, 22, 20], [74, 52, 44], h);
        const hot = Math.max(0, .06 - crack) / .06;
        rgb = mix(rgb, [255, 120, 30], hot);
        if (glowImage) {
          const o = (y * width + x) * 4;
          glowImage.data.set([255 * hot, 110 * hot, 20 * hot, 255], o);
        }
      }
      image.data.set([rgb[0], rgb[1], rgb[2], 255], (y * width + x) * 4);
    }
  }
  context.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  let emissive: THREE.CanvasTexture | undefined;
  if (glowCanvas && glowImage) {
    glowCanvas.getContext("2d")!.putImageData(glowImage, 0, 0);
    emissive = new THREE.CanvasTexture(glowCanvas);
    emissive.colorSpace = THREE.SRGBColorSpace;
  }
  return { map, emissive };
}

/** 大气层：菲涅尔边缘 × 受光面。背阳一侧完全不亮——行星自身不发光，只散射太阳光 */
function atmosphere(radius: number, color: THREE.Color, strength = 1, sun = SUN_POSITION): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color }, uStrength: { value: strength }, uSun: { value: sun } },
    vertexShader: "varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal; varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.); vWorld = w.xyz; vWorldNormal = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * w; vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uStrength; uniform vec3 uSun; varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal; varying vec3 vWorld; void main(){ float rim = pow(1. - abs(dot(vNormal, vView)), 3.); float lit = smoothstep(-.15, .5, dot(normalize(vWorldNormal), normalize(uSun - vWorld))); gl_FragColor = vec4(uColor, rim * lit * uStrength); }",
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 48, 32), material);
}

/** 有大气的行星才有散射边缘；水星类没有大气 */
const ATMOSPHERE: Partial<Record<PlanetKind, number>> = { terran: 0x6fb6ff, rocky: 0xd99a78, gas: 0xd8c4a0, ice: 0x8fd8ff };

export function createPlanet(kind: PlanetKind, radius: number, seed: number): THREE.Group {
  const { map, emissive } = paint(kind, seed);
  // 行星本身不发光：没有自发光，亮面只来自太阳照射
  void emissive;
  const material = new THREE.MeshStandardMaterial({ map, roughness: kind === "ice" || kind === "gas" ? .75 : .95, metalness: 0 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), material);
  body.name = "surface";
  const group = new THREE.Group();
  group.add(body);
  const air = ATMOSPHERE[kind];
  if (air !== undefined) group.add(atmosphere(radius, new THREE.Color(air), kind === "terran" ? .9 : .5));
  if (kind === "gas") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.45, radius * 2.2, 96),
      new THREE.MeshStandardMaterial({ color: 0xc9b48c, roughness: 1, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2 + .35;
    group.add(ring);
  }
  group.rotation.z = (seed % 5) * .09 + .1; // 轴倾角
  return group;
}

/** 恒星：动态米粒组织 + 临边昏暗 */
export function createStar(radius: number): { group: THREE.Group; update: (time: number) => void } {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: "varying vec3 vPos; varying vec3 vNormal; varying vec3 vView; void main(){ vPos = position; vec4 mv = modelViewMatrix * vec4(position,1.); vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: `uniform float uTime; varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * n(p); p *= 2.1; a *= .5; } return s; }
      void main(){ vec3 p = normalize(vPos) * 3.2;
        float g = fbm(p + vec3(uTime * .05, -uTime * .03, uTime * .04));
        float spots = smoothstep(.62, .7, fbm(p * .6 + 10.));
        float limb = pow(max(dot(vNormal, vView), 0.), .55);
        vec3 c = mix(vec3(1., .42, .08), vec3(1., .86, .5), g);
        c = mix(c, vec3(.45, .12, .02), spots * .7);
        gl_FragColor = vec4(c * (.35 + .9 * limb) * 1.45, 1.); }`,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), material));
  group.add(atmosphere(radius * .98, new THREE.Color(0xff8a30), 1.1));
  return { group, update: (time) => { material.uniforms.uTime.value = time; } };
}
