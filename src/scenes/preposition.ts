import * as THREE from "three";
import type { Box, SpatialMeasure, SpatialSentence } from "../domain/preposition";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import type { LangScene } from "../ui/langLab";

// 介词即空间：全息风格的物体 + 主体按介词摆放 / 沿路径运动。悬停介词时亮出“空间关系”路径。

interface Thing { group: THREE.Group; top: number; half: THREE.Vector3; inside?: number; /** 可穿过的开口：底边高度与开口高度（沿 x 方向穿行） */ opening?: { y: number; height: number } }

const SUBJECT_COLOR = 0xffb347;
const LANDMARK_COLOR = 0x57d8ff;

function holo(geometry: THREE.BufferGeometry, color: number, opacity = .32): THREE.Group {
  const group = new THREE.Group();
  // 半透明但写入深度：主体转到物体背面时会被正确遮挡（否则看起来像“穿过”物体）
  group.add(new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .35, transparent: true, opacity, roughness: .2, side: THREE.DoubleSide, depthWrite: true })));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95 })));
  return group;
}
const at = (object: THREE.Object3D, x: number, y: number, z: number) => { object.position.set(x, y, z); return object; };

function make(noun: string, color: number): Thing {
  const g = new THREE.Group();
  switch (noun) {
    case "cat": {
      const body = holo(new THREE.CapsuleGeometry(.28, .6, 6, 12), color, .5); body.rotation.z = Math.PI / 2; at(body, 0, .38, 0);
      const head = at(holo(new THREE.SphereGeometry(.26, 16, 12), color, .5), .52, .66, 0);
      const ears = [-.1, .1].map((z) => at(holo(new THREE.ConeGeometry(.08, .2, 4), color, .6), .56, .94, z));
      const tail = holo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.55, .4, 0), new THREE.Vector3(-.8, .7, 0), new THREE.Vector3(-.75, 1, 0)]), 12, .05, 6), color, .6);
      g.add(body, head, ...ears, tail);
      return { group: g, top: 1.05, half: new THREE.Vector3(.85, .5, .3) };
    }
    case "ball": g.add(at(holo(new THREE.IcosahedronGeometry(.42, 2), color, .5), 0, .42, 0)); return { group: g, top: .84, half: new THREE.Vector3(.42, .42, .42) };
    case "bird": {
      const body = at(holo(new THREE.SphereGeometry(.24, 14, 10), color, .55), 0, .3, 0);
      const wings = [-1, 1].map((side) => { const wing = holo(new THREE.PlaneGeometry(.6, .26), color, .5); wing.name = "wing"; wing.userData.side = side; at(wing, 0, .34, side * .3); wing.rotation.x = Math.PI / 2; return wing; });
      g.add(body, ...wings, at(holo(new THREE.ConeGeometry(.07, .2, 6), color, .7).rotateZ(-Math.PI / 2), .3, .32, 0));
      return { group: g, top: .55, half: new THREE.Vector3(.35, .3, .5) };
    }
    case "car": {
      g.add(at(holo(new THREE.BoxGeometry(1.5, .4, .8), color, .45), 0, .42, 0), at(holo(new THREE.BoxGeometry(.8, .35, .7), color, .45), -.1, .8, 0));
      for (const [x, z] of [[-.5, .42], [.5, .42], [-.5, -.42], [.5, -.42]]) g.add(at(holo(new THREE.CylinderGeometry(.2, .2, .12, 14).rotateX(Math.PI / 2), color, .6), x, .2, z));
      return { group: g, top: .98, half: new THREE.Vector3(.75, .5, .45) };
    }
    case "table": {
      g.add(at(holo(new THREE.BoxGeometry(3.2, .14, 2), color), 0, 1.7, 0));
      for (const [x, z] of [[-1.45, -.85], [1.45, -.85], [-1.45, .85], [1.45, .85]]) g.add(at(holo(new THREE.BoxGeometry(.12, 1.63, .12), color), x, .82, z));
      return { group: g, top: 1.77, half: new THREE.Vector3(1.6, .9, 1) };
    }
    case "chair": {
      g.add(at(holo(new THREE.BoxGeometry(1, .1, 1), color), 0, .9, 0), at(holo(new THREE.BoxGeometry(1, 1, .1), color), 0, 1.4, -.45));
      for (const [x, z] of [[-.42, -.42], [.42, -.42], [-.42, .42], [.42, .42]]) g.add(at(holo(new THREE.BoxGeometry(.08, .86, .08), color), x, .43, z));
      return { group: g, top: .95, half: new THREE.Vector3(.5, .5, .5) };
    }
    case "box": {
      const size = 1.8;
      for (const [w, h, d, x, y, z] of [[size, .06, size, 0, .03, 0], [size, size, .06, 0, size / 2, -size / 2], [size, size, .06, 0, size / 2, size / 2], [.06, size, size, -size / 2, size / 2, 0], [.06, size, size, size / 2, size / 2, 0]]) {
        g.add(at(holo(new THREE.BoxGeometry(w, h, d), color, .18), x, y, z));
      }
      return { group: g, top: size, half: new THREE.Vector3(size / 2, size / 2, size / 2), inside: .1 };
    }
    case "tree": {
      g.add(at(holo(new THREE.CylinderGeometry(.16, .22, 1.2, 8), 0x9a7a55, .5), 0, .6, 0));
      [[1.1, 1.5, 1.5], [.85, 1.2, 2.3], [.55, .9, 2.95]].forEach(([r, h, y]) => g.add(at(holo(new THREE.ConeGeometry(r, h, 10), 0x5cffb0, .3), 0, y, 0)));
      return { group: g, top: 3.4, half: new THREE.Vector3(1.1, 1.7, 1.1) };
    }
    case "house": {
      g.add(at(holo(new THREE.BoxGeometry(2.2, 1.6, 1.8), color), 0, .8, 0));
      const roof = holo(new THREE.CylinderGeometry(0, 1.6, 1.1, 4, 1).rotateY(Math.PI / 4).scale(1, 1, .82), color); at(roof, 0, 2.15, 0); g.add(roof);
      return { group: g, top: 2.7, half: new THREE.Vector3(1.1, 1.35, .9) };
    }
    case "tunnel": {
      // 拱形截面（在 z–y 平面内），沿 x 方向拉伸：车沿 x 轴从拱洞中间开过
      const arch = new THREE.Shape();
      arch.moveTo(1.7, 0);
      arch.absarc(0, 0, 1.7, 0, Math.PI, false);
      arch.lineTo(-1.3, 0);
      arch.absarc(0, 0, 1.3, Math.PI, 0, true);
      arch.lineTo(1.7, 0);
      const geometry = new THREE.ExtrudeGeometry(arch, { depth: 4.4, bevelEnabled: false, curveSegments: 32 });
      geometry.translate(0, 0, -2.2);
      geometry.rotateY(Math.PI / 2);
      g.add(holo(geometry, color, .3));
      return { group: g, top: 1.7, half: new THREE.Vector3(2.2, .85, 1.7), opening: { y: 0, height: 1.3 } };
    }
    case "window": {
      // 一面墙（垂直于 x 轴）中间开一扇窗：窗洞 1.4 × 1.4，窗台高 1.0
      const wall = (w: number, h: number, y: number, z: number) => at(holo(new THREE.BoxGeometry(.24, h, w), color, .35), 0, y, z);
      g.add(wall(4.6, 1.0, .5, 0), wall(4.6, .8, 2.8, 0), wall(1.6, 1.4, 1.7, -1.5), wall(1.6, 1.4, 1.7, 1.5));
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.3, 1.4, 1.4)), new THREE.LineBasicMaterial({ color: 0xffffff }));
      frame.position.set(0, 1.7, 0);
      g.add(frame);
      return { group: g, top: 3.2, half: new THREE.Vector3(.12, 1.6, 2.3), opening: { y: 1.0, height: 1.4 } };
    }
    case "door": {
      // 墙上一扇门：门洞宽 1.4、高 2.2，贴地
      const wall = (w: number, h: number, y: number, z: number) => at(holo(new THREE.BoxGeometry(.24, h, w), color, .35), 0, y, z);
      g.add(wall(1.6, 3.2, 1.6, -1.5), wall(1.6, 3.2, 1.6, 1.5), wall(1.4, 1.0, 2.7, 0));
      return { group: g, top: 3.2, half: new THREE.Vector3(.12, 1.6, 2.3), opening: { y: 0, height: 2.2 } };
    }
    case "river": {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4, 60, 6).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x1d8fd6, emissive: 0x0b5a9a, emissiveIntensity: .7, transparent: true, opacity: .75, roughness: .1 }));
      water.position.y = .03;
      water.name = "water";
      g.add(water);
      return { group: g, top: .05, half: new THREE.Vector3(7, .05, 1.2) };
    }
    default: g.add(holo(new THREE.BoxGeometry(1, 1, 1), color)); return { group: g, top: 1, half: new THREE.Vector3(.5, .5, .5) };
  }
}

