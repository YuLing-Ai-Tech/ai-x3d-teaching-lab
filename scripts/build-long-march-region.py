#!/usr/bin/env python3
"""Bake an offline relief: heightmap, shaded relief texture and drainage network.

Usage:  python scripts/build-long-march-region.py [long-march|china]
  long-march  长征区域沙盘（默认）→ public/data/long-march/
  china       全国地形（旧，10 km）→ public/data/china-relief/
  china-hd    全国地形（5 km，按国界切出沙盘形状，长征页与地理页共用）→ public/data/china-hd/

Rivers are derived from the DEM itself (priority-flood + D8 flow accumulation), so the
course needs no external river dataset and the water follows the same terrain students see.
Outputs go to public/data/long-march/ and are loaded by src/scenes/longMarch.ts.
"""

from __future__ import annotations

import heapq
import io
import sys
import time
import json
import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CONFIGS = {
    "long-march": dict(zoom=7, step=0.0125, hydro={"west": 89.0, "east": 122.0, "south": 21.0, "north": 40.0},
                       region={"west": 99.5, "east": 119.5, "south": 23.0, "north": 38.5}, out="long-march", river_min=3.15),
    "china": dict(zoom=6, step=0.05, hydro={"west": 70.0, "east": 138.0, "south": 15.0, "north": 56.0},
                  region={"west": 73.0, "east": 135.0, "south": 17.0, "north": 54.0}, out="china-relief", river_min=3.9),
    "china-hd": dict(zoom=7, step=0.025, hydro={"west": 70.0, "east": 138.0, "south": 15.0, "north": 56.0},
                     region={"west": 73.0, "east": 135.0, "south": 17.0, "north": 54.0}, out="china-hd", river_min=3.5, mask=True),
}
CONFIG = CONFIGS[sys.argv[1] if len(sys.argv) > 1 else "long-march"]
ZOOM = CONFIG["zoom"]
STEP = CONFIG["step"]  # degrees per hydrology cell
HYDRO = CONFIG["hydro"]
REGION = CONFIG["region"]
HEIGHT_STRIDE = 2  # heightmap is half the hydrology resolution
TEXTURE_SCALE = 2  # relief texture is twice the hydrology resolution
URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"

PROJECT = Path(__file__).resolve().parents[1]
CACHE = PROJECT / ".cache" / f"terrain-z{ZOOM}"
OUTPUT = PROJECT / "public" / "data" / CONFIG["out"]


