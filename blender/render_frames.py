#!/usr/bin/env python3
"""Render selected frames from one camera (run inside Blender).

  blender <blend> --background --python blender/render_frames.py -- <camera> <frames,comma|a-b> <percent> <samples> <out_dir> [landscape|section]
"""

import sys
import time
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_lookdev import configure
from volcano_scene import set_presentation

args = sys.argv[sys.argv.index("--") + 1:]
camera, spec, percent, samples, out = args[0], args[1], int(args[2]), int(args[3]), Path(args[4])
mode = args[5] if len(args) > 5 else "landscape"
if "-" in spec:
    a, b = (int(v) for v in spec.split("-"))
    frames = list(range(a, b + 1))
else:
    frames = [int(v) for v in spec.split(",")]
out.mkdir(parents=True, exist_ok=True)
configure(samples, percent)
set_presentation(mode)
scene = bpy.context.scene
scene.camera = bpy.data.objects[camera]
total = time.time()
for frame in frames:
    scene.frame_set(frame)
    scene.render.filepath = str(out / f"{camera}-{frame:04d}.jpg")
    start = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"FRAME {camera} {frame} {time.time() - start:.1f}s", flush=True)
print(f"FRAMES_OK {len(frames)} {time.time() - total:.0f}s", flush=True)
