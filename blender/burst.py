"""The rupture burst: the first second of the jet, when gas and fragments at ≈ 1000 °C leave the vent incandescent.

Borrowed from the JangaFX "Ground Explosion" VDB (CC0). A volcano does not burn: the asset's `flames` grid is rendered as
blackbody light of hot pyroclasts (≈ 1050 K, deep orange, not the yellow of a fuel fire) and its smoke as dark ash.
It starts at the rupture, about 0.5 km across, and hands over to the rising column within a few seconds.
"""

import bpy

from terrain import SUMMIT
from vdb_asset import find_frames, load_sequence
from volcano_config import CONTROLS, PHASES, UNIT_METRES
from volcano_scene import _move, _nodes, collection

FPS = CONTROLS["render"]["fps"]
PHASE = {phase["id"]: phase for phase in PHASES}
BURST_WIDTH_KM = 0.5
VDB_WIDTH, VDB_FLOOR = 190.0, -160.0


def burst_material():
    mat = bpy.data.materials.new("Rupture_Burst"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (800, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (550, 0)
    vol.inputs["Color"].default_value = (0.28, 0.26, 0.24, 1)
    vol.inputs["Absorption Color"].default_value = (0.05, 0.045, 0.04, 1)
    vol.inputs["Blackbody Intensity"].default_value = 0.0
    density = nodes.new("ShaderNodeAttribute"); density.attribute_type = "GEOMETRY"; density.attribute_name = "density"; density.location = (-300, 100)
    flames = nodes.new("ShaderNodeAttribute"); flames.attribute_type = "GEOMETRY"; flames.attribute_name = "flames"; flames.location = (-300, -150)
    dgain = nodes.new("ShaderNodeMath"); dgain.operation = "MULTIPLY"; dgain.name = "Burst_Density"; dgain.location = (0, 100)
    egain = nodes.new("ShaderNodeMath"); egain.operation = "MULTIPLY"; egain.name = "Burst_Glow"; egain.location = (0, -150)
    links.new(density.outputs["Fac"], dgain.inputs[0]); links.new(flames.outputs["Fac"], egain.inputs[0])
    body = nodes.new("ShaderNodeBlackbody"); body.location = (250, -300); body.inputs["Temperature"].default_value = 1050.0
    links.new(dgain.outputs[0], vol.inputs["Density"])
    links.new(egain.outputs[0], vol.inputs["Emission Strength"])
    links.new(body.outputs[0], vol.inputs["Emission Color"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat, dgain, egain


def build_rupture_burst(summit_level):
    files = find_frames("jangafx-ground-explosion")
    files.sort(key=lambda path: int(path.rsplit("_", 1)[1].split(".")[0]))
    rupture = 1 + int(round(PHASE["rupture"]["start"] * FPS))
    obj = load_sequence("Rupture_Burst", files, rupture)
    if obj is None:
        return None
    _move(obj, collection("Eruption"))
    scale = BURST_WIDTH_KM * 1000 / UNIT_METRES / VDB_WIDTH
    obj.scale = (scale, scale, scale)
    obj.location = (SUMMIT[0], SUMMIT[1], summit_level - 0.7 - VDB_FLOOR * scale)
    material, dgain, egain = burst_material()
    obj.data.materials.append(material)
    obj.hide_render = True; obj.keyframe_insert("hide_render", frame=rupture - 1)
    obj.hide_render = False; obj.keyframe_insert("hide_render", frame=rupture)
    # incandescent for the first ~2 s, then its ash merges into the column and thins out
    for seconds, density, glow in ((0.0, 1.0, 1.0), (1.5, 1.0, 0.6), (3.0, 0.8, 0.1), (6.0, 0.3, 0.0), (8.0, 0.0, 0.0)):
        frame = rupture + int(seconds * FPS)
        dgain.inputs[1].default_value = 0.03 / scale * density; dgain.inputs[1].keyframe_insert("default_value", frame=frame)
        egain.inputs[1].default_value = 2.4 * glow; egain.inputs[1].keyframe_insert("default_value", frame=frame)
    obj["source"] = "JangaFX Ground Explosion VDB (EmberGen), CC0 — flames rendered as ≈1050 K incandescence, not combustion"
    print(f"[burst] {len(files)} frames from {rupture}, {BURST_WIDTH_KM} km", flush=True)
    return obj
