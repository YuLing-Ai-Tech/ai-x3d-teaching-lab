"""Vulcanian eruption rig: plug, Mantaflow ash plume, ballistic bombs, flash, impact dust.

Timeline comes from volcano_config.PHASES (screen seconds); physics speeds from ERUPTION (SI) via
TIME_SCALE and UNIT_METRES. The smoke cache is baked to .cache/volcano-bake (deterministic for fixed settings).
Kept from the old branch (read-only reference): phase timing idea, two ejecta classes, seeded randomness,
restrained shake envelope. Everything else is new.
"""

import math
import random
from pathlib import Path

import bpy
import numpy as np

from ballistics import simulate
from plume import build_column
from effects import build_bomb_trails, build_crater_glow
from surface import WIND_AZIMUTH
from terrain import CRATER_RADIUS, EXTENT, SUMMIT
from volcano_config import CONTROLS, ERUPTION, ERUPTION_SECONDS, PHASES, SEED, TIME_SCALE, UNIT_METRES
from volcano_scene import _move, _nodes, collection

PROJECT = Path(__file__).resolve().parents[1]
CACHE = PROJECT / ".cache" / "volcano-bake"
FPS = CONTROLS["render"]["fps"]
PHASE = {phase["id"]: phase for phase in PHASES}


def frame_at(seconds):
    return 1 + int(round(seconds * FPS))


def key(owner, path, frame, value, index=-1):
    target = owner
    attribute = path
    if "." in path:
        *parts, attribute = path.split(".")
        for part in parts:
            target = getattr(target, part)
    if isinstance(value, (tuple, list)):
        setattr(target, attribute, value)
    elif index >= 0:
        getattr(target, attribute)[index] = value
    else:
        setattr(target, attribute, value)
    target.keyframe_insert(attribute, frame=frame, index=index)


# ---------------------------------------------------------------- materials
def ash_material():
    """Grey-brown ash: simulated density, broken into cauliflower lobes by evolving 4D detail noise in thin regions."""
    mat = bpy.data.materials.new("Ash_Plume"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (1100, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (800, 0)
    vol.inputs["Color"].default_value = (0.42, 0.40, 0.36, 1)   # sunlit andesitic ash, not white steam
    vol.inputs["Absorption Color"].default_value = (0.03, 0.028, 0.025, 1)
    vol.inputs["Anisotropy"].default_value = 0.2
    density = nodes.new("ShaderNodeAttribute"); density.attribute_name = "density"; density.location = (-400, 200)
    edge = nodes.new("ShaderNodeMapRange"); edge.location = (-150, 260); edge.name = "Ash_Edge"
    edge.interpolation_type = "SMOOTHSTEP"
    edge.inputs["From Min"].default_value = 0.025  # 去掉极稀薄的“毛边”，轮廓更清楚
    edge.inputs["From Max"].default_value = 0.14
    links.new(density.outputs["Fac"], edge.inputs["Value"])
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-650, -100)
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-400, -100); noise.name = "Ash_Detail"
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 45.0
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.6
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    for frame, w in ((1, 0.0), (frame_at(ERUPTION_SECONDS), 6.0)):  # detail evolves (boils) through the clip
        noise.inputs["W"].default_value = w
        noise.inputs["W"].keyframe_insert("default_value", frame=frame)
    lobes = nodes.new("ShaderNodeMapRange"); lobes.location = (-150, -100); lobes.interpolation_type = "SMOOTHSTEP"
    lobes.inputs["From Min"].default_value = 0.44
    lobes.inputs["From Max"].default_value = 0.54
    links.new(noise.outputs["Fac"], lobes.inputs["Value"])
    core = nodes.new("ShaderNodeMapRange"); core.location = (-150, 80)
    core.inputs["From Min"].default_value = 0.06
    core.inputs["From Max"].default_value = 0.3
    links.new(density.outputs["Fac"], core.inputs["Value"])
    keep = nodes.new("ShaderNodeMath"); keep.operation = "MAXIMUM"; keep.location = (80, 0)
    links.new(lobes.outputs[0], keep.inputs[0]); links.new(core.outputs[0], keep.inputs[1])
    shaped = nodes.new("ShaderNodeMath"); shaped.operation = "MULTIPLY"; shaped.location = (280, 150)
    links.new(edge.outputs[0], shaped.inputs[0]); links.new(keep.outputs[0], shaped.inputs[1])
    # 256 分辨率的模拟本身已有细节；细节噪声在远景里像毛发，所以默认关闭（lobes 恒为 1）
    lobes.inputs["From Min"].default_value = -1.0
    lobes.inputs["From Max"].default_value = -0.5
    gain = nodes.new("ShaderNodeMath"); gain.operation = "MULTIPLY"; gain.name = "Ash_Strength"; gain.label = "Ash_Strength"
    gain.inputs[1].default_value = CONTROLS["ash"]["density"] * 20.0
    gain.location = (500, 150)
    links.new(shaped.outputs[0], gain.inputs[0])
    links.new(gain.outputs[0], vol.inputs["Density"])
    temp = nodes.new("ShaderNodeAttribute"); temp.attribute_name = "temperature"; temp.location = (280, -250)
    glow = nodes.new("ShaderNodeMath"); glow.operation = "MULTIPLY"; glow.name = "Ash_Glow"; glow.location = (500, -250)
    glow.inputs[1].default_value = 0.008  # only the jet root is faintly incandescent; daylight ash stays grey
    links.new(temp.outputs["Fac"], glow.inputs[0])
    links.new(glow.outputs[0], vol.inputs["Blackbody Intensity"])
    vol.inputs["Temperature"].default_value = 1000.0
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat


