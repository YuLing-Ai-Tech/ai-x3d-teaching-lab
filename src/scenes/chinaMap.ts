import * as THREE from "three";
import { elevationToRelief, terrainColor } from "../domain/terrain";

export const CHINA_BOUNDS = { west: 73, east: 135, south: 18, north: 54 };
const MAP_WIDTH = 24;
const MAP_HEIGHT = 15;

type Ring = number[][];
interface GeoFeature { geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] }; }
interface GeoCollection { features: GeoFeature[]; }
interface TerrainGrid {
  width: number;
  height: number;
  values: number[];
  bounds: typeof CHINA_BOUNDS;
}

let activeTerrain: TerrainGrid | null = null;

export function projectChina(lon: number, lat: number): THREE.Vector3 {
  const x = ((lon - CHINA_BOUNDS.west) / (CHINA_BOUNDS.east - CHINA_BOUNDS.west) - .5) * MAP_WIDTH;
  const z = -((lat - CHINA_BOUNDS.south) / (CHINA_BOUNDS.north - CHINA_BOUNDS.south) - .5) * MAP_HEIGHT;
  const y = activeTerrain ? elevationToRelief(sampleTerrainSmoothed(activeTerrain, lon, lat)) : .78;
  return new THREE.Vector3(x, y, z);
}

function ringsFor(feature: GeoFeature): Ring[][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Ring[]]
    : feature.geometry.coordinates as Ring[][];
}

function sampleTerrain(grid: TerrainGrid, lon: number, lat: number): number {
  const x = Math.max(0, Math.min(grid.width - 1, (lon - grid.bounds.west) / (grid.bounds.east - grid.bounds.west) * (grid.width - 1)));
  const y = Math.max(0, Math.min(grid.height - 1, (grid.bounds.north - lat) / (grid.bounds.north - grid.bounds.south) * (grid.height - 1)));
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(grid.width - 1, left + 1);
  const bottom = Math.min(grid.height - 1, top + 1);
  const horizontal = x - left;
  const vertical = y - top;
  const upper = THREE.MathUtils.lerp(grid.values[top * grid.width + left], grid.values[top * grid.width + right], horizontal);
  const lower = THREE.MathUtils.lerp(grid.values[bottom * grid.width + left], grid.values[bottom * grid.width + right], horizontal);
  return THREE.MathUtils.lerp(upper, lower, vertical);
}

function sampleTerrainSmoothed(grid: TerrainGrid, lon: number, lat: number): number {
  const lonStep = (grid.bounds.east - grid.bounds.west) / Math.max(1, grid.width - 1);
  const latStep = (grid.bounds.north - grid.bounds.south) / Math.max(1, grid.height - 1);
  return (
    sampleTerrain(grid, lon, lat) * 4
    + sampleTerrain(grid, lon - lonStep, lat)
    + sampleTerrain(grid, lon + lonStep, lat)
    + sampleTerrain(grid, lon, lat - latStep)
    + sampleTerrain(grid, lon, lat + latStep)
  ) / 8;
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLon, currentLat] = ring[current];
    const [previousLon, previousLat] = ring[previous];
    if ((currentLat > lat) !== (previousLat > lat)
      && lon < (previousLon - currentLon) * (lat - currentLat) / (previousLat - currentLat) + currentLon) inside = !inside;
  }
  return inside;
}

function pointInCollection(lon: number, lat: number, collection: GeoCollection): boolean {
  return collection.features.some((feature) => ringsFor(feature).some((rings) =>
    pointInRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => pointInRing(lon, lat, hole))));
}

