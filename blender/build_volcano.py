#!/usr/bin/env python3
"""Build the deterministic Vulcanian volcano lesson scene (run inside Blender).

  blender --background --python blender/build_volcano.py [-- --preview]
Writes public/blender/volcano-classroom.blend, textures under public/blender/textures/
and section label anchors to public/blender/anchors.json.
"""

import json
import sys
import time
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from eruption import build_eruption
from geology import build_section
from shockwave import build_shockwave
from clouds import build_cloud_layer
from burst import build_rupture_burst
from effects import bake_effects, build_embers
from surface import surface_maps
from terrain import build_heightfield, profile_at_y0
from volcano_config import CONTROLS, SEED, STEPS
from volcano_scene import (
    TEXTURES, build_atmosphere, build_cameras, build_lights, build_materials, build_terrain_meshes,
    build_grade, build_world, linear_to_srgb, save_image, set_presentation,
)

PROJECT = Path(__file__).resolve().parents[1]
BLEND = PROJECT / "public" / "blender" / "volcano-classroom.blend"
ANCHORS = PROJECT / "public" / "blender" / "anchors.json"
PREVIEW = "--preview" in sys.argv
MAGMA_GAIN = 0.55  # Magma_Emission_Strength = MAGMA_GAIN × (classroom emission / 4)² × heat³


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def log(message, start):
    print(f"[build {time.time() - start:6.1f}s] {message}", flush=True)


def build():
    start = time.time()
    clear_scene()
    n = 769  # erosion depends on cell size: previews use the same terrain as final renders
    field = build_heightfield(n=n, seed=SEED)
    log(f"heightfield {n}² summit={field['summit_level']:.2f}", start)
    axis, profile = profile_at_y0(field)
    size = 1024 if PREVIEW else 4096
    section = build_section(axis, profile, width=size, seed=SEED)
    far = build_section(axis, profile, width=size // 2, seed=SEED + 100, volcanic=False)
    surface = surface_maps(field, size=size, seed=SEED)
    log("numpy maps", start)

    images = {
        "surface_albedo": save_image("Surface_Albedo", np.flipud(linear_to_srgb(surface["albedo"])), TEXTURES / "surface_albedo.jpg"),
        "surface_props": save_image("Surface_Props", np.flipud(np.dstack([surface["heat"], surface["roughness"], np.zeros_like(surface["heat"])])), TEXTURES / "surface_props.png"),
        "section_albedo": save_image("Section_Albedo", linear_to_srgb(section["albedo"]), TEXTURES / "section_albedo.jpg"),
        "section_props": save_image("Section_Props", np.dstack([section["heat"], section["rough"], section["relief"]]), TEXTURES / "section_props.png"),
        "wall_albedo": save_image("Wall_Albedo", linear_to_srgb(far["albedo"]), TEXTURES / "wall_albedo.jpg"),
    }
    log("textures saved", start)

    materials = build_materials(images, MAGMA_GAIN)
    build_terrain_meshes(field, materials)
    build_atmosphere()
    build_world(CONTROLS["sun"]["day_elevation"])
    build_lights(CONTROLS["sun"]["day_elevation"])
    cameras = build_cameras(field["summit_level"])
    log("scene assembled", start)
    _, stats = build_eruption(field, field["summit_level"], resolution=int(next((a.split("=")[1] for a in sys.argv if a.startswith("--res=")), 96 if PREVIEW else 160)))
    log(f"eruption rig {stats}", start)
    build_shockwave(field, field["summit_level"])
    build_embers(field["summit_level"])
    build_cloud_layer(field["summit_level"])
    build_rupture_burst(field["summit_level"])
    log("shock dust ring", start)

    scene = bpy.context.scene
    scene.render.resolution_x = CONTROLS["render"]["width"]
    scene.render.resolution_y = CONTROLS["render"]["height"]
    scene.render.fps = CONTROLS["render"]["fps"]
    scene.render.engine = "CYCLES"
    scene.view_settings.view_transform = "Filmic"  # AgX renders Blackbody magma as salmon-pink
    scene.view_settings.look = "Medium High Contrast"
    build_grade()
    scene["CONTROLS"] = json.dumps(CONTROLS, ensure_ascii=False)
    scene["seed"] = SEED
    scene["summit_level"] = field["summit_level"]
    scene["classroom_note"] = "Deterministic educational model, 1 unit = 100 m; not a physical simulation of a specific volcano."
    scene["step_count"] = len(STEPS)
    scene.camera = cameras["Camera_Hero"]
    scene.frame_start, scene.frame_end = 1, int(round(12.0 * CONTROLS["render"]["fps"])) + 1
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    set_presentation("landscape")
    bake_effects()
    log("embers baked", start)

    anchors = {key: {"x": value[0], "y": -0.01, "z": value[1]} for key, value in section["anchors"].items() if value}
    anchors["crater"] = {"x": float(axis[np.argmax(profile)]), "y": 0.0, "z": field["summit_level"]}
    ANCHORS.parent.mkdir(parents=True, exist_ok=True)
    ANCHORS.write_text(json.dumps(anchors, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    np.save(PROJECT / ".cache" / "volcano-height.npy", field["height"]) if (PROJECT / ".cache").exists() else None
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), relative_remap=True, compress=True)
    log(f"BUILD_OK objects={len(bpy.data.objects)} blend={BLEND}", start)


if __name__ == "__main__":
    build()
