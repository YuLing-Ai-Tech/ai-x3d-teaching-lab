import * as THREE from "three";
import { createGraticuleFloor, createRouteFlow } from "./longMarchFx";
import { routeNodes } from "../data/route";
import { mapLabels, routePath } from "../data/routePath";
import { validateRoute } from "../domain/route";
import { createStage } from "../three/setup";
import type { RouteNode } from "../types";
import { createRain } from "./chinaMap";
import { createInsetMap, createLabelLayer, type LabelSpec } from "./longMarchLabels";
import { loadReliefTerrain, VERTICAL_EXAGGERATION, type ReliefTerrain } from "./longMarchTerrain";

export interface LongMarchScene {
  selectNode: (index: number) => void;
  overview: () => void;
  setRain: (enabled: boolean) => void;
  setDimension: (dimension: "2d" | "3d") => void;
  dispose: () => void;
}

export const CHALLENGE_COLORS: Record<RouteNode["challenge"], number> = {
  突破封锁: 0xff5a42,
  战略转折: 0xffc65c,
  自然险阻: 0xa6e6ff,
  会师落脚: 0xff9440,
};

/** 按采样序号参数化的折线：管道分段、事件位置和红旗位置用同一套参数，保证路线“走到”图钉。 */
class SampledPath extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly points: THREE.Vector3[]) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const scaled = THREE.MathUtils.clamp(t, 0, 1) * (this.points.length - 1);
    const index = Math.min(this.points.length - 2, Math.floor(scaled));
    return target.lerpVectors(this.points[index], this.points[index + 1], scaled - index);
  }
  override getPointAt(u: number, target?: THREE.Vector3): THREE.Vector3 { return this.getPoint(u, target); }
  override getTangentAt(u: number, target?: THREE.Vector3): THREE.Vector3 { return this.getTangent(u, target); }
}

interface DrapedRoute {
  path: SampledPath;
  /** 每个事件节点在整条路线上的弧长比例 0–1 */
  eventFraction: number[];
  segments: number;
}

function drapeRoute(terrain: ReliefTerrain): DrapedRoute {
  const flat = new THREE.CatmullRomCurve3(routePath.map((point) => new THREE.Vector3(point.lon, point.lat, 0)), false, "centripetal");
  const samples: THREE.Vector3[] = [];
  const waypointSample: number[] = [];
  for (let index = 0; index < routePath.length - 1; index += 1) {
    waypointSample.push(samples.length);
    const a = routePath[index];
    const b = routePath[index + 1];
    const steps = Math.max(4, Math.ceil(Math.hypot(b.lon - a.lon, b.lat - a.lat) * 45));
    for (let step = 0; step < steps; step += 1) {
      const t = (index + step / steps) / (routePath.length - 1);
      const { x: lon, y: lat } = flat.getPoint(t);
      samples.push(terrain.project(lon, lat, .045));
    }
  }
  waypointSample.push(samples.length);
  const last = routePath.at(-1)!;
  samples.push(terrain.project(last.lon, last.lat, .045));

  const eventFraction = routeNodes.map((node) => {
    const waypoint = routePath.findIndex((point) => point.event === node.id);
    if (waypoint < 0) throw new Error(`路线缺少事件节点：${node.id}`);
    return waypointSample[waypoint] / (samples.length - 1);
  });
  return { path: new SampledPath(samples), eventFraction, segments: (samples.length - 1) * 2 };
}

function tube(route: DrapedRoute, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(route.path, route.segments, radius, 8, false), material);
  mesh.renderOrder = 2;
  return mesh;
}

function glowSprite(color: string, size: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.35, color.replace(/[\d.]+\)$/, ".45)"));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.setScalar(size);
  return sprite;
}

function createFlag(): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.008, .01, .46, 6), new THREE.MeshStandardMaterial({ color: 0xe8d6b0, roughness: .5 }));
  pole.position.y = .23;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(.24, .15, 8, 2), new THREE.MeshStandardMaterial({ color: 0xe0281e, emissive: 0x8a0d08, emissiveIntensity: .7, side: THREE.DoubleSide, roughness: .7 }));
  cloth.position.set(.12, .38, 0);
  cloth.name = "cloth";
  group.add(pole, cloth, glowSprite("rgba(255,96,64,1)", .38));
  return group;
}

