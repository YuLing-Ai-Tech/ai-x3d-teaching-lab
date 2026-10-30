#!/usr/bin/env python3
"""Verify the rebuilt volcano media against physical expectations and write the visual-acceptance sheets.

Checks: stills/codecs/durations/sizes; step-2 sequence shows a luminance spike at rupture (flash), real motion in the
eruption region, and a growing dark plume area through the jet → plume phases; step-4 labels lie inside the frame.
Sheets (.cache/volcano-shots/): steps-contact.jpg, step2-keyframes.jpg (start / mid / climax / end), before-after.jpg.
"""

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public" / "media"
STEPS = MEDIA / "blender"
FRAMES = ROOT / ".cache" / "volcano-frames"
SHOTS = ROOT / ".cache" / "volcano-shots"
BASELINE = ROOT.parent / "高中教师AI应用培训-20261029" / "public" / "media" / "blender"  # main@4f0cfb9 renders, read-only


def luma(image, box=None):
    image = image.convert("RGB").crop(box) if box else image.convert("RGB")
    r, g, b = ImageStat.Stat(image).mean
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt:format=duration",
                          "-of", "json", str(path)], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def plume_top(image, box, share=0.25):
    """Height of the column top in the box (0 = bottom, 1 = top): the highest row where at least `share` of the pixels
    read as ash. Robust to scattered grey cloud bases, which never fill a quarter of the column strip's width."""
    left, top, right, bottom = box
    region = image.convert("RGB").crop(box)
    width, height = region.size
    data = list(region.getdata())
    for y in range(height):
        row = data[y * width:(y + 1) * width]
        ash = sum(1 for r, g, b in row if b - r < 12 and 35 < 0.2126 * r + 0.7152 * g + 0.0722 * b < 190)
        if ash >= share * width:
            return 1 - y / height
    return 0.0


def sheet(images, columns, size, labels=None):
    w, h = size
    rows = (len(images) + columns - 1) // columns
    canvas = Image.new("RGB", (w * columns, h * rows), (4, 7, 9))
    draw = ImageDraw.Draw(canvas)
    for index, image in enumerate(images):
        x, y = (index % columns) * w, (index // columns) * h
        canvas.paste(image.convert("RGB").resize((w, h), Image.Resampling.LANCZOS), (x, y))
        if labels:
            draw.rectangle((x, y, x + 260, y + 26), fill=(0, 0, 0))
            draw.text((x + 8, y + 6), labels[index], fill=(255, 230, 170))
    return canvas


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    payload = json.loads((STEPS / "steps.json").read_text(encoding="utf-8"))
    assert len(payload["steps"]) == 5 and len(payload["phases"]) == 7, "steps.json must hold 5 steps and 7 phases"
    labels = payload["steps"][3]["labels"]
    assert len(labels) >= 8, f"step 4 has only {len(labels)} labels"
    for label in labels:
        assert 0.02 <= label["anchor"]["x"] <= 0.98 and 0.02 <= label["anchor"]["y"] <= 0.98, label

    stills = [Image.open(STEPS / f"step-{i}.jpg") for i in range(1, 6)]
    for index, image in enumerate(stills, 1):
        assert image.size == (1920, 1080) or image.size[0] / image.size[1] == 16 / 9, f"step-{index}.jpg {image.size}"
        assert (STEPS / f"step-{index}.jpg").stat().st_size <= 1_200_000, f"step-{index}.jpg too large"
        assert luma(image) > 0.03, f"step-{index}.jpg is black"

    frames = sorted((FRAMES / "step-2").glob("frame-*.jpg"))
    assert len(frames) >= 280, f"step 2 needs the full 12 s sequence, found {len(frames)} frames"
    rupture = int(round(payload["phases"][1]["start"] * 24))
    pick = lambda i: Image.open(frames[min(max(i, 0), len(frames) - 1)])
    width, height = pick(0).size
    upper = (int(width * 0.2), 0, int(width * 0.8), int(height * 0.55))
    flash_ratio = luma(pick(rupture + 2), upper) / max(luma(pick(rupture - 8), upper), 1e-3)
    assert flash_ratio > 1.03, f"no flash at rupture: luma ratio {flash_ratio:.3f}"
    diffs = [sum(ImageStat.Stat(ImageChops.difference(pick(i).convert("RGB").crop(upper), pick(i + 6).convert("RGB").crop(upper))).mean) / (3 * 255)
             for i in range(rupture, len(frames) - 6, 12)]
    assert max(diffs) > 0.02 and sum(diffs) / len(diffs) > 0.004, f"eruption region barely moves: {max(diffs):.4f}"
    climax_frames = [i for i in range(len(frames)) if i >= rupture + 52]  # the climax camera after the cut
    column = (int(width * 0.44), 0, int(width * 0.56), int(height * 0.7))  # the column's strip: dust ring and clouds spread sideways
    plume = [plume_top(pick(i), column) for i in (climax_frames[0], climax_frames[len(climax_frames) // 3], climax_frames[2 * len(climax_frames) // 3])]
    assert plume[1] > plume[0] * 1.15 or plume[2] > plume[0] * 1.15, f"plume top does not rise: {plume}"

    for i in range(1, 6):
        data = probe(STEPS / f"step-{i}.mp4")
        video = next(s for s in data["streams"] if s["codec_type"] == "video")
        expected = payload["steps"][i - 1]["animation"]["durationSeconds"]
        assert video["codec_name"] == "h264" and video["pix_fmt"] == "yuv420p" and (video["width"], video["height"]) == (1920, 1080)
        assert abs(float(data["format"]["duration"]) - expected) < 0.15, f"step-{i}.mp4 duration {data['format']['duration']} != {expected}"
    for name in ("blender-volcano-demo.mp4", "blender-live-edit-demo.mp4"):
        assert probe(MEDIA / name)["streams"][0]["codec_name"] == "h264"
    media = list(STEPS.glob("*")) + list(MEDIA.glob("blender-*")) + list((ROOT / "public" / "blender").rglob("*.*"))
    total = sum(path.stat().st_size for path in media if path.is_file())
    assert total < 140_000_000, f"Blender media total {total / 1e6:.1f} MB"

    sheet(stills + [Image.open(MEDIA / "blender-volcano-poster.png")], 3, (640, 360),
          [f"step {i}" for i in range(1, 6)] + ["poster"]).save(SHOTS / "steps-contact.jpg", quality=90)
    key = {"start": 0, "charge": rupture - 6, "rupture": rupture + 2, "jet": rupture + 24, "mid": len(frames) // 2,
           "climax": rupture + 100, "late": len(frames) - 60, "end": len(frames) - 1}
    sheet([pick(i) for i in key.values()], 4, (480, 270), [f"{name} · f{i + 1}" for name, i in key.items()]).save(SHOTS / "step2-keyframes.jpg", quality=90)
    if BASELINE.exists():
        before = [Image.open(BASELINE / f"step-{i}.jpg") for i in range(1, 6)]
        sheet(before + stills, 5, (384, 216), [f"旧 step {i}" for i in range(1, 6)] + [f"新 step {i}" for i in range(1, 6)]).save(SHOTS / "before-after.jpg", quality=90)
    print("RENDER_VERIFY_OK", f"flash_ratio={flash_ratio:.3f}", f"motion_max={max(diffs):.4f}", f"plume_top={[round(v, 3) for v in plume]}",
          f"labels={len(labels)}", f"media_total={total / 1e6:.1f}MB", f"sheets={SHOTS}")


if __name__ == "__main__":
    main()
