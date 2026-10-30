import * as THREE from "three";
import {
  dandelinSpheres, measurePoint, planeToWorld, sampleConic, solveConic,
  type ConicInput, type ConicSection,
} from "../domain/conic";
import { createStage } from "../three/setup";
import { createTagLayer } from "../three/tags";

// 圆锥截线实验台：所有可见的几何都由 domain/conic.ts 的真实解算生成，画面不做“摆拍”。
//   玻璃双圆锥 + 母线 · 金色切面（带网格）· 截线 · Dandelin 双球与切圆 · 焦点、准线 · 动点 P 与距离线段

export interface ConicView {
  spheres: boolean;
  foci: boolean;
  point: boolean;
  /** 0–1，动点在曲线上的位置 */
  u: number;
}

export interface ConicSceneApi {
  update: (input: ConicInput, view: ConicView) => ConicSection;
  /** 镜头：自由 / 正对切面（看真实形状） */
  look: (mode: "free" | "plane") => void;
  dispose: () => void;
}

const HEIGHT = 7.2;
const COLORS = { curve: 0xffffff, plane: 0xffc857, cone: 0x3fc8ff, critical: 0xffc857, f1: 0xff7a59, f2: 0x6fe3ff, directrix: 0xc39bff, sphere: 0x9fe9ff };

const toVec = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x, y, z);

function rod(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(direction.length(), 1e-4), 10, 1, true), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function dashed(points: THREE.Vector3[], color: number, opacity = 0.9): THREE.Line {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity }));
  line.computeLineDistances();
  return line;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(material) ? material : material ? [material] : []).forEach((item) => item.dispose());
  });
  group.clear();
}

