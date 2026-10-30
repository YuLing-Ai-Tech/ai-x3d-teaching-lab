#!/usr/bin/env python3
"""Bake the Mantaflow ash plume into .cache/volcano-bake (run inside Blender on volcano-classroom.blend)."""

import sys
import time
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eruption import bake_plume

start = time.time()
domain = bpy.data.objects["Ash_Column"]
bake_plume(domain)
bpy.ops.wm.save_mainfile()
print(f"BAKE_OK resolution={domain.modifiers['Fluid'].domain_settings.resolution_max} seconds={time.time() - start:.0f}", flush=True)
