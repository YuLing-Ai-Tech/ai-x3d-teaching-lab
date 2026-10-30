import * as THREE from "three";

// 区域高程沙盘：数据由 scripts/build-long-march-region.py 离线烘焙到 public/data/long-march/。

export interface RegionBounds { west: number; east: number; south: number; north: number; }

interface RegionMeta {
  bounds: RegionBounds;
  heightSize: [number, number];
  elevation: { min: number; max: number };
}

export interface ReliefTerrain {
  group: THREE.Group;
  bounds: RegionBounds;
  width: number;
  depth: number;
  /** 经纬度 → 场景坐标，y 贴合地表再抬高 lift */
  project: (lon: number, lat: number, lift?: number) => THREE.Vector3;
  /** 海拔（米） */
  elevationAt: (lon: number, lat: number) => number;
  /** 海拔（米）→ 场景高度 */
  metresToY: (metres: number) => number;
  setCutaway: (visible: boolean) => void;
  /** 国界掩膜（按国界切形状时才有），可给覆盖在沙盘上的面复用 */
  mask?: THREE.Texture;
}

export const VERTICAL_EXAGGERATION = 9;
const BASE_Y = -.42;
type Strata = Array<[number, number]>;
/** 薄底座：暗色侧壁（地理页，垂直夸张大，侧壁要低调） */
const THIN_STRATA: Strata = [[0, 0x5a3a26], [BASE_Y, 0x0c0907]];
/** 厚沙盘：从地表到底座的分层颜色（亮土 → 深岩），让侧面和深色背景拉开层次（长征页） */
const THICK_STRATA: Strata = [[0, 0xb08a5e], [-.05, 0x9a7048], [-.38, 0x7c5636], [-.4, 0xa07a50], [-.82, 0x5e4130], [-.84, 0x86643f], [-1.3, 0x3c2c22], [-1.6, 0x241a14]];

async function loadHeights(url: string, size: [number, number]): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Relief heightmap unavailable: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, size[0], size[1]).data;
  const heights = new Float32Array(size[0] * size[1]);
  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    heights[index] = pixels[offset] * 256 + pixels[offset + 1] + pixels[offset + 2] / 256 - 32768;
  }
  return heights;
}

