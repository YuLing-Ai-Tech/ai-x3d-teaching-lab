import * as THREE from "three";
import type { MapLabelKind } from "../data/routePath";
import type { RegionBounds } from "./longMarchTerrain";

// 屏幕空间 HTML 标签：字是清晰的系统中文字体，并按优先级做简单避让。

export type LabelKind = MapLabelKind | "event" | "waypoint";

export interface LabelSpec {
  text: string;
  kind: LabelKind;
  position: THREE.Vector3;
  date?: string;
  nodeIndex?: number;
}

interface LabelEntry extends LabelSpec {
  element: HTMLElement;
  priority: number;
  size?: [number, number];
}

const PRIORITY: Record<LabelKind, number> = { event: 5, region: 4, river: 3, mountain: 3, waypoint: 2, city: 1 };

export interface LabelLayer {
  update: (camera: THREE.PerspectiveCamera, width: number, height: number) => void;
  setMode: (mode: "overview" | "focus", focusIndex?: number) => void;
  dispose: () => void;
}

export function createLabelLayer(stage: HTMLElement, specs: LabelSpec[], onEventClick: (index: number) => void): LabelLayer {
  const layer = document.createElement("div");
  layer.className = "lm-labels";
  stage.append(layer);
  let mode: "overview" | "focus" = "overview";
  let focus = -1;
  const entries: LabelEntry[] = specs.map((spec) => {
    const element = document.createElement(spec.kind === "event" ? "button" : "span");
    element.className = `lm-label lm-${spec.kind}`;
    if (spec.kind === "event") {
      element.innerHTML = `<i></i><b>${spec.text}</b>${spec.date ? `<small>${spec.date}</small>` : ""}`;
      element.addEventListener("click", () => onEventClick(spec.nodeIndex!));
    } else {
      element.textContent = spec.text;
    }
    layer.append(element);
    return { ...spec, element, priority: PRIORITY[spec.kind] };
  });
  const projected = new THREE.Vector3();
  // 界面浮层（标题、事件面板、工具栏、图例、小地图、时间轴）先占位，地图标签不压在它们下面
  const UI = ".story-heading, .event-peek, .map-toolbar, .weather-chip, .lm-legend, .lm-inset, .story-timeline";
  let uiRects: Array<[number, number, number, number]> = [];
  let uiFrame = 0;
  const update = (camera: THREE.PerspectiveCamera, width: number, height: number) => {
    if (uiFrame++ % 20 === 0) {
      const host = stage.getBoundingClientRect();
      uiRects = [...stage.querySelectorAll<HTMLElement>(UI)].filter((el) => el.offsetWidth).map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left - host.left, r.top - host.top, r.right - host.left, r.bottom - host.top];
      });
    }
    const placed: Array<[number, number, number, number]> = [...uiRects];
    const visible = entries
      .map((entry) => {
        projected.copy(entry.position).project(camera);
        const inView = projected.z < 1 && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
        const isFocus = entry.kind === "event" && entry.nodeIndex === focus;
        const allowed = mode === "overview" ? entry.kind !== "waypoint" : true;
        return { entry, x: (projected.x + 1) / 2 * width, y: (1 - projected.y) / 2 * height, inView: inView && allowed, isFocus };
      })
      .sort((a, b) => Number(b.isFocus) - Number(a.isFocus) || b.entry.priority - a.entry.priority);
    for (const item of visible) {
      const { element } = item.entry;
      if (!item.inView) {
        element.style.opacity = "0";
        continue;
      }
      // 尺寸只量一次（文字不变），避免每帧强制重排。
      if (!item.entry.size?.[0]) item.entry.size = [element.offsetWidth, element.offsetHeight];
      const [w, h] = item.entry.size[0] ? item.entry.size : [60, 18];
      const rect: [number, number, number, number] = [item.x - w / 2, item.y - h, item.x + w / 2, item.y];
      const overlaps = placed.some(([l, t, r, b]) => rect[0] < r + 4 && rect[2] > l - 4 && rect[1] < b + 2 && rect[3] > t - 2);
      const show = item.isFocus || !overlaps;
      element.style.opacity = show ? "1" : "0";
      element.style.transform = `translate(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px) translate(-50%, -100%)`;
      element.classList.toggle("is-focus", item.isFocus);
      element.classList.toggle("is-muted", mode === "focus" && item.entry.kind === "event" && !item.isFocus);
      if (show) placed.push(rect);
    }
  };
  return {
    update,
    setMode: (next, focusIndex = -1) => {
      mode = next;
      focus = focusIndex;
      stage.dataset.labelMode = next;
    },
    dispose: () => layer.remove(),
  };
}

interface Outline { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }>; }

/** 右下角附图：南海诸岛（含断续线）。主沙盘只到北纬 17°，按标准地图惯例用附图表示南海。 */
export async function createInsetMap(stage: HTMLElement, _region: RegionBounds, _route: Array<[number, number]>): Promise<() => void> {
  void _region; void _route;
  const [outlineResponse, dashResponse] = await Promise.all([fetch("./data/china-outline.json"), fetch("./data/china-nine-dash.json")]);
  if (!outlineResponse.ok || !dashResponse.ok) return () => undefined;
  const outline = await outlineResponse.json() as Outline;
  const dashes = await dashResponse.json() as Outline;
  const box = { west: 106, east: 123, south: 3, north: 25 };
  const width = 128;
  const height = Math.round(width * (box.north - box.south) / ((box.east - box.west) * .95));
  const px = (lon: number, lat: number) => `${((lon - box.west) / (box.east - box.west) * width).toFixed(1)},${((box.north - lat) / (box.north - box.south) * height).toFixed(1)}`;
  const paths = (collection: Outline, close: boolean) => collection.features.flatMap((feature) => {
    const polygons = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as number[][][][];
    return polygons.map((rings) => `M${rings[0].map(([lon, lat]) => px(lon, lat)).join("L")}${close ? "Z" : ""}`);
  }).join("");
  const inset = document.createElement("figure");
  inset.className = "lm-inset";
  inset.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="附图：南海诸岛">
      <path d="${paths(outline, true)}" class="lm-inset-land"/>
      <path d="${paths(dashes, true)}" class="lm-inset-dash"/>
    </svg>
    <figcaption>南海诸岛</figcaption>`;
  stage.append(inset);
  return () => inset.remove();
}