def hot_rock_material(name, crack_scale=14.0, crack_width=0.025):
    """Bread-crust bomb / plug: dark crust, incandescent cracks; object property 'glow' (0..1) drives emission."""
    mat = bpy.data.materials.new(name); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (600, 0)
    bsdf.inputs["Base Color"].default_value = (0.03, 0.028, 0.027, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-400, 0)
    voronoi = nodes.new("ShaderNodeTexVoronoi"); voronoi.location = (-200, 0)
    voronoi.feature = "DISTANCE_TO_EDGE"
    voronoi.inputs["Scale"].default_value = crack_scale
    links.new(coords.outputs["Object"], voronoi.inputs["Vector"])
    crack = nodes.new("ShaderNodeMapRange"); crack.location = (0, 0)
    crack.inputs["From Min"].default_value = 0.0
    crack.inputs["From Max"].default_value = crack_width
    crack.inputs["To Min"].default_value = 1.0
    crack.inputs["To Max"].default_value = 0.0
    links.new(voronoi.outputs["Distance"], crack.inputs["Value"])
    prop = nodes.new("ShaderNodeAttribute"); prop.attribute_type = "OBJECT"; prop.attribute_name = "glow"; prop.location = (0, -250)
    strength = nodes.new("ShaderNodeMath"); strength.operation = "MULTIPLY"; strength.location = (250, -100)
    links.new(crack.outputs[0], strength.inputs[0])
    links.new(prop.outputs["Fac"], strength.inputs[1])
    scale = nodes.new("ShaderNodeMath"); scale.operation = "MULTIPLY"; scale.location = (420, -100)
    scale.inputs[1].default_value = 30.0
    links.new(strength.outputs[0], scale.inputs[0])
    body = nodes.new("ShaderNodeBlackbody"); body.location = (420, -300)
    body.inputs["Temperature"].default_value = 1250.0
    links.new(body.outputs[0], bsdf.inputs["Emission Color"])
    links.new(scale.outputs[0], bsdf.inputs["Emission Strength"])
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def puff_material():
    mat = bpy.data.materials.new("Impact_Dust"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (800, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (500, 0)
    vol.inputs["Color"].default_value = (0.16, 0.14, 0.12, 1)
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-400, 0)
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-200, 0)
    noise.inputs["Scale"].default_value = 2.5
    noise.inputs["Detail"].default_value = 6
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    length = nodes.new("ShaderNodeVectorMath"); length.operation = "LENGTH"; length.location = (-200, -200)
    links.new(coords.outputs["Object"], length.inputs[0])
    falloff = nodes.new("ShaderNodeMapRange"); falloff.location = (0, -200)
    falloff.inputs["From Min"].default_value = 0.3
    falloff.inputs["From Max"].default_value = 1.0
    falloff.inputs["To Min"].default_value = 1.0
    falloff.inputs["To Max"].default_value = 0.0
    links.new(length.outputs["Value"], falloff.inputs["Value"])
    mult = nodes.new("ShaderNodeMath"); mult.operation = "MULTIPLY"; mult.location = (200, -100)
    links.new(noise.outputs["Fac"], mult.inputs[0]); links.new(falloff.outputs[0], mult.inputs[1])
    prop = nodes.new("ShaderNodeAttribute"); prop.attribute_type = "OBJECT"; prop.attribute_name = "dust"; prop.location = (200, -300)
    final = nodes.new("ShaderNodeMath"); final.operation = "MULTIPLY"; final.location = (350, -150)
    links.new(mult.outputs[0], final.inputs[0]); links.new(prop.outputs["Fac"], final.inputs[1])
    links.new(final.outputs[0], vol.inputs["Density"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat


# ---------------------------------------------------------------- objects
def irregular_mesh(name, seed, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=0.5)
    obj = bpy.context.object
    rng = random.Random(seed)
    stretch = (rng.uniform(0.7, 1.3), rng.uniform(0.6, 1.1), rng.uniform(0.6, 1.0))
    for vertex in obj.data.vertices:
        vertex.co.x *= stretch[0] * rng.uniform(0.85, 1.15)
        vertex.co.y *= stretch[1] * rng.uniform(0.85, 1.15)
        vertex.co.z *= stretch[2] * rng.uniform(0.85, 1.15)
    mesh = obj.data
    mesh.name = name
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh


def build_plug(summit_level, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0)
    plug = bpy.context.object
    plug.name = "Vent_Plug"
    plug.scale = (CRATER_RADIUS * 0.55, CRATER_RADIUS * 0.5, 0.45)
    plug.location = (SUMMIT[0], SUMMIT[1], summit_level - 1.05)
    plug.data.materials.append(material)
    _move(plug, collection("Eruption"))
    charge, rupture = PHASE["charge"], PHASE["rupture"]
    plug["glow"] = 0.0
    for seconds, glow, lift in ((0.0, 0.0, 0.0), (charge["end"] * 0.6, 0.01, 0.04), (charge["end"], 0.03, 0.12)):
        plug["glow"] = glow
        plug.keyframe_insert('["glow"]', frame=frame_at(seconds))
        key(plug, "location", frame_at(seconds), (plug.location.x, plug.location.y, summit_level - 1.05 + lift))
    key(plug, "hide_render", frame_at(rupture["start"]) - 1, False)
    key(plug, "hide_render", frame_at(rupture["start"]), True)
    return plug


def build_bombs(field, summit_level, material, kind, count, diameter_m, speed_ms, seed):
    vent = (SUMMIT[0], SUMMIT[1], summit_level - 0.8)
    result = simulate(field["height"], EXTENT, vent, UNIT_METRES, TIME_SCALE, FPS, ERUPTION_SECONDS,
                      PHASE["rupture"]["start"] * TIME_SCALE, count, speed_ms, diameter_m, ERUPTION["bomb_density"],
                      seed, wind_ms=ERUPTION["wind_ms"], wind_azimuth=WIND_AZIMUTH, spread_deg=24 if kind == "bomb" else 32)
    col = collection("Ballistic_Bombs" if kind == "bomb" else "Tephra_Lapilli")
    col["count"] = count
    shapes = [irregular_mesh(f"{kind}_shape_{i}", seed + i, 2 if kind == "bomb" else 1) for i in range(5)]
    for shape in shapes:
        shape.materials.append(material)
    objects = []
    end_frame = frame_at(ERUPTION_SECONDS)
    for i in range(count):
        obj = bpy.data.objects.new(f"{'Volcanic_Bomb' if kind == 'bomb' else 'Lapillus'}_{i + 1:03d}", shapes[i % len(shapes)])
        col.objects.link(obj)
        size = result["diameter_m"][i] / UNIT_METRES
        birth, landed = int(result["birth_frame"][i]) + 1, int(result["landed_frame"][i]) + 1
        obj["diameter_m"] = float(result["diameter_m"][i])
        obj["range_m"] = float(result["range_m"][i])
        obj.scale = (size, size, size)
        key(obj, "hide_render", 1, True)
        key(obj, "hide_render", birth, False)
        for frame in range(birth, end_frame + 1):
            index = min(frame - 1, result["frames"].shape[1] - 1)
            obj.location = result["frames"][i, index]
            obj.keyframe_insert("location", frame=frame)
            if landed <= 0 or frame <= landed:
                t = (frame - birth) / FPS * TIME_SCALE
                obj.rotation_euler = tuple(result["spin"][i] * t * 0.2)
                obj.keyframe_insert("rotation_euler", frame=frame)
        # incandescent at launch, crust darkens over ~real minute after landing
        obj["glow"] = 1.0
        obj.keyframe_insert('["glow"]', frame=birth)
        if landed > 0:
            obj["glow"] = 0.55
            obj.keyframe_insert('["glow"]', frame=landed)
            obj["glow"] = 0.25
            obj.keyframe_insert('["glow"]', frame=min(end_frame, landed + int(3 * FPS)))
        objects.append((obj, landed))
    return objects, result


def build_impact_dust(result, material):
    col = collection("Impact_Dust")
    for i, diameter in enumerate(result["diameter_m"]):
        landed = int(result["landed_frame"][i]) + 1
        if landed <= 0 or diameter < 1.2:
            continue
        bpy.ops.mesh.primitive_cube_add(size=2)
        puff = bpy.context.object
        puff.name = f"Impact_Dust_{i + 1:03d}"
        _move(puff, col)
        puff.data.materials.append(material)
        puff.location = tuple(result["frames"][i, min(landed - 1, result["frames"].shape[1] - 1)])
        radius = 0.06 + 0.04 * diameter
        puff["dust"] = 0.0
        puff.scale = (radius * 0.3,) * 3
        puff.keyframe_insert('["dust"]', frame=landed - 1)
        puff.keyframe_insert("scale", frame=landed - 1)
        puff["dust"] = 9.0
        puff.keyframe_insert('["dust"]', frame=landed + 2)
        puff.scale = (radius, radius, radius * 0.7)
        puff.keyframe_insert("scale", frame=landed + 10)
        puff["dust"] = 0.0
        puff.keyframe_insert('["dust"]', frame=landed + int(2.5 * FPS))
        puff.scale = (radius * 1.8, radius * 1.8, radius * 1.1)
        puff.keyframe_insert("scale", frame=landed + int(2.5 * FPS))


def build_flash(summit_level):
    # A condensation shell was tried and removed: rendered as a hard halo it looked fake, and it is only seen in humid air.
    col = collection("Eruption")
    data = bpy.data.lights.new("Eruption_Flash", "POINT")
    data.color = (1.0, 0.55, 0.22)
    data.shadow_soft_size = 1.2
    flash = bpy.data.objects.new("Eruption_Flash", data)
    col.objects.link(flash)
    flash.location = (SUMMIT[0], SUMMIT[1], summit_level + 1.2)
    flash.visible_volume_scatter = False  # inside the haze volume a point light this strong paints a glowing dome
    rupture, flash_phase = PHASE["rupture"]["start"], PHASE["flash"]
    for seconds, energy in ((0, 0), (rupture - 0.05, 0), (rupture + 0.03, 1.0e4), (rupture + 0.12, 0.15e4), (flash_phase["end"], 0.03e4), (5.0, 0.01e4), (10.0, 0)):
        key(data, "energy", frame_at(seconds), energy)


def build_plume(summit_level, material, resolution):
    col = collection("Eruption")
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=CRATER_RADIUS * 0.3, depth=0.5, location=(SUMMIT[0], SUMMIT[1], summit_level - 0.6))
    flow = bpy.context.object
    flow.name = "Eruption_Flow"
    _move(flow, col)
    flow.hide_render = True
    mod = flow.modifiers.new("Fluid", "FLUID"); mod.fluid_type = "FLOW"
    fs = mod.flow_settings
    fs.flow_type = "SMOKE"; fs.flow_behavior = "INFLOW"; fs.flow_source = "MESH"
    fs.use_initial_velocity = True
    fs.smoke_color = (0.12, 0.11, 0.1)
    fs.surface_distance = 0.6
    fs.subframes = 3
    fs.velocity_random = 0.35
    fs.use_plane_init = False
    jet = ERUPTION["jet_speed_ms"] * TIME_SCALE / UNIT_METRES
    # Mantaflow's inflow velocity is not applied 1:1 in world units (the smoke front lags the emitter speed),
    # so the multipliers below are calibrated against renders: they are tuning factors, not physical claims.
    # The physical numbers the lesson states (160 m/s exit speed, bomb ranges) come from ERUPTION and ballistics.py.
    timeline = [  # seconds, density, temperature, emitter speed (calibrated)
        (0.0, 0.08, 0.3, 0.6), (PHASE["charge"]["end"], 0.15, 0.5, 1.0),
        (PHASE["rupture"]["start"] + 0.05, 1.0, 2.2, jet * 3.2), (PHASE["rupture"]["start"] + 1.2, 1.0, 2.2, jet * 2.8),
        (PHASE["jet"]["end"], 1.0, 2.0, jet * 2.4), (PHASE["plume"]["start"] + 2.5, 1.0, 1.8, jet * 2.0), (PHASE["plume"]["end"], 0.9, 1.5, jet * 1.6),
        (PHASE["fallout"]["end"], 0.0, 0.0, 0.0),  # 喷流持续供给，灰柱与喷口连成一根柱子，而不是脱离的热气团
    ]
    for seconds, density, temperature, speed in timeline:
        frame = frame_at(seconds)
        key(fs, "density", frame, density)
        key(fs, "temperature", frame, temperature)
        fs.velocity_coord = (0.0, 0.0, speed)
        fs.keyframe_insert("velocity_coord", frame=frame)

    margin = 2.0
    # tall domain: a ceiling close above the column makes the ash spread sideways into a fake mushroom
    bpy.ops.mesh.primitive_cube_add(size=1, location=(SUMMIT[0] + 6, SUMMIT[1] + 2, summit_level + 31))
    domain = bpy.context.object
    domain.name = "Ash_Column"
    domain.scale = (52, 44, 66 + margin)
    _move(domain, col)
    mod = domain.modifiers.new("Fluid", "FLUID"); mod.fluid_type = "DOMAIN"
    ds = mod.domain_settings
    ds.domain_type = "GAS"
    ds.resolution_max = resolution
    ds.use_adaptive_domain = True
    ds.adapt_margin = 6
    ds.adapt_threshold = 0.004
    ds.vorticity = 0.6
    ds.alpha = 0.08       # ash-laden gas is slightly heavier than air (fallout), but heat wins in the column
    ds.beta = 1.8         # heat drives buoyant rise (entrainment + expansion)
    ds.use_dissolve_smoke = True
    ds.dissolve_speed = 900
    ds.use_dissolve_smoke_log = True
    ds.use_noise = True
    ds.noise_scale = 3
    ds.noise_strength = 3.0
    ds.cache_directory = str(CACHE)
    ds.cache_type = "ALL"
    ds.cache_frame_start = 1
    # the simulated smoke is only seen in the vent close-up (until the cut to the wide shot); the wide shots use plume.py
    ds.cache_frame_end = frame_at(PHASE["rupture"]["start"] + 2.4)
    domain.data.materials.append(material)
    # Cycles blurs fluid volumes along their velocity grid; at jet speeds that smears the whole plume into a ball.
    # Keep motion blur for the flying bombs, switch it off for the smoke.
    if hasattr(domain, "cycles"):
        domain.cycles.use_motion_blur = False
    domain["density"] = CONTROLS["ash"]["density"]
    domain["eruption_style"] = "Vulcanian"

    bpy.ops.object.effector_add(type="WIND", location=(SUMMIT[0] - 20, SUMMIT[1], summit_level + 15),
                                rotation=(0, math.radians(90), WIND_AZIMUTH))
    wind = bpy.context.object
    wind.name = "Plume_Wind"
    _move(wind, col)
    wind.field.strength = ERUPTION["wind_ms"] * TIME_SCALE / UNIT_METRES * 0.9
    wind.field.flow = 0.6
    return domain, flow


def bake_plume(domain):
    CACHE.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, frame_at(ERUPTION_SECONDS)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj == domain)
    bpy.context.view_layer.objects.active = domain
    with bpy.context.temp_override(active_object=domain, object=domain, selected_objects=[domain]):
        bpy.ops.fluid.free_all()
        bpy.ops.fluid.bake_all()


