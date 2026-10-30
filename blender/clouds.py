"""A layer of fair-weather cumulus around the volcano, from the JangaFX Cloud Pack (CC0, static VDBs).

Why: a column is only "3.2 km tall" if something in the frame gives the height. Cumulus bases sit around 1.4–2 km over
the plain, so the column visibly rises through and past them. Clouds are placed behind and beside the volcano as seen
from the cameras (which look north-west), never between a camera and the vent. Skipped when the asset is missing.
"""

import math
import random

import bpy

from terrain import SUMMIT
from vdb_asset import find_frames
from volcano_config import SEED, UNIT_METRES
from volcano_scene import _move, _nodes, collection

CLOUD_WIDTH_KM = 1.2          # the asset clouds are ≈ 500 voxels long and 300 wide, ≈ 175 tall (Z up)
VDB_WIDTH, VDB_BASE_Z = 500.0, -104.0


def cloud_material():
    mat = bpy.data.materials.new("Cumulus"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (300, 0)
    vol.inputs["Color"].default_value = (0.96, 0.96, 0.97, 1)
    vol.inputs["Anisotropy"].default_value = 0.6          # bright silver lining towards the sun
    attribute = nodes.new("ShaderNodeAttribute"); attribute.location = (-300, 0)
    attribute.attribute_type = "GEOMETRY"; attribute.attribute_name = "density"
    gain = nodes.new("ShaderNodeMath"); gain.location = (0, 0); gain.operation = "MULTIPLY"; gain.name = "Cloud_Density"
    links.new(attribute.outputs["Fac"], gain.inputs[0])
    links.new(gain.outputs[0], vol.inputs["Density"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat, gain


def build_cloud_layer(summit_level, plain_level=1.0):
    files = find_frames("jangafx-cloud-pack")
    if not files:
        print("[clouds] asset missing; no cloud layer", flush=True)
        return []
    rng = random.Random(SEED + 404)
    col = collection("Landscape")   # part of the outdoor scene: hidden with it in the section presentation
    material, gain = cloud_material()
    scale = CLOUD_WIDTH_KM * 1000 / UNIT_METRES / VDB_WIDTH
    gain.inputs[1].default_value = 0.06 / scale
    clouds = []
    # azimuths (degrees, from +x) behind and beside the vent for cameras in the south-east quadrant
    for index, azimuth in enumerate((60, 85, 100, 120, 140, 165, 190, 215, 35, 240)):
        distance = rng.uniform(16, 42)
        base_km = rng.uniform(1.4, 2.0)
        volume = bpy.data.volumes.new(f"Cumulus_{index + 1:02d}")
        volume.filepath = files[index % len(files)]
        volume.materials.append(material)
        obj = bpy.data.objects.new(f"Cumulus_{index + 1:02d}", volume)
        _move(obj, col)
        size = scale * rng.uniform(0.8, 1.3)
        obj.scale = (size, size, size)
        obj.rotation_euler = (0, 0, rng.uniform(0, math.tau))   # flat base down: the long axis lies horizontal
        a = math.radians(azimuth)
        obj.location = (SUMMIT[0] + distance * math.cos(a), SUMMIT[1] + distance * math.sin(a),
                        plain_level + base_km * 1000 / UNIT_METRES - VDB_BASE_Z * size)
        obj["source"] = "JangaFX Cloud Pack VDB (EmberGen), CC0"
        clouds.append(obj)
    print(f"[clouds] {len(clouds)} cumulus, bases 1.4–2.0 km, ≈{CLOUD_WIDTH_KM} km wide", flush=True)
    return clouds
