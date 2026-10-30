#!/usr/bin/env python3
"""Encode the real Blender frame sequences into classroom H.264 clips (5 steps + full demo + live-edit demo)."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public" / "media" / "blender"
FRAMES = ROOT / ".cache" / "volcano-frames"
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-color_range", "tv", "-movflags", "+faststart", "-an"]
SCALE = "scale=1920:1080:flags=lanczos,scale=in_range=pc:out_range=tv,format=yuv420p"


def run(arguments):
    subprocess.run(arguments, cwd=ROOT, check=True)


def encode_step(index, duration):
    directory = FRAMES / f"step-{index}"
    images = sorted(directory.glob("frame-*.jpg"))
    if not images:
        raise RuntimeError(f"step {index}: no rendered frames in {directory}")
    output = MEDIA / f"step-{index}.mp4"
    if len(images) == 1:  # a static shot: one real frame held for the clip length
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-framerate", "24", "-i", str(images[0]),
             "-t", str(duration), "-vf", SCALE, *X264, str(output)])
    else:
        expected = duration * 24
        if abs(len(images) - expected) > 1:
            raise RuntimeError(f"step {index}: expected {expected} frames, found {len(images)}")
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", "24", "-i", str(directory / "frame-%04d.jpg"),
             "-vf", SCALE, *X264, str(output)])
    return output


def concat(parts, output):
    manifest = ROOT / ".cache" / f"{output.stem}-concat.txt"
    manifest.write_text("".join(f"file '{part.resolve()}'\n" for part in parts), encoding="utf-8")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(manifest),
         "-vf", "fps=24,format=yuv420p", *X264, str(output)])


def main():
    steps = json.loads((MEDIA / "steps.json").read_text(encoding="utf-8"))["steps"]
    clips = [encode_step(step["id"], step["animation"]["durationSeconds"]) for step in steps]
    concat([clips[1], clips[0], clips[3], clips[4]], ROOT / "public" / "media" / "blender-volcano-demo.mp4")
    concat([clips[1], clips[2]], ROOT / "public" / "media" / "blender-live-edit-demo.mp4")
    print(f"VIDEO_OK steps={len(clips)} source=real-Blender-Cycles-frames")


if __name__ == "__main__":
    main()