export function mountConic(stage: HTMLElement): ConicSceneApi {
  const context = createStage(stage, new THREE.Vector3(14, 7, 15));
  const { scene, camera, controls } = context;
  scene.fog = new THREE.FogExp2(0x02070b, 0.012);
  controls.target.set(0, 1.2, 0);
  controls.minDistance = 6;
  const tags = createTagLayer(stage);
  context.onFrame(() => tags.update(camera));

  const rim = new THREE.PointLight(0x7fd8ff, 40, 40);
  rim.position.set(-8, 6, -6);
  scene.add(rim);
  const floor = new THREE.GridHelper(40, 40, 0x18394a, 0x0c1f2a);
  floor.position.y = -HEIGHT - 0.02;
  scene.add(floor);

  const coneGroup = new THREE.Group();
  const planeGroup = new THREE.Group();
  const curveGroup = new THREE.Group();
  const extraGroup = new THREE.Group();
  scene.add(coneGroup, planeGroup, curveGroup, extraGroup);

  let coneAlpha = -1;
  const buildCone = (alpha: number) => {
    if (alpha === coneAlpha) return;
    coneAlpha = alpha;
    disposeGroup(coneGroup);
    const radius = HEIGHT * Math.tan(THREE.MathUtils.degToRad(alpha));
    const glass = new THREE.MeshPhysicalMaterial({
      color: COLORS.cone, transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0,
      clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    });
    const upper = new THREE.Mesh(new THREE.ConeGeometry(radius, HEIGHT, 96, 1, true), glass);
    upper.rotation.x = Math.PI;
    upper.position.y = HEIGHT / 2;
    const lower = new THREE.Mesh(new THREE.ConeGeometry(radius, HEIGHT, 96, 1, true), glass);
    lower.position.y = -HEIGHT / 2;
    coneGroup.add(upper, lower);
    // 母线：24 条淡线；与切面方向平行的那一条（+z 方向）单独高亮，抛物线临界就看它
    const generators: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const end = new THREE.Vector3(Math.cos(angle) * radius, HEIGHT, Math.sin(angle) * radius);
      generators.push(end, end.clone().multiplyScalar(-1));
    }
    coneGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(generators), new THREE.LineBasicMaterial({ color: COLORS.cone, transparent: true, opacity: 0.22 })));
    [HEIGHT, -HEIGHT].forEach((y) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 6, 128), new THREE.MeshBasicMaterial({ color: COLORS.cone, transparent: true, opacity: 0.5 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      coneGroup.add(ring);
    });
    // 关键母线：方向 (0, cosα, sinα)。β = α 时切面正好与它平行——抛物线的全部秘密
    const critical = new THREE.Vector3(0, HEIGHT, radius);
    coneGroup.add(rod(critical.clone().multiplyScalar(-1), critical, 0.022, new THREE.MeshBasicMaterial({ color: COLORS.critical, transparent: true, opacity: 0.85 })));
    const apex = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    coneGroup.add(apex);
  };

  const planeMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.plane, transparent: true, opacity: 0.17, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const buildPlane = (input: ConicInput) => {
    disposeGroup(planeGroup);
    const S = 6.5;
    const T = 8.5;
    const corners = [[-S, -T], [S, -T], [S, T], [-S, T]].map(([s, t]) => toVec(planeToWorld(input, s, t)));
    const geometry = new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
    geometry.computeVertexNormals();
    planeGroup.add(new THREE.Mesh(geometry, planeMaterial.clone()));
    const grid: THREE.Vector3[] = [];
    for (let s = -S; s <= S + 1e-6; s += 1.5) grid.push(toVec(planeToWorld(input, s, -T)), toVec(planeToWorld(input, s, T)));
    for (let t = -T; t <= T + 1e-6; t += 1.5) grid.push(toVec(planeToWorld(input, -S, t)), toVec(planeToWorld(input, S, t)));
    planeGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), new THREE.LineBasicMaterial({ color: COLORS.plane, transparent: true, opacity: 0.18 })));
    const outline = [...corners, corners[0]];
    planeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({ color: COLORS.plane, transparent: true, opacity: 0.7 })));
  };

  const buildCurve = (section: ConicSection) => {
    disposeGroup(curveGroup);
    const material = new THREE.MeshBasicMaterial({ color: COLORS.curve });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.18, depthWrite: false });
    for (const run of sampleConic(section, HEIGHT)) {
      const points = run.map(([s, t]) => toVec(planeToWorld(section.input, s, t)));
      const closed = section.kind === "ellipse" || section.kind === "circle";
      const curve = new THREE.CatmullRomCurve3(points, closed && run.length > 100);
      curveGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(400, points.length * 2), 0.055, 10, closed), material));
      curveGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(400, points.length * 2), 0.16, 10, closed), glow));
    }
    if (section.degenerate === "point") {
      curveGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), material));
    }
  };

  const buildExtras = (section: ConicSection, view: ConicView) => {
    disposeGroup(extraGroup);
    tags.clear();
    const { input } = section;
    tags.add("顶点", new THREE.Vector3(0.35, 0.3, 0), "tag-muted");
    const radius = HEIGHT * Math.tan(THREE.MathUtils.degToRad(input.alpha));
    tags.add("关键母线", new THREE.Vector3(0, HEIGHT * 0.82, radius * 0.82 + 0.2), "tag-critical");
    if (section.degenerate) return;
    const focusColors = [COLORS.f1, COLORS.f2];
    const focusPoints = section.foci.map((t) => toVec(planeToWorld(input, 0, t)));
    const visibleFocus = (point: THREE.Vector3) => Math.abs(point.y) <= HEIGHT + 0.5;

    if (view.spheres) {
      dandelinSpheres(input).forEach((sphere, index) => {
        if (Math.abs(sphere.y) + sphere.radius > HEIGHT * 1.35) return;
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(sphere.radius, 48, 32),
          new THREE.MeshPhysicalMaterial({ color: COLORS.sphere, transparent: true, opacity: 0.2, roughness: 0.05, clearcoat: 1, depthWrite: false }),
        );
        ball.position.set(0, sphere.y, 0);
        extraGroup.add(ball);
        const contactRadius = Math.abs(sphere.contactY) * Math.tan(THREE.MathUtils.degToRad(input.alpha));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(contactRadius, 0.03, 8, 128), new THREE.MeshBasicMaterial({ color: COLORS.sphere }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = sphere.contactY;
        extraGroup.add(ring);
        tags.add(`切球 ${index + 1}`, new THREE.Vector3(sphere.radius * 0.8 + 0.4, sphere.y + sphere.radius * 0.7, 0), "tag-muted");
      });
    }

    if (view.foci) {
      focusPoints.forEach((point, index) => {
        if (!visibleFocus(point)) return;
        const color = focusColors[index] ?? COLORS.f1;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshBasicMaterial({ color }));
        dot.position.copy(point);
        extraGroup.add(dot);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
        halo.position.copy(point);
        extraGroup.add(halo);
        tags.add(section.foci.length > 1 ? `F<sub>${index + 1}</sub>` : "F", point.clone().add(new THREE.Vector3(0.45, 0.35, 0)), "tag-focus");
      });
      section.directrices.forEach((t, index) => {
        const ends = [-6.5, 6.5].map((s) => toVec(planeToWorld(input, s, t)));
        if (!visibleFocus(ends[0])) return;
        extraGroup.add(dashed(ends, COLORS.directrix));
        tags.add(section.directrices.length > 1 ? `准线 l<sub>${index + 1}</sub>` : "准线 l", ends[1].clone().add(new THREE.Vector3(0.3, 0.25, 0)), "tag-muted");
      });
    }

    const measure = view.point ? measurePoint(section, view.u) : undefined;
    if (measure) {
      const point = toVec(planeToWorld(input, measure.s, measure.t));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      dot.position.copy(point);
      extraGroup.add(dot);
      tags.add("P", point.clone().add(new THREE.Vector3(0.4, 0.4, 0)), "tag-point");
      focusPoints.forEach((focus, index) => {
        extraGroup.add(rod(point, focus, 0.03, new THREE.MeshBasicMaterial({ color: focusColors[index] ?? COLORS.f1 })));
      });
      const directrix = section.directrices[section.kind === "hyperbola" ? 1 : 0];
      if (directrix !== undefined) {
        const foot = toVec(planeToWorld(input, measure.s, directrix));
        extraGroup.add(rod(point, foot, 0.022, new THREE.MeshBasicMaterial({ color: COLORS.directrix })));
      }
    }
  };

  let lastInput: ConicInput | undefined;
  let cameraGoal: { position: THREE.Vector3; target: THREE.Vector3 } | undefined;
  context.onFrame((delta) => {
    if (!cameraGoal) return;
    const k = 1 - Math.pow(0.002, delta);
    camera.position.lerp(cameraGoal.position, k);
    controls.target.lerp(cameraGoal.target, k);
    if (camera.position.distanceTo(cameraGoal.position) < 0.02) cameraGoal = undefined;
  });
  const stopFlight = () => { cameraGoal = undefined; };
  controls.addEventListener("start", stopFlight);

  return {
    update: (input, view) => {
      const section = solveConic(input);
      buildCone(input.alpha);
      buildPlane(input);
      buildCurve(section);
      buildExtras(section, view);
      lastInput = input;
      stage.dataset.conic = section.degenerate ?? section.kind;
      return section;
    },
    look: (mode) => {
      if (mode === "free" || !lastInput) {
        cameraGoal = { position: new THREE.Vector3(14, 7, 15), target: new THREE.Vector3(0, 1.2, 0) };
        return;
      }
      const section = solveConic(lastInput);
      const centerT = section.kind === "parabola" ? section.center + 2.5 : section.center;
      const target = toVec(planeToWorld(lastInput, 0, Math.max(-6, Math.min(6, centerT))));
      const beta = THREE.MathUtils.degToRad(lastInput.beta);
      const normal = new THREE.Vector3(0, -Math.sin(beta), Math.cos(beta));
      if (normal.y < 0) normal.negate();
      cameraGoal = { position: target.clone().addScaledVector(normal, 20).add(new THREE.Vector3(0, 0, 0.01)), target };
    },
    dispose: () => {
      controls.removeEventListener("start", stopFlight);
      tags.dispose();
      context.dispose();
    },
  };
}