/** 介词 → 主体位置（静态）或路径（动态） */
function layout(sentence: SpatialSentence, subject: Thing, marks: Thing[]): { path: THREE.Vector3[]; loop: boolean } {
  const [a, b] = marks;
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (sentence.relation) {
    case "on": return { path: [p(0, a.top, 0)], loop: false };
    case "under": return { path: [p(0, 0, 0)], loop: false };
    case "in": return { path: [p(0, a.inside ?? .1, 0)], loop: false };
    case "above": return { path: [p(0, a.top + 1.6, 0)], loop: false };
    case "behind": return { path: [p(.6, 0, -a.half.z - subject.half.z - 1)], loop: false };
    case "in front of": return { path: [p(-.4, 0, a.half.z + subject.half.z + 1)], loop: false };
    case "next to": return { path: [p(a.half.x + subject.half.x + .6, 0, 0)], loop: false };
    case "between": return { path: [p(0, 0, 0)], loop: false };
    case "through": {
      // 沿 x 轴、在开口高度上穿过；起点和终点远离物体，中段保持水平穿过开口
      // 贴地的开口（隧道、门）沿地面走；离地的开口（窗）对准洞口中心
      const bottom = a.opening?.y ?? 0;
      const y = bottom > 0 ? bottom + (a.opening!.height - subject.half.y * 2) / 2 : 0;
      const lift = (x: number) => y * THREE.MathUtils.smoothstep(4.6 - Math.abs(x), 0, 2.4);
      return { path: [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6].map((x) => p(x, sentence.subject === "bird" ? y : lift(x), 0)), loop: true };
    }
    case "across": return { path: [p(0, 0, 3.2), p(0, .25, 0), p(0, 0, -3.2)], loop: true };
    case "around": {
      const radius = Math.max(a.half.x, a.half.z) + subject.half.x + 1.3;
      const height = sentence.subject === "bird" ? a.top * .5 : 0;
      return { path: Array.from({ length: 65 }, (_, i) => p(Math.cos(i / 64 * Math.PI * 2) * radius, height, -Math.sin(i / 64 * Math.PI * 2) * radius)), loop: true };
    }
    case "over": return { path: Array.from({ length: 25 }, (_, i) => { const t = i / 24; return p(-4 + 8 * t, (a.top + .9) * 4 * t * (1 - t) * 1.05, 0); }), loop: true };
    case "into": return { path: Array.from({ length: 25 }, (_, i) => { const t = i / 24; return p(-4 + 4 * t, (a.top + .8) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t) + (a.inside ?? .1) * t, 0); }), loop: true };
    case "out of": return { path: Array.from({ length: 25 }, (_, i) => { const t = 1 - i / 24; return p(-4 + 4 * t, (a.top + .8) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t) + (a.inside ?? .1) * t, 0); }), loop: true };
    case "along": return { path: [p(-6, 0, 1.9), p(6, 0, 1.9)], loop: true };
  }
  void b;
}

