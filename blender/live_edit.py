#!/usr/bin/env python3
"""Rehearsed classroom edit without MCP: the same parameter changes the precise prompts ask for (run inside Blender).

  blender public/blender/volcano-classroom.blend --background --python blender/live_edit.py
Writes a low-sample preview PNG and volcano-live-edited.blend; last line is the verification string.
"""

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_lookdev import configure
from render_steps import magma_emission
from volcano_scene import set_presentation

PROJECT = Path(__file__).resolve().parents[1]
set_presentation("section")
magma_emission(9.0)
camera = bpy.data.objects["Camera_Section"]
bpy.context.scene.camera = camera
camera.data.lens = 35
configure(24, 50)
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(PROJECT / "public" / "media" / "blender-live-edit-preview.png")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(PROJECT / "public" / "blender" / "volcano-live-edited.blend"), relative_remap=True, compress=True)
print(f"LIVE_EDIT_OK magma=9.0 camera={camera.name} lens={camera.data.lens:.0f}")
