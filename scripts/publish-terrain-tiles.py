#!/usr/bin/env python3
"""Publish cached Terrarium elevation tiles into the offline classroom site."""

from pathlib import Path
import shutil

from PIL import Image


SEA_LEVEL = (128, 0, 0)


def build_parent_tiles(destination: Path, child_zoom: int) -> int:
    child_root = destination / str(child_zoom)
    child_paths = list(child_root.glob("*/*.png"))
    parents = {(int(path.parent.name) // 2, int(path.stem) // 2) for path in child_paths}
    for parent_x, parent_y in parents:
        mosaic = Image.new("RGB", (512, 512), SEA_LEVEL)
        for x_offset in range(2):
            for y_offset in range(2):
                child = child_root / str(parent_x * 2 + x_offset) / f"{parent_y * 2 + y_offset}.png"
                if child.exists():
                    with Image.open(child) as image:
                        mosaic.paste(image.convert("RGB"), (x_offset * 256, y_offset * 256))
        output = destination / str(child_zoom - 1) / str(parent_x) / f"{parent_y}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        mosaic.resize((256, 256), Image.Resampling.LANCZOS).save(output, optimize=True)
    return len(parents)


def add_sea_level_border(destination: Path, zoom: int) -> int:
    root = destination / str(zoom)
    paths = list(root.glob("*/*.png"))
    coordinates = {(int(path.parent.name), int(path.stem)) for path in paths}
    if not coordinates:
        return 0
    min_x = max(0, min(x for x, _ in coordinates) - 1)
    max_x = min(2**zoom - 1, max(x for x, _ in coordinates) + 1)
    min_y = max(0, min(y for _, y in coordinates) - 1)
    max_y = min(2**zoom - 1, max(y for _, y in coordinates) + 1)
    blank = Image.new("RGB", (256, 256), SEA_LEVEL)
    created = 0
    for x in range(min_x, max_x + 1):
        for y in range(min_y, max_y + 1):
            output = root / str(x) / f"{y}.png"
            if not output.exists():
                output.parent.mkdir(parents=True, exist_ok=True)
                blank.save(output, optimize=True)
                created += 1
    return created


def fill_small_world_tiles(destination: Path, max_zoom: int = 4) -> int:
    blank = Image.new("RGB", (256, 256), SEA_LEVEL)
    created = 0
    for zoom in range(max_zoom + 1):
        for x in range(2**zoom):
            for y in range(2**zoom):
                output = destination / str(zoom) / str(x) / f"{y}.png"
                if not output.exists():
                    output.parent.mkdir(parents=True, exist_ok=True)
                    blank.save(output, optimize=True)
                    created += 1
    return created


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    cache = project / ".cache" / "terrain"
    destination = project / "public" / "terrain"
    tiles = sorted(cache.glob("6-*-*.png"))
    if not tiles:
        raise SystemExit("no cached Terrarium tiles found; run build-terrain.py first")
    if destination.exists():
        shutil.rmtree(destination)

    for tile in tiles:
        zoom, x, y = tile.stem.split("-")
        output = destination / zoom / x / f"{y}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tile, output)

    parent_count = 0
    for child_zoom in range(6, 0, -1):
        parent_count += build_parent_tiles(destination, child_zoom)
    border_count = sum(add_sea_level_border(destination, zoom) for zoom in range(7))
    world_count = fill_small_world_tiles(destination)

    print(f"published {len(tiles)} DEM tiles, {parent_count} overview tiles, {border_count} border tiles, and {world_count} low-zoom ocean tiles")


if __name__ == "__main__":
    main()