export interface PrepositionScene extends LangScene<SpatialSentence> {
  /** 当前句子在场景里的真实几何：主体最终位置、路径、参照物包围盒、开口、镜头位置 */
  measure: () => SpatialMeasure | undefined;
}

const boxOf = (position: THREE.Vector3, thing: Thing, swap = false): Box => {
  const hx = swap ? thing.half.z : thing.half.x;
  const hz = swap ? thing.half.x : thing.half.z;
  return { min: [position.x - hx, position.y, position.z - hz], max: [position.x + hx, position.y + thing.top, position.z + hz] };
};

export function mountPreposition(stage: HTMLElement): PrepositionScene {
  const context = createCinematicStage(stage, new THREE.Vector3(5.5, 5.2, 9.5), { accent: 0x57d8ff, target: new THREE.Vector3(0, 1.1, 0), dust: 900, bloom: { strength: .6, radius: .4, threshold: .55 } });
  context.scene.add(new THREE.DirectionalLight(0xffffff, 1.4).translateX(3).translateY(8).translateZ(6));
  let subject: Thing | null = null;
  let subjectNoun = "";
  let landmarks: Thing[] = [];
  let landmarkKey = "";
  let curve: THREE.CatmullRomCurve3 | null = null;
  let loop = false;
  let clock = 0;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let settle = 1;
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffd38a, dashSize: .25, gapSize: .15, transparent: true, opacity: .55 }));
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ map: glowTexture(), color: SUBJECT_COLOR, size: .22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  context.scene.add(pathLine, sparks);
  const trail: THREE.Vector3[] = [];
  let highlighted: string | null = null;
  let sentence: SpatialSentence | null = null;
  let placementPath: THREE.Vector3[] = [];
  // 方向箭头：沿路径均匀分布，表明“绕”的方向
  const arrows = new THREE.Group();
  context.scene.add(arrows);

  const removeFrame = context.onFrame((delta) => {
    clock += delta;
    if (!subject) return;
    settle = Math.min(1, settle + delta * 1.4);
    let position: THREE.Vector3;
    if (curve && loop) {
      const t = (clock * (sentence?.relation === "around" ? .16 : .22)) % 1;
      position = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      subject.group.rotation.y = THREE.MathUtils.damp(subject.group.rotation.y, Math.atan2(-tangent.z, tangent.x), 8, delta);
    } else {
      const k = 1 - Math.pow(1 - settle, 3);
      position = from.clone().lerp(to, k);
      if (settle < 1) position.y += Math.sin(settle * Math.PI) * 1.2;
    }
    subject.group.position.copy(position);
    subject.group.scale.setScalar(highlighted === "subject" ? 1.15 + Math.sin(clock * 8) * .05 : 1);
    subject.group.traverse((object) => {
      if (object.name === "wing") object.rotation.y = Math.sin(clock * 14) * .7 * object.userData.side;
    });
    trail.push(position.clone().add(new THREE.Vector3(0, .3, 0)));
    if (trail.length > 160) trail.shift();
    const sparkPositions = sparkGeometry.getAttribute("position") as THREE.BufferAttribute;
    trail.forEach((point, index) => sparkPositions.setXYZ(index, point.x, point.y, point.z));
    sparkPositions.needsUpdate = true;
    sparkGeometry.setDrawRange(0, loop ? trail.length : 0);
    landmarks.forEach((mark) => mark.group.scale.setScalar(highlighted === "landmark" ? 1.04 + Math.sin(clock * 6) * .02 : 1));
    landmarks.forEach((mark) => {
      const water = mark.group.getObjectByName("water") as THREE.Mesh | undefined;
      if (water) {
        const attribute = water.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let index = 0; index < attribute.count; index += 1) attribute.setY(index, Math.sin(attribute.getX(index) * 1.4 + clock * 2) * .04);
        attribute.needsUpdate = true;
      }
    });
    (pathLine.material as THREE.LineDashedMaterial).opacity = THREE.MathUtils.damp((pathLine.material as THREE.LineDashedMaterial).opacity, highlighted === "relation" ? 1 : .55, 6, delta);
  });

  return {
    update: (next) => {
      sentence = next;
      const key = sentence.landmarks.join("+") + (sentence.relation === "between" ? "|between" : "");
      if (key !== landmarkKey) {
        landmarks.forEach((mark) => context.scene.remove(mark.group));
        landmarks = sentence.landmarks.map((noun) => make(noun, LANDMARK_COLOR));
        if (sentence.relation === "between") {
          landmarks[0].group.position.x = -(landmarks[0].half.x + 1.6);
          landmarks[1].group.position.x = landmarks[1].half.x + 1.6;
        }
        landmarks.forEach((mark) => context.scene.add(mark.group));
        landmarkKey = key;
      }
      if (sentence.subject !== subjectNoun) {
        const previous = subject?.group.position.clone();
        if (subject) context.scene.remove(subject.group);
        subject = make(sentence.subject, SUBJECT_COLOR);
        if (previous) subject.group.position.copy(previous);
        context.scene.add(subject.group);
        subjectNoun = sentence.subject;
      }
      const placement = layout(sentence, subject!, landmarks);
      placementPath = placement.path.map((point) => point.clone());
      loop = placement.loop;
      trail.length = 0;
      from.copy(subject!.group.position);
      to.copy(placement.path[0]);
      settle = 0;
      if (!loop) subject!.group.rotation.y = sentence.relation === "behind" || sentence.relation === "in front of" ? -Math.PI / 2 : 0;
      curve = placement.path.length > 1 ? new THREE.CatmullRomCurve3(placement.path) : null;
      // 静态介词只为 between 画出 B—C 连线；动态介词画出整条路径
      const guide = curve ? curve.getPoints(80)
        : sentence.relation === "between" ? landmarks.map((mark) => mark.group.position.clone().setY(.4)) : [];
      pathLine.geometry.dispose();
      pathLine.geometry = new THREE.BufferGeometry().setFromPoints(guide.map((point) => point.clone().add(new THREE.Vector3(0, .05, 0))));
      pathLine.computeLineDistances();
      arrows.clear();
      if (curve && placement.loop) {
        for (let index = 0; index < 8; index += 1) {
          const u = index / 8;
          const arrow = new THREE.Mesh(new THREE.ConeGeometry(.09, .26, 10), new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: .75 }));
          arrow.position.copy(curve.getPointAt(u)).add(new THREE.Vector3(0, .06, 0));
          arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(u));
          arrows.add(arrow);
        }
      }
      // around 用较低的镜头：主体转到背面时被参照物挡住，“绕”一眼可见
      const height = Math.max(...landmarks.map((mark) => mark.top), 1);
      if (sentence!.relation === "around") context.flyTo(new THREE.Vector3(6.5, height * .9 + 2.2, 9.5), new THREE.Vector3(0, height * .4, 0), 1.4);
      else context.flyTo(new THREE.Vector3(5.5, 5.2, 9.5), new THREE.Vector3(0, 1.1, 0), 1.4);
      context.pulse(.6);
    },
    highlight: (role) => { highlighted = role; },
    measure: () => {
      if (!sentence || !subject) return undefined;
      const swap = sentence.relation === "behind" || sentence.relation === "in front of";
      const sampled = placementPath.length > 1 ? new THREE.CatmullRomCurve3(placementPath).getPoints(64) : [];
      return {
        subject: boxOf(placementPath[0], subject, swap),
        path: sampled.map((point) => [point.x, point.y, point.z] as [number, number, number]),
        landmarks: landmarks.map((mark) => boxOf(mark.group.position, mark)),
        openings: landmarks.map((mark) => mark.opening ? { bottom: mark.group.position.y + mark.opening.y, top: mark.group.position.y + mark.opening.y + mark.opening.height } : undefined),
        viewer: [context.camera.position.x, context.camera.position.y, context.camera.position.z],
      };
    },
    dispose: () => {
      removeFrame();
      context.dispose();
    },
  };
}
