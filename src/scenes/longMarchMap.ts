import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { Deck, MapView } from "@deck.gl/core";
import mlcontour from "maplibre-contour";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { routeNodes } from "../data/route";
import { routePath } from "../data/routePath";
import { validateRoute } from "../domain/route";
import type { LongMarchScene } from "./longMarch";
import { mountLongMarch as mountThreeFallback } from "./longMarch";
import { createRainOverlay } from "./rainOverlay";

interface RoutePoint {
  index: number;
  title: string;
  position: [number, number];
}

interface RouteTrip {
  path: Array<[number, number]>;
  timestamps: number[];
}

interface FlowPoint {
  position: [number, number];
  strength: number;
}

const CHINA_BOUNDS: [[number, number], [number, number]] = [[73, 18], [135, 54]];
const CHINA_CORNERS: Array<[number, number]> = [
  [73, 18], [73, 54], [135, 18], [135, 54],
];
const routePoints: RoutePoint[] = routeNodes.map((node, index) => ({
  index,
  title: node.title.replace("飞夺", ""),
  position: [node.lon, node.lat],
}));
const routeTrip: RouteTrip = {
  path: routePath.map((point) => [point.lon, point.lat]),
  timestamps: routePath.map((_, index) => index / (routePath.length - 1) * 1000),
};
const routeCharacterSet = Array.from(new Set(routePoints.flatMap((point) => [...point.title])));

function flowPoints(currentTime: number): FlowPoint[] {
  return Array.from({ length: 9 }, (_, index) => {
    const time = (currentTime - index * 72 + 1000) % 1000;
    const scaled = time / 1000 * (routeTrip.path.length - 1);
    const segment = Math.min(routeTrip.path.length - 2, Math.floor(scaled));
    const mix = scaled - segment;
    const start = routeTrip.path[segment];
    const end = routeTrip.path[segment + 1];
    return {
      position: [start[0] + (end[0] - start[0]) * mix, start[1] + (end[1] - start[1]) * mix],
      strength: 1 - index / 11,
    };
  });
}

function assetBase(): string {
  return new URL(".", document.baseURI).href;
}

function routeGeoJson(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "中央红军长征路线（教学示意）" },
      geometry: { type: "LineString", coordinates: routeTrip.path },
    }],
  };
}

function waitForLoad(map: MapLibreMap): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("MapLibre load timeout")), 12_000);
    map.once("load", () => { window.clearTimeout(timeout); resolve(); });
    map.once("error", (event) => {
      if (!map.loaded()) {
        window.clearTimeout(timeout);
        reject(event.error ?? new Error("MapLibre failed to load"));
      }
    });
  });
}

