"""Blast-wave dust ring at the moment of rupture, from the JangaFX "Dust Shockwave" VDB set (CC0, EmberGen).

Why borrow: a ground-hugging, cauliflower-edged dust torus is exactly what Mantaflow at classroom resolution cannot
produce, and the asset is public domain. It is not in git (12 GB): it lives in .cache/assets/ and the scene skips the
ring with a message when the folder is missing, so the build still runs on any machine.

Physics we impose on the asset (it is a generic dust explosion, not a volcano):
  * size: the ring starts at the crater rim (~250 m) and ends at RING_END_KM, about 300 m tall;
  * timing: it starts with the flash/shock phase and plays at 24 fps (no time scaling: the shock is the fastest event);
  * terrain: it is lowered as it expands so its base follows the mean flank height at that radius
    (whatever falls inside the cone is hidden by the terrain surface, which reads as dust hugging the slope);
  * fade: density decays through the fallout phase while the dust settles.
"""

import math

import bpy
import numpy as np

from terrain import EXTENT, SUMMIT
from volcano_config import CONTROLS, PHASES, UNIT_METRES
from vdb_asset import find_frames, load_sequence, retime
from volcano_scene import _move, _nodes, collection

FPS = CONTROLS["render"]["fps"]
PHASE = {phase["id"]: phase for phase in PHASES}
RING_END_KM = 2.0
# outer radius of the ring in VDB voxel units, measured from the bounding boxes of the set (frame → radius)
VDB_RADIUS = ((0, 120.0), (77, 450.0), (154, 570.0))
SKIP = 14         # the first asset frames are a compact dome, not yet a ring: start where it has opened out
VDB_FLOOR = -96.0  # lowest voxel of every frame: the ground the dust was simulated on


def _mean_height_at(field, radius):
    """Mean terrain height on a circle around the vent (scene units)."""
    h = field["height"]
    n = h.shape[0]
    angles = np.linspace(0, 2 * math.pi, 72, endpoint=False)
    xs = SUMMIT[0] + radius * np.cos(angles)
    ys = SUMMIT[1] + radius * np.sin(angles)
    cols = np.clip(np.round((xs + EXTENT) / (2 * EXTENT) * (n - 1)).astype(int), 0, n - 1)
    rows = np.clip(np.round((ys + EXTENT) / (2 * EXTENT) * (n - 1)).astype(int), 0, n - 1)
    return float(h[rows, cols].mean())


def dust_material():
    mat = bpy.data.materials.new("Shock_Dust")
    nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (300, 0)
    vol.inputs["Color"].default_value = (0.36, 0.31, 0.26, 1)          # lofted andesitic ash and soil: warm grey-brown
    vol.inputs["Absorption Color"].default_value = (0.05, 0.04, 0.035, 1)
    vol.inputs["Anisotropy"].default_value = 0.35                        # forward scattering: rims glow when back-lit
    attribute = nodes.new("ShaderNodeAttribute"); attribute.location = (-300, 0)
    attribute.attribute_type = "GEOMETRY"; attribute.attribute_name = "density"
    gain = nodes.new("ShaderNodeMath"); gain.location = (0, 0); gain.operation = "MULTIPLY"; gain.name = "Shock_Density"
    links.new(attribute.outputs["Fac"], gain.inputs[0])
    links.new(gain.outputs[0], vol.inputs["Density"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat, gain


def build_shockwave(field, summit_level):
    files = find_frames("jangafx-dust-shockwave")
    start = 1 + int(round(PHASE["flash"]["start"] * FPS))
    obj = load_sequence("Shock_Dust", files, start)
    if obj is None:
        return None
    volume = obj.data
    retime(obj, [(start, SKIP), (start + len(files) - SKIP, len(files) - 1)])
    obj.hide_render = True
    obj.keyframe_insert("hide_render", frame=start - 1)   # EXTEND would also show the first frame before the start
    obj.hide_render = False
    obj.keyframe_insert("hide_render", frame=start)
    _move(obj, collection("Eruption"))

    end_radius = RING_END_KM * 1000 / UNIT_METRES
    scale = end_radius / VDB_RADIUS[-1][1]
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0, 0, 0.7)  # break the alignment of the asset's lobes with the camera axes
    material, gain = dust_material()
    volume.materials.append(material)

    # follow the flank: at each key, the ring's floor sits on the mean terrain height at ~85 % of its outer radius
    frames, radii = zip(*VDB_RADIUS)
    for offset in range(0, len(files) - SKIP, 8):
        radius = float(np.interp(offset + SKIP, frames, radii)) * scale
        ground = min(summit_level, _mean_height_at(field, 0.85 * radius))
        obj.location = (SUMMIT[0], SUMMIT[1], ground - VDB_FLOOR * scale + 0.2)
        obj.keyframe_insert("location", frame=start + offset)

    # optical depth scales with the object: density per world unit must grow as the asset shrinks
    base = 1.0 / scale * 0.08
    fallout = PHASE["fallout"]
    for frame, factor in ((start, 1.0), (1 + int(round(fallout["start"] * FPS)), 0.8), (1 + int(round(fallout["end"] * FPS)), 0.0)):
        gain.inputs[1].default_value = base * factor
        gain.inputs[1].keyframe_insert("default_value", frame=frame)
    if hasattr(obj, "cycles"):
        obj.cycles.use_motion_blur = False
    obj["source"] = "JangaFX Dust Shockwave VDB (EmberGen), CC0 — https://jangafx.com/software/embergen/download/free-vdb-animations/"
    obj["model"] = f"blast-wave dust ring: crater rim → {RING_END_KM} km, base follows mean flank height"
    print(f"[shockwave] {len(files)} frames from frame {start}, scale {scale:.4f}, end radius {RING_END_KM} km", flush=True)
    return obj
