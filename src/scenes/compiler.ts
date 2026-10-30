import * as THREE from "three";
import { sampleShape, type ShapeSpec } from "../domain/compiler";
import { createCinematicStage, createParticleMorph } from "../three/cinematic";
import type { LangScene } from "../ui/langLab";

// 语言编译台的世界：7000 个发光粒子按“语言”重组成形状；悬停关系词时亮出对应的尺寸线。

const PARTICLES = 7000;
const LOW = new THREE.Color(0x2fd4ff);
const HIGH = new THREE.Color(0xc58bff);
const TOP = new THREE.Color(0xfff2d0);

function guideLines(spec: ShapeSpec): Array<{ role: "quantity" | "relation"; points: THREE.Vector3[] }> {
  const v = spec.values;
  const line = (...points: Array<[number, number, number]>) => points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  switch (spec.kind) {
    case "sphere": return [{ role: "quantity", points: line([0, v.r + .3, 0], [v.r, v.r + .3, 0]) }];
    case "helix": return [
      { role: "quantity", points: line([0, .3, 0], [v.r, .3, 0]) },
      { role: "relation", points: line([v.r + .5, .3, 0], [v.r + .5, .3 + v.rise, 0]) },
    ];
    case "cone": return [
      { role: "quantity", points: line([0, .3, 0], [v.r, .3, 0]) },
      { role: "relation", points: line([0, .3, 0], [0, .3 + v.h, 0]) },
    ];
    case "wave": return [{ role: "relation", points: line([-v.lambda / 4, 2.2 + v.amp + .4, -5.3], [v.lambda * .75, 2.2 + v.amp + .4, -5.3]) }];
    case "torus": return [
      { role: "quantity", points: line([0, v.r + .4, 0], [v.R, v.r + .4, 0]) },
      { role: "relation", points: line([v.R, v.r + .4, 0], [v.R + v.r, v.r + .4, 0]) },
    ];
  }
}

export function mountCompiler(stage: HTMLElement): LangScene<ShapeSpec> {
  const context = createCinematicStage(stage, new THREE.Vector3(7.5, 6.2, 10.5), { accent: 0x2fd4ff });
  context.controls.target.set(0, 2.2, 0);
  context.controls.autoRotate = true;
  context.controls.autoRotateSpeed = .6;
  const morph = createParticleMorph(PARTICLES, 0x2fd4ff, .085);
  context.scene.add(morph.points);
  const guides = new THREE.Group();
  context.scene.add(guides);
  const core = new THREE.PointLight(0x7fe8ff, 30, 12);
  core.position.set(0, 2.5, 0);
  context.scene.add(core);
  let highlighted: string | null = null;
  let maxY = 4;

  const styleGuides = () => guides.children.forEach((child) => {
    const material = (child as THREE.Line).material as THREE.LineBasicMaterial;
    material.opacity = highlighted === child.userData.role || highlighted === "relation" && child.userData.role === "quantity" ? 1 : .22;
  });
  const removeFrame = context.onFrame((delta) => morph.update(delta));

  return {
    update: (spec) => {
      const targets = sampleShape(spec, PARTICLES);
      maxY = 0;
      for (let index = 1; index < targets.length; index += 3) maxY = Math.max(maxY, targets[index]);
      morph.setTargets(targets, (index, out) => {
        const t = THREE.MathUtils.clamp(targets[index * 3 + 1] / Math.max(maxY, .1), 0, 1);
        out.copy(LOW).lerp(HIGH, t).lerp(TOP, Math.max(0, t - .7) * 1.6);
      });
      guides.clear();
      for (const guide of guideLines(spec)) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(guide.points), new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: .22 }));
        line.userData.role = guide.role;
        guides.add(line);
        for (const end of [guide.points[0], guide.points.at(-1)!]) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 8), (line.material as THREE.Material));
          dot.position.copy(end);
          dot.userData.role = guide.role;
          guides.add(dot);
        }
      }
      styleGuides();
      context.pulse(.8);
      // 按形状大小取景：包围半径越大，镜头退得越远
      let radius = 0;
      const centerY = Math.max(1.6, maxY / 2);
      for (let index = 0; index < targets.length; index += 3) {
        radius = Math.max(radius, Math.hypot(targets[index], targets[index + 1] - centerY, targets[index + 2]));
      }
      const target = new THREE.Vector3(0, centerY, 0);
      const direction = context.camera.position.clone().sub(context.controls.target).normalize();
      // 按视场角取景：横竖两个方向里更窄的那个决定距离，留 25% 余量（卡片避让后可用区域变小）
      const vertical = THREE.MathUtils.degToRad(context.camera.fov);
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * context.camera.aspect);
      const distance = radius * 1.25 / Math.tan(Math.min(vertical, horizontal) / 2 * .78);
      context.flyTo(target.clone().addScaledVector(direction, Math.max(8, distance)), target, 1.4);
    },
    highlight: (role) => {
      highlighted = role;
      styleGuides();
      morph.setOpacity(role === "object" ? 1 : role ? .45 : .95);
      if (role === "object") context.pulse(.5);
    },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
