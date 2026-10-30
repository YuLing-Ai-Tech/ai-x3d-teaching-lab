#!/usr/bin/env python3
"""Build a compact offline elevation grid from public Terrarium tiles."""

from __future__ import annotations

import io
import json
import math
import urllib.request
from pathlib import Path

from PIL import Image

ZOOM = 6
WIDTH = 176
HEIGHT = 104
BOUNDS = {"west": 73.0, "east": 135.0, "south": 18.0, "north": 54.0}
URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"


def lon_lat_to_tile(lon: float, lat: float) -> tuple[float, float]:
    scale = 2**ZOOM
    x = (lon + 180.0) / 360.0 * scale
    lat_radians = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_radians)) / math.pi) / 2.0 * scale
    return x, y


def download_tile(x: int, y: int, cache: Path) -> Image.Image:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{ZOOM}-{x}-{y}.png"
    if not path.exists():
        request = urllib.request.Request(URL.format(z=ZOOM, x=x, y=y), headers={"User-Agent": "ai3d-course-builder/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            path.write_bytes(response.read())
    return Image.open(io.BytesIO(path.read_bytes())).convert("RGB")


def sample_elevation(lon: float, lat: float, cache: Path, tiles: dict[tuple[int, int], Image.Image]) -> float:
    tile_x, tile_y = lon_lat_to_tile(lon, lat)
    x_index, y_index = math.floor(tile_x), math.floor(tile_y)
    key = (x_index, y_index)
    if key not in tiles:
        tiles[key] = download_tile(x_index, y_index, cache)
    pixel_x = min(255, max(0, int((tile_x - x_index) * 256)))
    pixel_y = min(255, max(0, int((tile_y - y_index) * 256)))
    red, green, blue = tiles[key].getpixel((pixel_x, pixel_y))
    return red * 256 + green + blue / 256 - 32768


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    output = project / "public" / "data" / "china-terrain.json"
    cache = project / ".cache" / "terrain"
    tiles: dict[tuple[int, int], Image.Image] = {}
    raw_values: list[float] = []
    for row in range(HEIGHT):
        lat = BOUNDS["north"] - row / (HEIGHT - 1) * (BOUNDS["north"] - BOUNDS["south"])
        for column in range(WIDTH):
            lon = BOUNDS["west"] + column / (WIDTH - 1) * (BOUNDS["east"] - BOUNDS["west"])
            raw_values.append(sample_elevation(lon, lat, cache, tiles))
    minimum, maximum = min(raw_values), max(raw_values)
    normalized = [round(max(0.0, min(6000.0, value)) / 6000.0, 5) for value in raw_values]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "width": WIDTH,
        "height": HEIGHT,
        "values": normalized,
        "elevationMeters": {"min": round(minimum, 1), "max": round(maximum, 1)},
        "bounds": BOUNDS,
        "source": "Mapzen/AWS Terrarium tiles; source imagery varies by tile and is recorded in upstream metadata",
        "runtimeNetworkRequired": False,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {output} using {len(tiles)} tiles; range {minimum:.1f}..{maximum:.1f} m")


if __name__ == "__main__":
    main()
