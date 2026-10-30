#!/usr/bin/env python3
"""Look-development stills: one frame per camera, with per-frame timing (run inside Blender).

  blender public/blender/volcano-classroom.blend --background --python blender/render_lookdev.py -- [percent] [samples] [out_dir]
"""

import sys
import time
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from volcano_scene import set_presentation

PROJECT = Path(__file__).resolve().parents[1]
SHOTS = [("hero", "Camera_Hero", "landscape"), ("vent", "Camera_Vent", "landscape"), ("climax", "Camera_Climax", "landscape"),
         ("section", "Camera_Section", "section"), ("orbit", "Camera_Orbit", "section")]


def configure(samples, percent):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.use_denoising = True
    scene.cycles.volume_step_rate = 1.0  # coarser steps blur away the plume detail
    scene.cycles.max_bounces = 6
    scene.cycles.volume_bounces = 3  # multiple scattering: sunlit ash glows soft grey instead of reading as ink
    scene.render.resolution_percentage = percent
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    percent = int(args[0]) if len(args) > 0 else 50
    samples = int(args[1]) if len(args) > 1 else 64
    out = Path(args[2]) if len(args) > 2 else PROJECT / ".cache" / "volcano-lookdev"
    out.mkdir(parents=True, exist_ok=True)
    configure(samples, percent)
    only = set(args[3].split(",")) if len(args) > 3 else None
    for name, camera, mode in SHOTS:
        if only and name not in only:
            continue
        set_presentation(mode)
        bpy.context.scene.camera = bpy.data.objects[camera]
        bpy.context.scene.render.filepath = str(out / f"{name}.jpg")
        start = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"LOOKDEV {name} {camera} {time.time() - start:.1f}s", flush=True)


if __name__ == "__main__":
    main()