def build_eruption(field, summit_level, resolution=160):
    ash = ash_material()
    hot = hot_rock_material("Bomb_Breadcrust")
    plug_material = hot_rock_material("Plug_Dacite", crack_scale=55.0, crack_width=0.004)
    build_plug(summit_level, plug_material)
    bombs, bomb_result = build_bombs(field, summit_level, hot, "bomb", CONTROLS["ejecta"]["bombs"],
                                     ERUPTION["bomb_diameter_m"], ERUPTION["bomb_speed_ms"], SEED + 91)
    lapilli, _ = build_bombs(field, summit_level, hot, "lapillus", CONTROLS["ejecta"]["lapilli"],
                             (0.08, 0.4), (60.0, 160.0), SEED + 211)
    build_impact_dust(bomb_result, puff_material())
    build_bomb_trails(bomb_result)
    build_crater_glow(summit_level)
    build_flash(summit_level)
    domain, _ = build_plume(summit_level, ash, resolution)
    build_column(summit_level)
    stats = {"bomb_range_km": [round(float(v) / 1000, 2) for v in np.percentile(bomb_result["range_m"], [0, 50, 100])],
             "bombs_landed": int((bomb_result["landed_frame"] > 0).sum()), "bombs": len(bombs), "lapilli": len(lapilli)}
    return domain, stats