function reliefGeometry(collection: GeoCollection, grid: TerrainGrid): THREE.BufferGeometry {
  const meshWidth = 340;
  const meshHeight = 198;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < meshHeight; row += 1) {
    for (let column = 0; column < meshWidth; column += 1) {
      const u = column / (meshWidth - 1);
      const v = row / (meshHeight - 1);
      const lon = grid.bounds.west + u * (grid.bounds.east - grid.bounds.west);
      const lat = grid.bounds.north - v * (grid.bounds.north - grid.bounds.south);
      const x = (u - .5) * MAP_WIDTH;
      const z = -(lat - CHINA_BOUNDS.south) / (CHINA_BOUNDS.north - CHINA_BOUNDS.south) * MAP_HEIGHT + MAP_HEIGHT / 2;
      positions.push(x, elevationToRelief(sampleTerrainSmoothed(grid, lon, lat)), z);
      uvs.push(u, 1 - v);
    }
  }
  for (let row = 0; row < meshHeight - 1; row += 1) {
    for (let column = 0; column < meshWidth - 1; column += 1) {
      const lon = grid.bounds.west + (column + .5) / (meshWidth - 1) * (grid.bounds.east - grid.bounds.west);
      const lat = grid.bounds.north - (row + .5) / (meshHeight - 1) * (grid.bounds.north - grid.bounds.south);
      if (!pointInCollection(lon, lat, collection)) continue;
      const upperLeft = row * meshWidth + column;
      const lowerLeft = (row + 1) * meshWidth + column;
      indices.push(upperLeft, lowerLeft, upperLeft + 1, upperLeft + 1, lowerLeft, lowerLeft + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function reliefTexture(grid: TerrainGrid): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = grid.width * 6;
  canvas.height = grid.height * 6;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const lon = grid.bounds.west + x / (canvas.width - 1) * (grid.bounds.east - grid.bounds.west);
      const lat = grid.bounds.north - y / (canvas.height - 1) * (grid.bounds.north - grid.bounds.south);
      const elevation = sampleTerrainSmoothed(grid, lon, lat);
      const east = sampleTerrainSmoothed(grid, lon + .22, lat);
      const south = sampleTerrainSmoothed(grid, lon, lat - .22);
      const slopeLight = THREE.MathUtils.clamp(.94 + (elevation - east) * 1.45 + (elevation - south) * .9, .72, 1.14);
      const contourDistance = Math.abs((elevation * 20) % 1 - .5);
      const contour = contourDistance < .026 ? .86 : 1;
      const color = terrainColor(elevation).multiplyScalar(slopeLight * contour);
      const index = (y * canvas.width + x) * 4;
      pixels.data[index] = color.r * 255;
      pixels.data[index + 1] = color.g * 255;
      pixels.data[index + 2] = color.b * 255;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function shapeFromRings(rings: Ring[]): THREE.Shape | null {
  const outer = rings[0]?.map(([lon, lat]) => projectChina(lon, lat));
  if (!outer || outer.length < 3) return null;
  const shape = new THREE.Shape(outer.map((point) => new THREE.Vector2(point.x, -point.z)));
  for (const ring of rings.slice(1)) {
    if (ring.length < 3) continue;
    const hole = new THREE.Path(ring.map(([lon, lat]) => {
      const point = projectChina(lon, lat);
      return new THREE.Vector2(point.x, -point.z);
    }));
    shape.holes.push(hole);
  }
  return shape;
}

function sideWallGeometry(ring: Ring, baseY = -.93): THREE.BufferGeometry {
  const boundary = ring.length > 2 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : ring;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const upperColor = new THREE.Color(0x563524);
  const lowerColor = new THREE.Color(0x0b0807);
  boundary.forEach(([lon, lat]) => {
    const top = projectChina(lon, lat);
    positions.push(top.x, top.y, top.z, top.x, baseY, top.z);
    colors.push(upperColor.r, upperColor.g, upperColor.b, lowerColor.r, lowerColor.g, lowerColor.b);
  });
  for (let index = 0; index < boundary.length; index += 1) {
    const next = (index + 1) % boundary.length;
    const top = index * 2;
    const nextTop = next * 2;
    indices.push(top, top + 1, nextTop, nextTop, top + 1, nextTop + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function buildChinaTerrain(): Promise<THREE.Group> {
  const [outlineResponse, terrainResponse] = await Promise.all([
    fetch("./data/china-outline.json"),
    fetch("./data/china-terrain.json"),
  ]);
  if (!outlineResponse.ok || !terrainResponse.ok) throw new Error("China terrain data unavailable");
  const collection = await outlineResponse.json() as GeoCollection;
  activeTerrain = await terrainResponse.json() as TerrainGrid;
  const group = new THREE.Group();
  const relief = new THREE.Mesh(
    reliefGeometry(collection, activeTerrain),
    new THREE.MeshStandardMaterial({ map: reliefTexture(activeTerrain), roughness: .82, metalness: .015, emissive: 0x10241c, emissiveIntensity: .34 }),
  );
  relief.castShadow = true;
  relief.receiveShadow = true;
  relief.userData.layer = "surface";
  group.add(relief);
  for (const feature of collection.features) {
    for (const rings of ringsFor(feature)) {
      const shape = shapeFromRings(rings);
      if (!shape) continue;
      const sideWall = new THREE.Mesh(
        sideWallGeometry(rings[0]),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: .16, emissive: 0x160805, emissiveIntensity: .22 }),
      );
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      sideWall.userData.layer = "cutaway";
      group.add(sideWall);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.03, bevelEnabled: true, bevelSize: .035, bevelThickness: .04, bevelSegments: 2 });
      const foundation = new THREE.Mesh(geometry, [
        new THREE.MeshStandardMaterial({ color: 0x183c35, roughness: .68, metalness: .08 }),
        new THREE.MeshStandardMaterial({ color: 0x342018, roughness: .76, metalness: .06, emissive: 0x0d0705, emissiveIntensity: .15 }),
      ]);
      foundation.rotation.x = -Math.PI / 2;
      foundation.position.y = -.90;
      foundation.castShadow = true;
      foundation.receiveShadow = true;
      foundation.userData.layer = "cutaway";
      group.add(foundation);
      const rimPoints = rings[0].map(([lon, lat]) => projectChina(lon, lat).add(new THREE.Vector3(0, .025, 0)));
      const rim = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(rimPoints),
        new THREE.LineBasicMaterial({ color: 0xf0bd73, transparent: true, opacity: .9 }),
      );
      rim.userData.layer = "rim";
      group.add(rim);
      for (const level of [-.08, -.30, -.52, -.74]) {
        const stratum = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(rings[0].map(([lon, lat]) => projectChina(lon, lat).setY(level))),
          new THREE.LineBasicMaterial({ color: level > -.5 ? 0xe0a05b : 0x724225, transparent: true, opacity: .54 }),
        );
        stratum.userData.layer = "cutaway";
        group.add(stratum);
      }
    }
  }
  return group;
}

