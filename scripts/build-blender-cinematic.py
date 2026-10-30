#!/usr/bin/env python3
"""Cut the rendered cinematic shots into public/media/volcano-cinematic.mp4.

2.39:1 frames letterboxed in 1920×1080, one caption per shot (what is happening physically), dissolves between shots,
a fade to black before the night shot, light film grain, a title card and a source card. Every picture is a real
Cycles frame from .cache/cinematic/shot-N/ (blender/cinematic.py); the encoder only scales, cuts and overlays text.
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / ".cache" / "cinematic"
WORK = ROOT / ".cache" / "cinematic-cut"
OUTPUT = ROOT / "public" / "media" / "volcano-cinematic.mp4"
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FPS, DISSOLVE = 24, 0.5
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-color_range", "tv", "-movflags", "+faststart", "-an"]

CUT = [  # shot folder, caption (physics, short), transition into the next shot
    (1, "蓄压", "岩塞封住火山通道，气体在下面越积越多", "dissolve"),
    (2, "岩浆", "约 1000°C 的岩浆沿火山通道上涌，顶破岩塞", "dissolve"),
    (3, "破裂", "压力超过岩塞的强度，炽热的碎屑一瞬间冲出火口", "dissolve"),
    (4, "冲击", "冲击波以声速向外扩散，掀起一圈尘环", "dissolve"),
    (6, "卷吸", "灰柱吸入周围空气、受热上升，越升越宽", "dissolve"),
    (7, "3.2 千米", "约一分钟升到云的高度（画面时间压缩 5 倍）", "fadeblack"),
    (8, "夜晚", "炽热的碎屑照亮灰柱底部", None),
]
TITLE = ("火山的一分钟", "Vulcanian 式喷发 · Blender Cycles 渲染的教学模型")
CREDITS = ["体积素材：JangaFX EmberGen 免费 VDB（CC0）", "天空与岩石照片：Poly Haven（CC0）",
           "地形、喷发阶段与弹道：本课程原创模型（1 单位 = 100 米，时间压缩 5 倍）"]


def run(arguments):
    subprocess.run(arguments, check=True)


def font(size):
    return ImageFont.truetype(FONT, size)


def caption_png(path, heading, line):
    """Lower-left caption inside the letterbox's bottom bar area, sitting just above it."""
    image = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.text((120, 1080 - 138 - 92), heading, font=font(46), fill=(255, 236, 205, 255))
    draw.text((122, 1080 - 138 - 32), line, font=font(26), fill=(225, 225, 220, 230))
    draw.rectangle((92, 1080 - 138 - 86, 96, 1080 - 138 + 2), fill=(255, 150, 60, 255))
    image.save(path)


def card(path, lines, sizes):
    image = Image.new("RGB", (1920, 1080), (0, 0, 0))
    draw = ImageDraw.Draw(image)
    total = sum(size * 1.9 for size in sizes)
    y = (1080 - total) / 2
    for text, size in zip(lines, sizes):
        width = draw.textlength(text, font=font(size))
        draw.text(((1920 - width) / 2, y), text, font=font(size), fill=(236, 230, 220))
        y += size * 1.9
    image.save(path)


def segment(index, heading, line):
    frames = sorted((SHOTS / f"shot-{index}").glob("frame-*.jpg"))
    if not frames:
        raise RuntimeError(f"shot {index}: no frames in {SHOTS / f'shot-{index}'}")
    duration = len(frames) / FPS
    cap = WORK / f"caption-{index}.png"
    caption_png(cap, heading, line)
    out = WORK / f"shot-{index}.mp4"
    graph = (
        "[0]scale=1920:804:flags=lanczos:in_range=pc:out_range=tv,pad=1920:1080:0:138:black,format=yuv420p[v];"
        f"[1]format=rgba,fade=in:st=0.4:d=0.5:alpha=1,fade=out:st={max(duration - 0.9, 0.9):.2f}:d=0.5:alpha=1[c];"
        "[v][c]overlay=0:0:shortest=1,format=yuv420p"
    )
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(FPS), "-i", str(SHOTS / f"shot-{index}" / "frame-%04d.jpg"),
         "-loop", "1", "-framerate", str(FPS), "-t", f"{duration:.3f}", "-i", str(cap), "-filter_complex", graph, *X264, "-crf", "14", str(out)])
    return out, duration


def still(path, image, seconds):
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-t", str(seconds), "-i", str(image),
         "-vf", f"fade=in:st=0:d=0.6,fade=out:st={seconds - 0.6}:d=0.6,scale=in_range=pc:out_range=tv,format=yuv420p", *X264, "-crf", "14", str(path)])
    return path, seconds


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    card(WORK / "title.png", TITLE, (84, 30))
    card(WORK / "credits.png", CREDITS, (28, 28, 28))
    parts = [still(WORK / "title.mp4", WORK / "title.png", 3.0)]
    transitions = ["fade"]
    for index, heading, line, transition in CUT:
        parts.append(segment(index, heading, line))
        transitions.append(transition or "fade")
    parts.append(still(WORK / "credits.mp4", WORK / "credits.png", 4.0))
    inputs, graph, offset, previous = [], [], 0.0, "0:v"
    for path, _ in parts:
        inputs += ["-i", str(path)]
    for i in range(1, len(parts)):
        offset += parts[i - 1][1] - DISSOLVE
        label = f"x{i}"
        graph.append(f"[{previous}][{i}:v]xfade=transition={transitions[i - 1]}:duration={DISSOLVE}:offset={offset:.3f}[{label}]")
        previous = label
    graph.append(f"[{previous}]noise=alls=2:allf=t,format=yuv420p[out]")  # faint, time-varying film grain (stronger grain makes every frame incompressible); segments are already TV range
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", ";".join(graph), "-map", "[out]", *X264, str(OUTPUT)])
    total = sum(d for _, d in parts) - DISSOLVE * (len(parts) - 1)
    print(f"CINEMATIC_VIDEO_OK {OUTPUT.relative_to(ROOT)} seconds={total:.1f} shots={len(CUT)}")


if __name__ == "__main__":
    sys.exit(main())