function wallGeometry(top: THREE.Vector3[], strata: Strata): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rows = strata.length;
  const color = new THREE.Color();
  top.forEach((point, index) => {
    strata.forEach(([level, hex], row) => {
      // 第一行贴着国界地表；其余各行是固定深度的地层分界
      positions.push(point.x, row === 0 ? point.y : Math.min(level, point.y - .02), point.z);
      color.setHex(hex);
      colors.push(color.r, color.g, color.b);
    });
    if (index < top.length - 1) {
      for (let row = 0; row < rows - 1; row += 1) {
        const a = index * rows + row;
        const b = a + rows;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Outline { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }

const ringArea = (ring: number[][]) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

export async function loadReliefTerrain(options: {
  stride: number; anisotropy: number; base?: string; exaggeration?: number;
  /** 场景里沙盘的宽度（世界单位），默认 24 */
  worldWidth?: number;
  /** thick：厚沙盘 + 地层侧壁；默认 thin */
  slab?: "thick" | "thin";
  /** 国界轮廓（GeoJSON）：提供时沙盘按国界切出形状（需配套 mask.png），否则是矩形沙盘 */
  outline?: string;
}): Promise<ReliefTerrain> {
  const WORLD_WIDTH = options.worldWidth ?? 24;
  const base = options.base ?? "./data/long-march/";
  const exaggeration = options.exaggeration ?? VERTICAL_EXAGGERATION;
  const metaResponse = await fetch(`${base}meta.json`);
  if (!metaResponse.ok) throw new Error("Relief metadata unavailable");
  const meta = await metaResponse.json() as RegionMeta;
  const [gridWidth, gridHeight] = meta.heightSize;
  const [heights, texture, mask, outline] = await Promise.all([
    loadHeights(`${base}height.png`, meta.heightSize),
    new THREE.TextureLoader().loadAsync(`${base}relief.jpg`),
    options.outline ? new THREE.TextureLoader().loadAsync(`${base}mask.png`) : Promise.resolve(null),
    options.outline ? fetch(options.outline).then((response) => response.json() as Promise<Outline>) : Promise.resolve(null),
  ]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = options.anisotropy;

  const { bounds } = meta;
  const cosMid = Math.cos(THREE.MathUtils.degToRad((bounds.north + bounds.south) / 2));
  const unitsPerDegree = WORLD_WIDTH / ((bounds.east - bounds.west) * cosMid);
  const depth = (bounds.north - bounds.south) * unitsPerDegree;
  const unitsPerMetre = unitsPerDegree / 111_320 * exaggeration;

  const elevationAt = (lon: number, lat: number) => {
    const x = THREE.MathUtils.clamp((lon - bounds.west) / (bounds.east - bounds.west) * (gridWidth - 1), 0, gridWidth - 1);
    const y = THREE.MathUtils.clamp((bounds.north - lat) / (bounds.north - bounds.south) * (gridHeight - 1), 0, gridHeight - 1);
    const left = Math.floor(x);
    const top = Math.floor(y);
    const right = Math.min(gridWidth - 1, left + 1);
    const bottom = Math.min(gridHeight - 1, top + 1);
    const fx = x - left;
    const fy = y - top;
    const upper = heights[top * gridWidth + left] * (1 - fx) + heights[top * gridWidth + right] * fx;
    const lower = heights[bottom * gridWidth + left] * (1 - fx) + heights[bottom * gridWidth + right] * fx;
    return upper * (1 - fy) + lower * fy;
  };
  const project = (lon: number, lat: number, lift = 0) => new THREE.Vector3(
    (lon - bounds.west) * cosMid * unitsPerDegree - WORLD_WIDTH / 2,
    elevationAt(lon, lat) * unitsPerMetre + lift,
    depth / 2 - (lat - bounds.south) * unitsPerDegree,
  );

  const stride = Math.max(1, options.stride);
  const columns = Math.floor((gridWidth - 1) / stride) + 1;
  const rows = Math.floor((gridHeight - 1) / stride) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const gx = column * stride;
      const gy = row * stride;
      const index = row * columns + column;
      positions[index * 3] = gx / (gridWidth - 1) * WORLD_WIDTH - WORLD_WIDTH / 2;
      positions[index * 3 + 1] = heights[gy * gridWidth + gx] * unitsPerMetre;
      positions[index * 3 + 2] = gy / (gridHeight - 1) * depth - depth / 2;
      uvs[index * 2] = gx / (gridWidth - 1);
      uvs[index * 2 + 1] = 1 - gy / (gridHeight - 1);
    }
  }
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + columns;
      indices.set([a, b, a + 1, a + 1, b, b + 1], cursor);
      cursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const group = new THREE.Group();
  // 有国界掩膜时：逐像素裁掉国界外的地形（alphaTest），边缘与轮廓线严格重合、没有锯齿台阶
  const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: .96, metalness: 0, alphaMap: mask ?? undefined, alphaTest: mask ? .5 : 0 }));
  surface.receiveShadow = true;
  surface.userData.layer = "surface";
  group.add(surface);

  if (outline) {
    addOutlineCutaway(group, outline, project, options.slab === "thick" ? THICK_STRATA : THIN_STRATA);
    return {
      group, bounds, width: WORLD_WIDTH, depth, project, elevationAt, mask: mask ?? undefined,
      metresToY: (metres) => metres * unitsPerMetre,
      setCutaway: (visible) => group.traverse((object) => {
        if (object.userData.layer === "cutaway") object.visible = visible;
      }),
    };
  }

  // 四周切面 + 底座：规则的矩形沙盘边，避免沿国界裁切产生的锯齿“冰柱”。
  const edge = (points: Array<[number, number]>) => points.map(([gx, gy]) => new THREE.Vector3(
    gx / (gridWidth - 1) * WORLD_WIDTH - WORLD_WIDTH / 2,
    heights[gy * gridWidth + gx] * unitsPerMetre,
    gy / (gridHeight - 1) * depth - depth / 2,
  ));
  const xs = Array.from({ length: gridWidth }, (_, index) => index);
  const ys = Array.from({ length: gridHeight }, (_, index) => index);
  const sides = [
    edge(xs.map((gx) => [gx, gridHeight - 1])),
    edge(ys.map((gy) => [gridWidth - 1, gridHeight - 1 - gy])),
    edge(xs.map((gx) => [gridWidth - 1 - gx, 0])),
    edge(ys.map((gy) => [0, gy])),
  ];
  const wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: .1, side: THREE.DoubleSide });
  for (const side of sides) {
    const wall = new THREE.Mesh(wallGeometry(side, THIN_STRATA), wallMaterial);
    wall.userData.layer = "cutaway";
    group.add(wall);
    const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(side.map((point) => point.clone().setY(point.y + .01))), new THREE.LineBasicMaterial({ color: 0xe9bf7a, transparent: true, opacity: .75 }));
    rim.userData.layer = "cutaway";
    group.add(rim);
    for (const level of [-.12, -.26]) {
      const stratum = new THREE.Line(new THREE.BufferGeometry().setFromPoints(side.map((point) => point.clone().setY(level))), new THREE.LineBasicMaterial({ color: 0xb87a45, transparent: true, opacity: .32 }));
      stratum.userData.layer = "cutaway";
      group.add(stratum);
    }
  }
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_WIDTH + .6, .16, depth + .6),
    new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: .5, metalness: .25 }),
  );
  plinth.position.y = BASE_Y - .08;
  plinth.receiveShadow = true;
  plinth.userData.layer = "cutaway";
  group.add(plinth);

  return {
    group,
    bounds,
    width: WORLD_WIDTH,
    depth,
    project,
    elevationAt,
    metresToY: (metres) => metres * unitsPerMetre,
    setCutaway: (visible) => group.traverse((object) => {
      if (object.userData.layer === "cutaway") object.visible = visible;
    }),
  };
}