function createPin(node: RouteNode, index: number): THREE.Group {
  const color = CHALLENGE_COLORS[node.challenge];
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .34, 6), new THREE.MeshBasicMaterial({ color: 0xf3e2bd, transparent: true, opacity: .85 }));
  stem.position.y = .17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.065, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true }));
  head.position.y = .36;
  const ring = new THREE.Mesh(new THREE.RingGeometry(.11, .145, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .02;
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .5, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = .25;
  [stem, head, ring, hit].forEach((mesh) => { mesh.userData.nodeIndex = index; });
  group.add(stem, head, ring, hit);
  return group;
}

function createSnow(count: number): { points: THREE.Points; center: THREE.Vector3; update: (delta: number) => void } {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions.set([(Math.random() - .5) * 5, Math.random() * 3.2, (Math.random() - .5) * 5], index * 3);
    seeds[index] = Math.random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const flake = document.createElement("canvas");
  flake.width = flake.height = 32;
  const flakeContext = flake.getContext("2d")!;
  const gradient = flakeContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  flakeContext.fillStyle = gradient;
  flakeContext.fillRect(0, 0, 32, 32);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(flake), color: 0xffffff, size: .028, transparent: true, opacity: .85, depthWrite: false }));
  const center = new THREE.Vector3();
  let clock = 0;
  return {
    points,
    center,
    update: (delta) => {
      clock += delta;
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < count; index += 1) {
        let y = attribute.getY(index) - delta * (.35 + (index % 5) * .06);
        if (y < 0) y = 3.2;
        attribute.setY(index, y);
        attribute.setX(index, attribute.getX(index) + Math.sin(clock + seeds[index]) * delta * .12);
      }
      attribute.needsUpdate = true;
      points.position.copy(center);
    },
  };
}

