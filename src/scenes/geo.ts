import * as THREE from "three";
import { LANDFORMS, type GeoQuery } from "../domain/geo";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import { createTagLayer } from "../three/tags";
import type { LangScene } from "../ui/langLab";
import { loadReliefTerrain } from "./longMarchTerrain";

// 地理语言 → 全国三维地形：剖面墙 + 剖面图、上升的海平面、等高面、坐标光柱。

const EXAGGERATION = 30;

function profileSvg(samples: Array<{ at: number; metres: number }>, axis: "lat" | "lon"): string {
  const width = 420, height = 130, max = Math.max(1000, ...samples.map((s) => s.metres));
  const x = (i: number) => (i / (samples.length - 1) * (width - 30) + 26).toFixed(1);
  const y = (m: number) => (height - 18 - m / max * (height - 30)).toFixed(1);
  const path = samples.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.metres)}`).join("");
  const ticks = [0, Math.round(max / 2 / 1000) * 1000, Math.floor(max / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i);
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
    <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd38a" stop-opacity=".9"/><stop offset="1" stop-color="#57d8ff" stop-opacity=".15"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="26" x2="${width - 4}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.12)"/><text x="0" y="${Number(y(t)) + 4}" fill="#8fa3ad" font-size="10">${t}</text>`).join("")}
    <path d="${path}L${x(samples.length - 1)},${height - 18}L26,${height - 18}Z" fill="url(#pf)"/>
    <path d="${path}" fill="none" stroke="#ffe2a8" stroke-width="2"/>
    <text x="26" y="${height - 3}" fill="#8fa3ad" font-size="10">${samples[0].at.toFixed(0)}°${axis === "lat" ? "E" : "N"}</text>
    <text x="${width - 40}" y="${height - 3}" fill="#8fa3ad" font-size="10">${samples.at(-1)!.at.toFixed(0)}°${axis === "lat" ? "E" : "N"}</text>
  </svg>`;
}

export interface GeoScene extends LangScene<GeoQuery> {
  /** 与画面同一份 DEM 的海拔（米）：页面的结论从这里采样 */
  elevationAt: (lon: number, lat: number) => number;
}

export async function mountGeo(stage: HTMLElement): Promise<GeoScene> {
  const context = createCinematicStage(stage, new THREE.Vector3(0, 15, 19), { accent: 0x57d8ff, grid: false, dust: 700, target: new THREE.Vector3(0, 0, 1), bloom: { strength: .6, radius: .4, threshold: .7 } });
  const terrain = await loadReliefTerrain({ base: "./data/china-hd/", outline: "./data/china-outline.json", stride: 1, anisotropy: context.renderer.capabilities.getMaxAnisotropy(), exaggeration: EXAGGERATION });
  context.scene.add(terrain.group);
  context.scene.add(new THREE.DirectionalLight(0xffeedd, .7).translateX(-10).translateY(14).translateZ(6));
  context.renderer.toneMappingExposure = .92;
  context.controls.maxPolarAngle = Math.PI * .47;
  const tags = createTagLayer(stage);
  LANDFORMS.forEach(([name, lon, lat]) => tags.add(name, terrain.project(lon, lat, .35), "landform"));
  const chart = document.createElement("div");
  chart.className = "geo-chart";
  stage.append(chart);

  const levelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x2a8fd8, emissive: 0x0b4a7a, emissiveIntensity: .6, transparent: true, opacity: .62, roughness: .08, side: THREE.DoubleSide, depthWrite: false });
  if (terrain.mask) { levelMaterial.alphaMap = terrain.mask; levelMaterial.alphaTest = .5; }
  const level = new THREE.Mesh(new THREE.PlaneGeometry(terrain.width, terrain.depth).rotateX(-Math.PI / 2), levelMaterial);
  level.visible = false;
  context.scene.add(level);
  const overlay = new THREE.Group();
  context.scene.add(overlay);
  let levelTarget = 0;
  let highlighted: string | null = null;
  const removeFrame = context.onFrame((delta) => {
    tags.update(context.camera);
    level.position.y = THREE.MathUtils.damp(level.position.y, levelTarget, 1.4, delta);
    overlay.children.forEach((child) => { if (child.name === "beam") child.rotation.y += delta; });
    levelMaterial.opacity = highlighted === "number" ? .8 : .62;
  });

  return {
    elevationAt: (lon, lat) => terrain.elevationAt(lon, lat),
    update: (query) => {
      overlay.clear();
      chart.innerHTML = "";
      chart.hidden = true;
      level.visible = query.kind === "flood" || query.kind === "above";
      if (query.kind === "flood" || query.kind === "above") {
        levelMaterial.color.set(query.kind === "flood" ? 0x2a8fd8 : 0xffb347);
        levelMaterial.emissive.set(query.kind === "flood" ? 0x0b4a7a : 0x7a3a0b);
        level.position.y = terrain.metresToY(0);
        levelTarget = terrain.metresToY(query.metres);
        context.flyTo(new THREE.Vector3(0, 14, 17), new THREE.Vector3(0, 0, 1));
      } else if (query.kind === "profile") {
        const samples: Array<{ at: number; metres: number }> = [];
        const positions: number[] = [];
        const colors: number[] = [];
        const top: THREE.Vector3[] = [];
        const low = new THREE.Color(0x2a6f8a), high = new THREE.Color(0xffe2a8), c = new THREE.Color();
        for (let i = 0; i <= 400; i += 1) {
          const at = query.from + (query.to - query.from) * i / 400;
          const [lon, lat] = query.axis === "lat" ? [at, query.value] : [query.value, at];
          const metres = Math.max(0, terrain.elevationAt(lon, lat));
          samples.push({ at, metres });
          const point = terrain.project(lon, lat, .02);
          top.push(point);
          c.copy(low).lerp(high, Math.min(1, metres / 5000));
          positions.push(point.x, -.42, point.z, point.x, point.y + .05, point.z);
          colors.push(c.r * .5, c.g * .5, c.b * .5, c.r * 1.3, c.g * 1.3, c.b * 1.3);
        }
        const index: number[] = [];
        for (let i = 0; i < 400; i += 1) { const a = i * 2; index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(index);
        overlay.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .92 })));
        overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(top.map((p) => p.clone().setY(p.y + .06))), new THREE.LineBasicMaterial({ color: 0xfff1c8 })));
        // 刀面：沿剖面线竖起的一道半透明光幕，让“切开”在远处也一眼可见
        const knife = new THREE.Mesh(new THREE.PlaneGeometry(top[0].distanceTo(top[400]), 1.6), new THREE.MeshBasicMaterial({ color: 0x57d8ff, transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        knife.position.copy(top[0]).lerp(top[400], .5).setY(.75);
        knife.lookAt(knife.position.clone().add(query.axis === "lat" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)));
        overlay.add(knife);
        chart.innerHTML = `<small>${query.axis === "lat" ? `北纬 ${query.value}° 东西向剖面` : `东经 ${query.value}° 南北向剖面`}（海拔 / 米）</small>${profileSvg(samples.filter((_, i) => i % 4 === 0), query.axis)}`;
        chart.hidden = false;
        const mid = top[200];
        const view = query.axis === "lat" ? new THREE.Vector3(-1, 4.2, 9.5) : new THREE.Vector3(9.5, 4.2, 1);
        context.flyTo(mid.clone().add(view), mid.clone().setY(0));
      } else {
        const base = terrain.project(query.lon, query.lat);
        const metres = terrain.elevationAt(query.lon, query.lat);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 4, 12), new THREE.MeshBasicMaterial({ color: 0xff5ad1, transparent: true, opacity: .9 }));
        beam.position.copy(base).add(new THREE.Vector3(0, 2, 0));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff5ad1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.scale.setScalar(1.4);
        glow.position.copy(base);
        const ring = new THREE.Mesh(new THREE.RingGeometry(.25, .32, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5ad1, side: THREE.DoubleSide }));
        ring.position.copy(base).add(new THREE.Vector3(0, .02, 0));
        ring.name = "beam";
        overlay.add(beam, glow, ring);
        chart.innerHTML = `<small>东经 ${query.lon}°，北纬 ${query.lat}°</small><strong>海拔约 ${Math.round(metres)} 米</strong><p>（约 10 km 网格的平均值——峰顶被“削平”了：数据的语言也有精度）</p>`;
        chart.hidden = false;
        context.flyTo(base.clone().add(new THREE.Vector3(2.5, 4.5, 6)), base.clone());
      }
      context.pulse(.5);
    },
    highlight: (role) => { highlighted = role; },
    dispose: () => {
      removeFrame();
      tags.dispose();
      chart.remove();
      context.dispose();
    },
  };
}