/** 沿国界的切面墙 + 同形状的底座：大陆、台湾、海南等面积够大的岛屿各自成块 */
function addOutlineCutaway(group: THREE.Group, outline: Outline, project: (lon: number, lat: number, lift?: number) => THREE.Vector3, strata: Strata): void {
  const baseY = strata[strata.length - 1][0];
  const thick = strata === THICK_STRATA;
  const rings = outline.features.flatMap((feature) => {
    const polygons = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as number[][][][];
    return polygons.map((polygon) => polygon[0]);
  }).filter((ring) => ringArea(ring) > .02 && ring.some(([, lat]) => lat > 17));
  const wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: .1, side: THREE.DoubleSide });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: thick ? 0x2a1e16 : 0x15100c, roughness: thick ? .45 : .5, metalness: thick ? .35 : .25 });
  for (const ring of rings) {
    // 侧壁顶边做环形滑动平均：避免高山国界在大夸张倍数下出现尖刺
    const raw = ring.map(([lon, lat]) => project(lon, lat, -.004));
    const top = raw.map((point, index) => {
      let sum = 0;
      for (let k = -4; k <= 4; k += 1) sum += raw[(index + k + raw.length) % raw.length].y;
      return point.clone().setY(Math.min(point.y, sum / 9));
    });
    const wall = new THREE.Mesh(wallGeometry([...top, top[0]], strata), wallMaterial);
    wall.userData.layer = "cutaway";
    group.add(wall);
    const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(top.map((point) => point.clone().setY(point.y + .012))), new THREE.LineBasicMaterial({ color: 0xe9bf7a, transparent: true, opacity: .8 }));
    rim.userData.layer = "rim";
    group.add(rim);
    const shape = new THREE.Shape(top.map((point) => new THREE.Vector2(point.x, -point.z)));
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: false }), baseMaterial);
    base.rotation.x = -Math.PI / 2;
    base.position.y = baseY - .16;
    base.userData.layer = "cutaway";
    group.add(base);
    // 厚沙盘：底边金线勾出底部轮廓，让厚度一眼可见；薄底座：两条浅地层线
    const lines = thick ? [{ y: baseY - .16, color: 0xe9bf7a, opacity: .55 }] : [-.12, -.26].map((y) => ({ y, color: 0xb87a45, opacity: .32 }));
    for (const line of lines) {
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(top.map((point) => point.clone().setY(line.y))), new THREE.LineBasicMaterial({ color: line.color, transparent: true, opacity: line.opacity }));
      loop.userData.layer = "cutaway";
      group.add(loop);
    }
  }
}
