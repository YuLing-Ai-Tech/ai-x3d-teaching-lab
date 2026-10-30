import type { RouteNode } from "../types";

type RoutePoint = Pick<RouteNode, "lon" | "lat"> & { segment: number };

export function validateRoute(nodes: Array<Pick<RouteNode, "id" | "title" | "date" | "lon" | "lat" | "sourceIds">>): void {
  if (nodes.length < 2) throw new Error("路线至少需要两个节点");
  const ids = new Set<string>();
  let lastTime = Number.NEGATIVE_INFINITY;
  nodes.forEach((node) => {
    if (ids.has(node.id)) throw new Error(`节点重复：${node.id}`);
    ids.add(node.id);
    if (!node.sourceIds.length) throw new Error(`节点缺少来源：${node.id}`);
    if (node.lon < 70 || node.lon > 140 || node.lat < 15 || node.lat > 55) {
      throw new Error(`节点坐标超出中国区域：${node.id}`);
    }
    const time = Date.parse(node.date);
    if (!Number.isFinite(time) || time < lastTime) throw new Error(`节点日期无效或倒序：${node.id}`);
    lastTime = time;
  });
}

export function interpolateRoute(
  nodes: Array<Pick<RouteNode, "lon" | "lat">>,
  rawProgress: number,
): RoutePoint {
  if (nodes.length < 2) throw new Error("路线至少需要两个节点");
  const progress = Math.min(1, Math.max(0, rawProgress));
  const scaled = progress * (nodes.length - 1);
  const segment = Math.min(nodes.length - 2, Math.floor(scaled));
  const local = progress === 1 ? 1 : scaled - segment;
  const start = nodes[segment];
  const end = nodes[segment + 1];
  return {
    lon: start.lon + (end.lon - start.lon) * local,
    lat: start.lat + (end.lat - start.lat) * local,
    segment,
  };
}

export function projectRoutePoint(lon: number, lat: number): { x: number; z: number } {
  const minLon = 96;
  const maxLon = 116;
  const minLat = 23;
  const maxLat = 36.5;
  return {
    x: ((lon - minLon) / (maxLon - minLon) - 0.5) * 24,
    z: -(((lat - minLat) / (maxLat - minLat) - 0.5) * 16),
  };
}