function mapStyle(demUrl: string, outlineUrl: string): StyleSpecification {
  return {
    version: 8,
    name: "长征地形叙事",
    sources: {
      dem: { type: "raster-dem", tiles: [demUrl], tileSize: 256, minzoom: 0, maxzoom: 6, encoding: "terrarium" },
      china: { type: "geojson", data: outlineUrl },
      route: { type: "geojson", data: routeGeoJson() },
    },
    layers: [
      { id: "night", type: "background", paint: { "background-color": "#01080b" } },
      { id: "china-shadow", type: "fill", source: "china", paint: { "fill-color": "#153329", "fill-opacity": .96 } },
      {
        id: "terrain-shade", type: "hillshade", source: "dem",
        paint: {
          "hillshade-exaggeration": .88,
          "hillshade-shadow-color": "#020c0e",
          "hillshade-highlight-color": "#e7c98c",
          "hillshade-accent-color": "#226d70",
        },
      },
      { id: "china-halo", type: "line", source: "china", paint: { "line-color": "#56d5cf", "line-width": 8, "line-opacity": .14, "line-blur": 10 } },
      { id: "china-edge", type: "line", source: "china", paint: { "line-color": "#d8b573", "line-width": 1.4, "line-opacity": .9 } },
      { id: "route-underlay", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#351813", "line-width": 9, "line-opacity": .8, "line-blur": 2 } },
      { id: "route-core", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ff5e47", "line-width": 3.4, "line-opacity": .96 } },
    ],
    terrain: { source: "dem", exaggeration: 1.8 },
  };
}

function buildLayers(currentTime: number, selected: number) {
  return [
    new TripsLayer<RouteTrip>({
      id: "long-march-flow",
      data: [routeTrip],
      getPath: (trip) => trip.path,
      getTimestamps: (trip) => trip.timestamps,
      getColor: [255, 202, 112],
      widthMinPixels: 6,
      widthMaxPixels: 11,
      trailLength: 280,
      currentTime,
      fadeTrail: true,
      capRounded: true,
      jointRounded: true,
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
    new ScatterplotLayer<FlowPoint>({
      id: "route-sparks",
      data: flowPoints(currentTime),
      getPosition: (point) => point.position,
      getRadius: (point) => 5 + point.strength * 5,
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      radiusMaxPixels: 11,
      getFillColor: (point) => [255, 224, 148, Math.round(120 + point.strength * 135)],
      getLineColor: [255, 255, 235, 255],
      lineWidthMinPixels: 1,
      stroked: true,
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
    new ScatterplotLayer<RoutePoint>({
      id: "event-rings",
      data: routePoints,
      getPosition: (point) => point.position,
      getRadius: (point) => point.index === selected ? 15_000 : 10_000,
      radiusMinPixels: 8,
      radiusMaxPixels: 24,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      getFillColor: (point) => point.index === selected ? [255, 94, 71, 240] : [255, 196, 105, 215],
      getLineColor: [255, 244, 206, 245],
      pickable: false,
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
    new TextLayer<RoutePoint>({
      id: "event-labels",
      data: routePoints.filter((point) => point.index === selected || point.index % 2 === 0),
      getPosition: (point) => point.position,
      getText: (point) => point.title,
      getColor: [255, 238, 198, 245],
      getSize: (point) => point.index === selected ? 16 : 12,
      sizeUnits: "pixels",
      getPixelOffset: [0, -19],
      fontFamily: "PingFang SC, Microsoft YaHei, sans-serif",
      fontWeight: 700,
      characterSet: routeCharacterSet,
      fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
      outlineWidth: 3,
      outlineColor: [3, 12, 14, 230],
      billboard: true,
      parameters: { depthWriteEnabled: false, depthCompare: "always" },
    }),
  ];
}

async function mountMapLibre(stage: HTMLElement, onNodeOpen: (index: number) => void): Promise<LongMarchScene> {
  validateRoute(routeNodes);
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const container = document.createElement("div");
  container.className = "maplibre-shell";
  stage.prepend(container);
  const base = assetBase();
  const demSource = new mlcontour.DemSource({
    id: `long-march-${Date.now()}`,
    url: `${base}terrain/{z}/{x}/{y}.png`,
    encoding: "terrarium",
    maxzoom: 6,
    worker: false,
    cacheSize: 160,
  });
  demSource.setupMaplibre(maplibregl);
  const map = new maplibregl.Map({
    container,
    style: mapStyle(demSource.sharedDemProtocolUrl, `${base}data/china-outline.json`),
    center: [104, 35],
    zoom: 3.05,
    pitch: 40,
    bearing: -6,
    minZoom: .5,
    maxZoom: 9,
    attributionControl: false,
    renderWorldCopies: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "DEM: Mapzen/AWS · 教学示意" }), "bottom-right");
  await waitForLoad(map);
  map.resize();

  map.addSource("contours", {
    type: "vector",
    tiles: [demSource.contourProtocolUrl({ thresholds: { 3: [500, 1000], 5: [250, 1000], 7: [100, 500] }, elevationKey: "ele", levelKey: "level" })],
    minzoom: 3,
    maxzoom: 7,
  });
  map.addLayer({
    id: "contour-lines", type: "line", source: "contours", "source-layer": "contours",
    paint: { "line-color": ["match", ["get", "level"], 1, "#e6c379", "#76aaa2"], "line-width": ["match", ["get", "level"], 1, 1.2, .55], "line-opacity": .42 },
  }, "route-underlay");

  let selected = 0;
  let currentTime = 80;
  let animationFrame = 0;
  const deckContainer = document.createElement("div");
  deckContainer.className = "deck-shell";
  stage.append(deckContainer);
  const deck = new Deck({
    parent: deckContainer,
    views: [new MapView({ id: "map", repeat: false })],
    controller: false,
    width: stage.clientWidth,
    height: stage.clientHeight,
    layers: buildLayers(currentTime, selected),
  });
  const syncDeck = () => {
    const center = map.getCenter();
    deck.setProps({
      width: stage.clientWidth,
      height: stage.clientHeight,
      viewState: { map: { longitude: center.lng, latitude: center.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() } },
    });
  };
  map.on("render", syncDeck);
  syncDeck();
  const rain = createRainOverlay(stage);
  const animate = () => {
    currentTime = (currentTime + 1.65) % 1000;
    deck.setProps({ layers: buildLayers(currentTime, selected) });
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  const markContinentCoverage = () => {
    const margin = 6;
    const projected = CHINA_CORNERS.map((corner) => map.project(corner));
    const complete = projected.every(({ x, y }) => x >= margin && x <= stage.clientWidth - margin && y >= margin && y <= stage.clientHeight - margin);
    stage.dataset.continentCoverage = complete ? "complete" : "clipped";
    stage.dataset.continentFrame = projected.map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`).join(";");
    stage.dataset.cameraZoom = map.getZoom().toFixed(2);
  };
  const overview = (duration = 1800) => {
    selected = 0;
    stage.dataset.view = "overview";
    stage.dataset.continentCoverage = "pending";
    const compact = stage.clientWidth < 700;
    const padding = compact
      ? { top: 0, right: 0, bottom: 0, left: 0 }
      : { top: 110, right: 70, bottom: 125, left: Math.min(360, stage.clientWidth * .2) };
    const desktopScale = Math.min(stage.clientWidth / 1920, stage.clientHeight / 1016);
    const desktopZoom = Math.max(2.05, Math.min(3.1, 3.1 + Math.log2(desktopScale)));
    map.once("moveend", markContinentCoverage);
    map.easeTo({
      center: [104, 34],
      zoom: compact ? 1.45 : desktopZoom,
      pitch: compact ? 0 : 34,
      bearing: compact ? -3 : -6,
      padding,
      duration,
      essential: true,
    });
  };
  const selectNode = (index: number) => {
    selected = Math.max(0, Math.min(routeNodes.length - 1, index));
    const node = routeNodes[selected];
    currentTime = (selected / (routeNodes.length - 1) * 1000 + 120) % 1000;
    map.flyTo({ center: [node.lon, node.lat], zoom: stage.clientWidth < 700 ? 5.3 : 6.15, pitch: 66, bearing: selected % 2 ? 20 : -24, duration: 1700, essential: true });
    stage.dataset.view = "event";
  };
  const setDimension = (dimension: "2d" | "3d") => {
    stage.dataset.dimension = dimension;
    if (dimension === "2d") map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
    else overview();
  };
  const nearestNode = (x: number, y: number) => routePoints
    .map((point) => ({ point, screen: map.project(point.position) }))
    .map(({ point, screen }) => ({ point, distance: Math.hypot(screen.x - x, screen.y - y) }))
    .sort((left, right) => left.distance - right.distance)[0];
  map.on("mousemove", (event) => {
    map.getCanvas().style.cursor = nearestNode(event.point.x, event.point.y).distance < 24 ? "pointer" : "grab";
  });
  map.on("click", (event) => {
    const nearest = nearestNode(event.point.x, event.point.y);
    if (nearest.distance < 24) onNodeOpen(nearest.point.index);
  });

  stage.dataset.engine = "maplibre-deck";
  stage.dataset.terrain = "dem-relief";
  stage.dataset.terrainRenderer = "raster-dem";
  stage.dataset.terrainFinish = "smooth-detail";
  stage.dataset.edgeContrast = "high";
  stage.dataset.routeFlow = "trips-layer";
  stage.dataset.dimension = "3d";
  overview();
  let resizeTimer = 0;
  const handleResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      map.resize();
      if (stage.dataset.view === "overview") overview(0);
      else syncDeck();
    }, 120);
  };
  window.addEventListener("resize", handleResize);
  return {
    selectNode,
    overview,
    setRain: rain.setEnabled,
    setDimension,
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      rain.dispose();
      map.off("render", syncDeck);
      deck.finalize();
      deckContainer.remove();
      map.remove();
      container.remove();
    },
  };
}

export async function mountLongMarchEnhanced(stage: HTMLElement, onNodeOpen: (index: number) => void): Promise<LongMarchScene> {
  try {
    return await mountThreeFallback(stage, onNodeOpen);
  } catch (error) {
    console.warn("Three.js cutout terrain unavailable; using the offline MapLibre fallback.", error);
    stage.querySelector("canvas")?.remove();
    return mountMapLibre(stage, onNodeOpen);
  }
}