export function createRain(count = 900): { points: THREE.LineSegments; update: (delta: number) => void } {
  const positions = new Float32Array(count * 6);
  for (let index = 0; index < count; index += 1) {
    const x = (Math.random() - .5) * 29;
    const y = Math.random() * 15 + 1;
    const z = (Math.random() - .5) * 20;
    positions.set([x, y, z, x + .08, y - .42, z + .03], index * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xa9d8ff, transparent: true, opacity: .32, depthWrite: false });
  const points = new THREE.LineSegments(geometry, material);
  const update = (delta: number) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < count; index += 1) {
      const first = index * 2;
      const second = first + 1;
      let y = attribute.getY(first) - delta * (8 + (index % 7));
      if (y < -.1) y = 14 + (index % 11) * .15;
      let x = attribute.getX(first) + delta * .28;
      if (x > 15) x = -15;
      const z = attribute.getZ(first) + delta * .08;
      attribute.setXYZ(first, x, y, z);
      attribute.setXYZ(second, x + .08, y - .42, z + .03);
    }
    attribute.needsUpdate = true;
  };
  return { points, update };
}

export function textSprite(text: string, color = "#f8e5b6"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.font = "600 34px PingFang SC, sans-serif";
  context.textAlign = "center";
  context.shadowColor = "rgba(0,0,0,.95)";
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillText(text, 160, 58);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.35, .4, 1);
  return sprite;
}