def tile_coords(lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    scale = 2**ZOOM
    x = (lon + 180.0) / 360.0 * scale
    y = (1.0 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2.0 * scale
    return x, y


def load_tile(x: int, y: int) -> np.ndarray:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{ZOOM}-{x}-{y}.png"
    if not path.exists():
        request = urllib.request.Request(URL.format(z=ZOOM, x=x, y=y), headers={"User-Agent": "ai3d-course-builder/1.0"})
        for attempt in range(6):  # 网络抖动时重试；写临时文件再改名，避免留下半截瓦片
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    data = response.read()
                partial = path.with_suffix(".part")
                partial.write_bytes(data)
                partial.rename(path)
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(3 * (attempt + 1))
    rgb = np.asarray(Image.open(io.BytesIO(path.read_bytes())).convert("RGB"), dtype=np.float64)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def sample_dem(bounds: dict[str, float], step: float) -> np.ndarray:
    lons = np.arange(bounds["west"], bounds["east"] + 1e-9, step)
    lats = np.arange(bounds["north"], bounds["south"] - 1e-9, -step)
    lon, lat = np.meshgrid(lons, lats)
    tx, ty = tile_coords(lon, lat)
    out = np.zeros(lon.shape)
    xs, ys = np.floor(tx).astype(int), np.floor(ty).astype(int)
    for x in np.unique(xs):
        for y in np.unique(ys[xs == x]):
            mask = (xs == x) & (ys == y)
            tile = load_tile(int(x), int(y))
            px = np.clip((tx[mask] - x) * 256 - .5, 0, 254.999)
            py = np.clip((ty[mask] - y) * 256 - .5, 0, 254.999)
            x0, y0 = px.astype(int), py.astype(int)
            fx, fy = px - x0, py - y0
            out[mask] = (tile[y0, x0] * (1 - fx) * (1 - fy) + tile[y0, x0 + 1] * fx * (1 - fy)
                         + tile[y0 + 1, x0] * (1 - fx) * fy + tile[y0 + 1, x0 + 1] * fx * fy)
    return np.maximum(out, 0)


def flow_accumulation(dem: np.ndarray) -> np.ndarray:
    """Least-cost flood from the domain edge; each cell drains to the cell that discovered it.

    Keying the heap by the *original* elevation (not the filled level) makes the traversal carve
    through narrow gorges (e.g. the Three Gorges) instead of flooding whole basins into flat lakes.
    """
    h, w = dem.shape
    flat = dem.ravel()
    n = flat.size
    parent = np.full(n, -1, dtype=np.int64)
    seen = np.zeros(n, dtype=bool)
    order = np.empty(n, dtype=np.int64)
    heap: list[tuple[float, int, int]] = []
    edge = np.zeros((h, w), dtype=bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    for index in np.flatnonzero(edge.ravel()):
        seen[index] = True
        heap.append((float(flat[index]), 0, int(index)))
    heapq.heapify(heap)
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    count = 0
    while heap:
        _, _, index = heapq.heappop(heap)
        order[count] = index
        count += 1
        row, column = divmod(index, w)
        for dr, dc in offsets:
            r, c = row + dr, column + dc
            if 0 <= r < h and 0 <= c < w:
                neighbour = r * w + c
                if not seen[neighbour]:
                    seen[neighbour] = True
                    parent[neighbour] = index
                    heapq.heappush(heap, (float(flat[neighbour]), count, neighbour))
    accumulation = np.ones(n, dtype=np.float64)
    for index in order[::-1]:
        downstream = parent[index]
        if downstream >= 0:
            accumulation[downstream] += accumulation[index]
    return accumulation.reshape(h, w)


def crop(grid: np.ndarray, bounds: dict[str, float]) -> np.ndarray:
    c0 = round((bounds["west"] - HYDRO["west"]) / STEP)
    c1 = round((bounds["east"] - HYDRO["west"]) / STEP) + 1
    r0 = round((HYDRO["north"] - bounds["north"]) / STEP)
    r1 = round((HYDRO["north"] - bounds["south"]) / STEP) + 1
    return grid[r0:r1, c0:c1]


def resize(grid: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    image = Image.fromarray(grid.astype(np.float32), mode="F")
    return np.asarray(image.resize((shape[1], shape[0]), Image.BICUBIC), dtype=np.float64)


# 写实配色：湿润（东南）与干旱（西北）两套海拔色带，按约 400 mm 等降水量线过渡；只有高山顶才有雪
HUMID = [(0, (40, 70, 46)), (300, (52, 84, 52)), (900, (62, 90, 56)), (1600, (82, 94, 62)), (2600, (100, 96, 72)),
         (3600, (118, 104, 82)), (4600, (132, 114, 90)), (5300, (140, 122, 98)), (5900, (178, 172, 164)), (6600, (238, 240, 242))]
ARID = [(0, (174, 152, 114)), (900, (184, 160, 120)), (1500, (170, 146, 110)), (2600, (148, 124, 96)),
        (3600, (140, 118, 92)), (4600, (138, 118, 92)), (5300, (142, 124, 100)), (5900, (178, 172, 164)), (6600, (238, 240, 242))]
# 约 400 mm 等降水量线（大兴安岭—张家口—兰州—拉萨东侧），东南为湿润
ISOHYET = [(124.0, 53.0), (120.0, 47.0), (115.5, 41.5), (110.0, 38.5), (104.0, 36.0), (100.0, 33.5), (94.0, 30.5), (86.0, 28.0)]


def ramp(elevation: np.ndarray, stops) -> np.ndarray:
    levels = np.array([s[0] for s in stops], dtype=np.float64)
    colors = np.array([s[1] for s in stops], dtype=np.float64)
    return np.stack([np.interp(elevation, levels, colors[:, channel]) for channel in range(3)], axis=-1)


def humidity(shape: tuple[int, int]) -> np.ndarray:
    """0 = 干旱，1 = 湿润：到等降水量线的有符号距离（度），平滑过渡约 ±3°。"""
    h, w = shape
    lon = np.linspace(REGION["west"], REGION["east"], w)[None, :].repeat(h, 0)
    lat = np.linspace(REGION["north"], REGION["south"], h)[:, None].repeat(w, 1)
    xs = np.array([p[1] for p in ISOHYET[::-1]])
    ys = np.array([p[0] for p in ISOHYET[::-1]])
    line_lon = np.interp(lat, xs, ys)  # 每个纬度上，等降水量线所在的经度
    signed = (lon - line_lon) * np.cos(np.radians(lat))  # 东侧为正
    signed = signed - np.clip(lat - 44, 0, None) * .35  # 东北高纬地区偏干冷的草原过渡
    return np.clip(.5 + signed / 6.0, 0, 1)


def hypsometric(elevation: np.ndarray) -> np.ndarray:
    wet = humidity(elevation.shape)[..., None]
    return ramp(elevation, ARID) * (1 - wet) + ramp(elevation, HUMID) * wet


def hillshade(elevation: np.ndarray, cell_m: tuple[float, float], exaggeration: float) -> np.ndarray:
    gy, gx = np.gradient(elevation * exaggeration, cell_m[1], cell_m[0])
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    total = np.zeros_like(elevation)
    for azimuth, altitude, weight in [(315, 42, .55), (270, 50, .2), (350, 55, .25)]:
        az, alt = math.radians(azimuth), math.radians(altitude)
        total += weight * (np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect))
    return np.clip(total, 0, 1)


def china_mask(shape: tuple[int, int]) -> np.ndarray:
    outline = json.loads((PROJECT / "public" / "data" / "china-outline.json").read_text())
    return rasterise(outline, shape)


def rasterise(outline: dict, shape: tuple[int, int], blur: float = 1.2) -> np.ndarray:
    h, w = shape
    image = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(image)
    to_px = lambda lon, lat: ((lon - REGION["west"]) / (REGION["east"] - REGION["west"]) * (w - 1),
                              (REGION["north"] - lat) / (REGION["north"] - REGION["south"]) * (h - 1))
    for feature in outline["features"]:
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for rings in polygons:
            draw.polygon([to_px(*p) for p in rings[0]], fill=255)
            for hole in rings[1:]:
                draw.polygon([to_px(*p) for p in hole], fill=0)
    return np.asarray(image.filter(ImageFilter.GaussianBlur(blur)) if blur else image, dtype=np.float64) / 255


def encode_terrarium(elevation: np.ndarray) -> Image.Image:
    value = np.clip(elevation, 0, 9000) + 32768
    red = np.floor(value / 256)
    green = np.floor(value - red * 256)
    blue = np.floor((value - red * 256 - green) * 256)
    return Image.fromarray(np.stack([red, green, blue], axis=-1).astype(np.uint8), mode="RGB")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    print("sampling DEM …")
    dem = sample_dem(HYDRO, STEP)
    print("dem", dem.shape, "flow accumulation …")
    accumulation = flow_accumulation(np.round(dem))
    region_dem = crop(dem, REGION)
    region_acc = crop(accumulation, REGION)
    h, w = region_dem.shape
    print("region", region_dem.shape)

    height = region_dem[::HEIGHT_STRIDE, ::HEIGHT_STRIDE]
    encode_terrarium(height).save(OUTPUT / "height.png", optimize=True)

    th, tw = h * TEXTURE_SCALE, w * TEXTURE_SCALE
    fine = resize(region_dem, (th, tw))
    mid_lat = math.radians((REGION["north"] + REGION["south"]) / 2)
    cell = STEP / TEXTURE_SCALE * 111_320
    shade = hillshade(fine, (cell * math.cos(mid_lat), cell), 2.2)
    color = hypsometric(fine)
    # 凹处压暗（与模糊高程的差），让山脊和沟谷更锐利
    relief = fine - resize(resize(fine, (th // 8, tw // 8)), (th, tw))
    cavity = np.clip(.5 + relief / 900, .2, 1.0)
    lit = color * (.34 + .86 * shade[..., None]) * (.82 + .18 * cavity[..., None])

    # Drainage: upstream area in km², drawn wider and brighter for larger rivers.
    area = resize(region_acc, (th, tw)) * (STEP * 111.32) ** 2 * math.cos(mid_lat)
    strength = np.clip((np.log10(np.maximum(area, 1)) - CONFIG["river_min"]) / 2.2, 0, 1)
    strength[fine < 2] = 0  # sea
    # 河流：单像素细线、低饱和；近景不再出现发亮的宽带
    core = np.asarray(Image.fromarray((strength * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.45)), dtype=np.float64) / 255
    alpha = np.clip(core * (.55 + .4 * strength), 0, .7)[..., None]
    lit = lit * (1 - alpha) + np.array([58, 104, 118]) * alpha

    inside = china_mask((th, tw))
    if CONFIG.get("mask"):
        # 国界掩膜（DataV，按我国标准画法）：页面用它把沙盘切成中国的形状
        datav = json.loads((PROJECT / ".cache" / "datav" / "china.json").read_text())
        inside = rasterise(datav, (th, tw), blur=0)
        Image.fromarray((inside * 255).astype(np.uint8), mode="L").save(OUTPUT / "mask.png", optimize=True)
    outside = lit * .34 + np.array([6, 16, 20]) * .66
    lit = lit * inside[..., None] + outside * (1 - inside[..., None])
    edge = np.clip(np.abs(np.gradient(inside)[0]) + np.abs(np.gradient(inside)[1]), 0, 1) * 3.2
    edge = np.clip(edge, 0, 1)[..., None]
    lit = lit * (1 - edge) + np.array([238, 196, 128]) * edge

    Image.fromarray(np.clip(lit, 0, 255).astype(np.uint8)).save(OUTPUT / "relief.jpg", quality=86, optimize=True, progressive=True)

    # River raster at hydrology resolution for route/landmark sanity checks (not shipped to the page).
    np.save(PROJECT / ".cache" / f"{CONFIG['out']}-river-area.npy", (region_acc * (STEP * 111.32) ** 2 * math.cos(mid_lat)).astype(np.float32))

    meta = {
        "bounds": REGION,
        "heightSize": [height.shape[1], height.shape[0]],
        "textureSize": [tw, th],
        "elevation": {"min": float(height.min()), "max": float(height.max())},
        "source": f"Terrarium DEM (Mapzen/AWS Open Data) z{ZOOM}; drainage derived from the DEM",
    }
    (OUTPUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