const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export async function mountLongMarch(stage: HTMLElement, onNodeOpen: (index: number) => void): Promise<LongMarchScene> {
  validateRoute(routeNodes);
  const mobile = stage.clientWidth < 700;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const context = createStage(stage, new THREE.Vector3(0, 26, 26));
  // 全国沙盘，按国界切出形状；宽度 70 让长征区域保持与原区域沙盘相同的比例尺
  const terrain = await loadReliefTerrain({ base: "./data/china-hd/", outline: "./data/china-outline.json", worldWidth: 70, slab: "thick", stride: mobile ? 3 : 1, anisotropy: context.renderer.capabilities.getMaxAnisotropy() });
  const routeCenter = terrain.project(109.5, 30.75).setY(0);
  context.scene.background = new THREE.Color(0x041015);
  context.scene.fog = new THREE.FogExp2(0x041015, .0042);
  context.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  context.renderer.toneMappingExposure = 1.05;
  context.camera.near = .05;
  context.camera.far = 600;
  context.camera.updateProjectionMatrix();
  context.controls.minDistance = 2.2;
  context.controls.maxDistance = 260;
  context.controls.maxPolarAngle = Math.PI * .46;
  context.scene.add(terrain.group);
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
  sun.position.set(-12, 16, 6);
  context.scene.add(sun);

  const route = drapeRoute(terrain);
  context.scene.add(tube(route, .022, new THREE.MeshBasicMaterial({ color: 0xc9a27a, transparent: true, opacity: .4, depthWrite: false })));
  const walked = tube(route, .042, new THREE.MeshStandardMaterial({ color: 0xff4a35, emissive: 0xd0261a, emissiveIntensity: .9, roughness: .45 }));
  const walkedGlow = tube(route, .07, new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending }));
  context.scene.add(walked, walkedGlow);
  const flow = createRouteFlow(route.path, route.segments);
  context.scene.add(flow.mesh, createGraticuleFloor(terrain, -1.9));
  const totalIndices = walked.geometry.index!.count;
  const revealRoute = (fraction: number) => {
    const count = Math.floor(THREE.MathUtils.clamp(fraction, 0, 1) * route.segments) * 8 * 6;
    walked.geometry.setDrawRange(0, Math.min(totalIndices, count));
    walkedGlow.geometry.setDrawRange(0, Math.min(totalIndices, count));
    flow.reveal(fraction);
  };
  const flag = createFlag();
  context.scene.add(flag);

  const pinPositions = routeNodes.map((node) => terrain.project(node.lon, node.lat));
  const pins = routeNodes.map((node, index) => {
    const pin = createPin(node, index);
    pin.position.copy(pinPositions[index]);
    context.scene.add(pin);
    return pin;
  });

  const labelSpecs: LabelSpec[] = [
    ...routeNodes.map((node, index): LabelSpec => ({ text: node.title, date: node.date.replaceAll("-", "."), kind: "event", nodeIndex: index, position: pinPositions[index].clone().add(new THREE.Vector3(0, .5, 0)) })),
    ...routePath.filter((point) => point.label).map((point): LabelSpec => ({ text: point.name, kind: "waypoint", position: terrain.project(point.lon, point.lat, .08) })),
    ...mapLabels.map((label): LabelSpec => ({ text: label.text, kind: label.kind, position: terrain.project(label.lon, label.lat, label.kind === "region" ? .5 : .1) })),
  ];
  const labels = createLabelLayer(stage, labelSpecs, onNodeOpen);
  const removeInset = await createInsetMap(stage, terrain.bounds, routePath.map((point) => [point.lon, point.lat]));

  const rain = createRain(mobile ? 160 : 420);
  (rain.points.material as THREE.LineBasicMaterial).opacity = .2;
  rain.points.scale.set(.95, .8, 1.15);
  context.scene.add(rain.points);
  rain.points.position.copy(routeCenter);
  const snow = createSnow(mobile ? 260 : 700);
  context.scene.add(snow.points);

  let currentDimension: "2d" | "3d" = "3d";
  let weatherEnabled = true;
  let selected = -1;
  let progress = 0;
  let progressFrom = 0;
  let progressTo = 1;
  let progressClock = 1;
  let progressDuration = reducedMotion ? .01 : 5.5;
  const tween = { active: false, t: 0, duration: 1.9, fromPosition: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toPosition: new THREE.Vector3(), toTarget: new THREE.Vector3() };

  const flyTo = (position: THREE.Vector3, target: THREE.Vector3, duration = 1.9) => {
    if (reducedMotion || duration <= 0) {
      context.camera.position.copy(position);
      context.controls.target.copy(target);
      tween.active = false;
      return;
    }
    tween.fromPosition.copy(context.camera.position);
    tween.fromTarget.copy(context.controls.target);
    tween.toPosition.copy(position);
    tween.toTarget.copy(target);
    tween.t = 0;
    tween.duration = duration;
    tween.active = true;
  };
  const animateProgress = (from: number, to: number, duration: number) => {
    progressFrom = from;
    progressTo = to;
    progressClock = 0;
    progressDuration = reducedMotion ? .01 : duration;
  };
  const refreshWeather = () => {
    const allowed = weatherEnabled && currentDimension === "3d" && !reducedMotion;
    const snowing = allowed && routeNodes[selected]?.id === "jiajin";
    snow.points.visible = snowing;
    rain.points.visible = allowed && !snowing;
    stage.dataset.weather = allowed ? "running" : "paused";
    stage.dataset.weatherKind = snowing ? "snow" : "rain";
  };
  const setPinState = (focus: number) => pins.forEach((pin, index) => {
    const muted = focus >= 0 && index !== focus;
    pin.scale.setScalar(index === focus ? 1.35 : muted ? .8 : 1);
    pin.children.forEach((child) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (material.visible !== false) material.opacity = muted ? .35 : child === pin.children[2] ? .8 : 1;
    });
  });

  const overview = () => {
    selected = -1;
    setPinState(-1);
    labels.setMode("overview");
    const portrait = stage.clientWidth / Math.max(stage.clientHeight, 1) < .8;
    if (currentDimension === "2d") {
      flyTo(new THREE.Vector3(0, portrait ? 150 : 82, .01), new THREE.Vector3(0, 0, 0));
      stage.dataset.cameraMode = "top-down";
    } else {
      // 全景：整个中国的沙盘形状，略偏向长征区域
      const focus = new THREE.Vector3(routeCenter.x * .35, -1, routeCenter.z * .35 + 2);
      flyTo(focus.clone().add(portrait ? new THREE.Vector3(0, 185, 120) : new THREE.Vector3(-2, 52, 47)), portrait ? new THREE.Vector3(0, -1, 2) : focus);
      stage.dataset.cameraMode = "overview";
    }
    if (progress < 1) animateProgress(progress, 1, (1 - progress) * 5);
    stage.dataset.view = "overview";
    stage.dataset.continentCoverage = "pending";
    refreshWeather();
  };

  const selectNode = (index: number) => {
    const safeIndex = THREE.MathUtils.clamp(index, 0, routeNodes.length - 1);
    const previous = Math.max(0, safeIndex - 1);
    selected = safeIndex;
    setPinState(safeIndex);
    labels.setMode("focus", safeIndex);
    animateProgress(route.eventFraction[previous], route.eventFraction[safeIndex], safeIndex === 0 ? .3 : 2.4);
    const target = pinPositions[safeIndex].clone();
    const from = pinPositions[safeIndex === 0 ? 1 : previous];
    const heading = safeIndex === 0 ? target.clone().sub(from) : target.clone().sub(from);
    heading.y = 0;
    if (heading.lengthSq() < 1e-4) heading.set(0, 0, -1);
    heading.normalize();
    const side = new THREE.Vector3(-heading.z, 0, heading.x);
    const portrait = stage.clientWidth / Math.max(stage.clientHeight, 1) < .8;
    stage.dataset.view = "event";
    stage.dataset.cameraMode = "event-context";
    refreshWeather();
    if (currentDimension === "2d") {
      flyTo(target.clone().add(new THREE.Vector3(0, portrait ? 16 : 9, .01)), target);
      return;
    }
    const distance = portrait ? 6.5 : 4.6;
    const camera = target.clone().addScaledVector(heading, -distance).addScaledVector(side, 1.4).add(new THREE.Vector3(0, distance * .95, distance * .25));
    snow.center.copy(target).add(new THREE.Vector3(0, .2, 0));
    rain.points.position.set(target.x, 0, target.z);
    flyTo(camera, target.clone().addScaledVector(heading, .6));
  };

  const setDimension = (dimension: "2d" | "3d") => {
    currentDimension = dimension;
    stage.dataset.dimension = dimension;
    context.controls.enableRotate = dimension === "3d";
    context.camera.up.set(0, dimension === "3d" ? 1 : 0, dimension === "3d" ? 0 : -1);
    terrain.setCutaway(dimension === "3d");
    stage.dataset.cutaway = dimension === "3d" ? "visible" : "hidden";
    overview();
  };

  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const pick = (event: PointerEvent) => {
    const rect = context.renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, context.camera);
    const hit = raycaster.intersectObjects(pins, true).find((entry) => Number.isInteger(entry.object.userData.nodeIndex));
    return hit ? hit.object.userData.nodeIndex as number : -1;
  };
  const moveListener = (event: PointerEvent) => { context.renderer.domElement.style.cursor = pick(event) >= 0 ? "pointer" : "grab"; };
  const clickListener = (event: PointerEvent) => {
    const index = pick(event);
    if (index >= 0) onNodeOpen(index);
  };
  context.renderer.domElement.addEventListener("pointermove", moveListener);
  context.renderer.domElement.addEventListener("click", clickListener);
  context.controls.addEventListener("start", () => { tween.active = false; });

  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * terrain.width / 2, 0, sz * terrain.depth / 2)));
  const projected = new THREE.Vector3();
  const removeFrame = context.onFrame((delta) => {
    if (tween.active) {
      tween.t = Math.min(1, tween.t + delta / tween.duration);
      const k = easeInOut(tween.t);
      context.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k);
      context.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (tween.t >= 1) tween.active = false;
    }
    if (progressClock < 1) {
      progressClock = Math.min(1, progressClock + delta / progressDuration);
      progress = THREE.MathUtils.lerp(progressFrom, progressTo, easeInOut(progressClock));
      revealRoute(progress);
    }
    const head = route.path.getPoint(Math.max(.0005, Math.min(.9995, progress)));
    flag.position.copy(head);
    const cloth = flag.getObjectByName("cloth")!;
    cloth.rotation.y = Math.sin(performance.now() * .004) * .25;
    flow.update(delta, context.camera.position.distanceTo(context.controls.target));
    if (rain.points.visible) rain.update(delta);
    if (snow.points.visible) snow.update(delta);
    pins.forEach((pin, index) => {
      const ring = pin.children[2];
      ring.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(performance.now() * .003 + index) * .12);
    });
    labels.update(context.camera, stage.clientWidth, stage.clientHeight);
    if (stage.dataset.view === "overview" && !tween.active) {
      const complete = corners.every((corner) => {
        projected.copy(corner).project(context.camera);
        return Math.abs(projected.x) <= .99 && Math.abs(projected.y) <= .99 && projected.z < 1;
      });
      stage.dataset.continentCoverage = complete ? "complete" : "clipped";
    }
  });

  Object.assign(stage.dataset, {
    engine: "three-relief",
    terrain: "dem-relief",
    terrainRenderer: "mesh-dem",
    terrainCutout: "region-block",
    sideProfile: "stratified",
    terrainFinish: "baked-hillshade",
    edgeContrast: "high",
    routeFlow: "draped-progress",
    verticalExaggeration: String(VERTICAL_EXAGGERATION),
    qualityTier: mobile ? "mobile" : "desktop",
    motion: reducedMotion ? "reduced" : "full",
    dimension: "3d",
    cutaway: "visible",
  });
  revealRoute(0);
  animateProgress(0, 1, 5.5);
  overview();
  return {
    selectNode,
    overview,
    setRain: (enabled) => { weatherEnabled = enabled; refreshWeather(); },
    setDimension,
    dispose: () => {
      removeFrame();
      labels.dispose();
      removeInset();
      context.renderer.domElement.removeEventListener("pointermove", moveListener);
      context.renderer.domElement.removeEventListener("click", clickListener);
      context.dispose();
    },
  };
}
