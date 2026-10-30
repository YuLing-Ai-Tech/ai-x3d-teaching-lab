"""Cinematic secondary effects that carry information as well as mood:
  * embers: incandescent spatter thrown with the jet (particles, gravity on the same compressed clock as the bombs);
Both are deterministic (fixed seeds) and baked at build time so any frame renders the same.
"""

import math

import bpy

from terrain import SUMMIT
from volcano_config import CONTROLS, PHASES, SEED, TIME_SCALE, UNIT_METRES
from volcano_scene import _move, _nodes, collection

FPS = CONTROLS["render"]["fps"]
PHASE = {phase["id"]: phase for phase in PHASES}
# g on screen, in scene units per s²: 9.81 m/s² × TIME_SCALE² / UNIT_METRES; Blender's gravity is 9.81 units/s²
GRAVITY_WEIGHT = 9.81 * TIME_SCALE ** 2 / UNIT_METRES / 9.81


def ember_material():
    mat = bpy.data.materials.new("Ember_Glow"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    emit = nodes.new("ShaderNodeEmission"); emit.location = (350, 0)
    info = nodes.new("ShaderNodeParticleInfo"); info.location = (-400, 0)
    age = nodes.new("ShaderNodeMath"); age.operation = "DIVIDE"; age.location = (-200, 0)
    links.new(info.outputs["Age"], age.inputs[0]); links.new(info.outputs["Lifetime"], age.inputs[1])
    cool = nodes.new("ShaderNodeValToRGB"); cool.location = (0, 100)   # cools from yellow-orange to dull red as it flies
    cool.color_ramp.elements[0].color = (1.0, 0.55, 0.15, 1)
    cool.color_ramp.elements[1].color = (0.6, 0.06, 0.01, 1)
    links.new(age.outputs[0], cool.inputs[0])
    fade = nodes.new("ShaderNodeMapRange"); fade.location = (0, -150)
    fade.inputs["From Min"].default_value = 0.0; fade.inputs["From Max"].default_value = 1.0
    fade.inputs["To Min"].default_value = 60.0; fade.inputs["To Max"].default_value = 2.0
    links.new(age.outputs[0], fade.inputs["Value"])
    links.new(cool.outputs["Color"], emit.inputs["Color"]); links.new(fade.outputs[0], emit.inputs["Strength"])
    links.new(emit.outputs[0], out.inputs[0])
    return mat


def build_embers(summit_level):
    col = collection("Eruption")
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.02, location=(0, 0, -200))
    spark = bpy.context.object; spark.name = "Ember_Instance"
    _move(spark, col)
    spark.data.materials.append(ember_material())
    # the source spark stays renderable (hiding it hides every instance); it sits 20 km below the terrain
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.35, fill_type="NGON", location=(SUMMIT[0], SUMMIT[1], summit_level - 0.3))
    emitter = bpy.context.object; emitter.name = "Ember_Emitter"
    _move(emitter, col)
    emitter.hide_render = True
    system = emitter.modifiers.new("Embers", "PARTICLE_SYSTEM").particle_system
    settings = system.settings
    system.seed = SEED % 1000
    rupture = 1 + int(round(PHASE["rupture"]["start"] * FPS))
    settings.count = 2600
    settings.frame_start = rupture
    settings.frame_end = rupture + int(3.0 * FPS)
    settings.lifetime = int(2.6 * FPS)
    settings.lifetime_random = 0.6
    settings.emit_from = "FACE"
    settings.normal_factor = 0.0
    settings.object_align_factor = (0.0, 0.0, 4.0)   # ≈ 80 m/s real: spatter arcs to ~300 m and falls back around the crater
    settings.factor_random = 2.5
    settings.brownian_factor = 0.4                   # turbulence of the jet
    settings.drag_factor = 0.05
    settings.effector_weights.gravity = GRAVITY_WEIGHT
    settings.render_type = "OBJECT"
    settings.instance_object = spark
    settings.particle_size = 1.0
    settings.size_random = 0.7
    settings.use_rotations = False
    emitter.show_instancer_for_render = False
    emitter["model"] = f"embers: v ≈ 80 m/s ± random, gravity weight {GRAVITY_WEIGHT:.3f} (g on the ×{TIME_SCALE:g} clock)"
    return emitter


def build_heat_shimmer(summit_level):
    """A refractive shell over the plug; its normals boil with 4D noise, so the crater rim wobbles behind it."""
    col = collection("Eruption")
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.4, depth=3.0, end_fill_type="NOTHING",
                                        location=(SUMMIT[0], SUMMIT[1], summit_level + 1.3))
    shell = bpy.context.object; shell.name = "Heat_Shimmer"
    _move(shell, col)
    mat = bpy.data.materials.new("Heat_Shimmer"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    refract = nodes.new("ShaderNodeBsdfRefraction"); refract.location = (300, 0)
    refract.inputs["IOR"].default_value = 1.02
    refract.inputs["Roughness"].default_value = 0.0
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-200, -200); noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 6.0; noise.inputs["Detail"].default_value = 3.0
    time = nodes.new("ShaderNodeValue"); time.location = (-400, -350); time.name = "Shimmer_Time"
    links.new(time.outputs[0], noise.inputs["W"])
    bump = nodes.new("ShaderNodeBump"); bump.location = (50, -200)
    bump.inputs["Strength"].default_value = 0.9; bump.inputs["Distance"].default_value = 0.2
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], refract.inputs["Normal"])
    links.new(refract.outputs[0], out.inputs[0])
    shell.data.materials.append(mat)
    for attribute in ("visible_shadow", "visible_diffuse", "visible_glossy", "visible_volume_scatter"):
        setattr(shell, attribute, False)
    end = 1 + int(round(12.0 * FPS))
    time.outputs[0].default_value = 0.0; time.outputs[0].keyframe_insert("default_value", frame=1)
    time.outputs[0].default_value = 12.0 * 1.5; time.outputs[0].keyframe_insert("default_value", frame=end)
    gone = 1 + int(round(PHASE["jet"]["start"] * FPS)) + int(0.5 * FPS)   # once the jet fills the crater, the ash hides it
    shell.hide_render = False; shell.keyframe_insert("hide_render", frame=gone - 1)
    shell.hide_render = True; shell.keyframe_insert("hide_render", frame=gone)
    return shell


def bake_effects():
    with bpy.context.temp_override(scene=bpy.context.scene):
        bpy.ops.ptcache.bake_all(bake=True)


def _blackbody_emission_material(name, kelvin, strength):
    mat = bpy.data.materials.new(name); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    emit = nodes.new("ShaderNodeEmission"); emit.location = (250, 0)
    body = nodes.new("ShaderNodeBlackbody"); body.location = (0, 0)
    body.inputs["Temperature"].default_value = kelvin
    links.new(body.outputs[0], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = strength
    emit.name = "Glow_Strength"
    links.new(emit.outputs[0], out.inputs[0])
    return mat


def build_bomb_trails(result, birth_offset=1):
    """Incandescent streaks behind the bombs, as a long-exposure photograph records them: each trail is the bomb's own
    computed trajectory, drawn for the last TRAIL_SECONDS of flight (screen time) and gone shortly after landing."""
    trail_seconds = 0.35
    col = collection("Ballistic_Bombs")
    material = _blackbody_emission_material("Bomb_Trail", 1150.0, 25.0)
    frames = result["frames"]
    for i in range(frames.shape[0]):
        birth = int(result["birth_frame"][i]) + birth_offset
        landed = int(result["landed_frame"][i]) + birth_offset
        if landed <= birth + 2:
            continue
        points = frames[i, birth - 1:landed]
        curve = bpy.data.curves.new(f"Bomb_Trail_{i + 1:03d}", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = 0.006 + 0.004 * min(1.0, result["diameter_m"][i] / 3.5)   # 0.6–1 m tube: a hot streak, not a pipe
        curve.bevel_resolution = 1
        curve.bevel_factor_mapping_start = curve.bevel_factor_mapping_end = "SPLINE"
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, location in zip(spline.points, points):
            point.co = (*location, 1.0)
        curve.materials.append(material)
        obj = bpy.data.objects.new(f"Bomb_Trail_{i + 1:03d}", curve)
        col.objects.link(obj)
        span = landed - birth
        tail = max(1, int(trail_seconds * FPS))
        curve.bevel_factor_start = curve.bevel_factor_end = 0.0
        curve.keyframe_insert("bevel_factor_start", frame=birth); curve.keyframe_insert("bevel_factor_end", frame=birth)
        for frame in range(birth + 1, landed + tail + 1):
            head = min(1.0, (frame - birth) / span)
            curve.bevel_factor_end = head
            curve.bevel_factor_start = min(head, max(0.0, (frame - birth - tail) / span))
            curve.keyframe_insert("bevel_factor_start", frame=frame); curve.keyframe_insert("bevel_factor_end", frame=frame)
        for attribute in ("visible_shadow", "visible_volume_scatter"):
            setattr(obj, attribute, False)


def build_crater_glow(summit_level):
    """The open conduit after rupture: incandescent magma/pyroclasts (≈ 1000 °C) seen in the crater, and the warm light
    they throw on the base of the column. On at rupture, cooling over the jet phase."""
    col = collection("Eruption")
    rupture = 1 + int(round(PHASE["rupture"]["start"] * FPS))
    fade = 1 + int(round(PHASE["plume"]["end"] * FPS))
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=0.55, fill_type="NGON", location=(SUMMIT[0], SUMMIT[1], summit_level - 0.75))
    disk = bpy.context.object; disk.name = "Crater_Glow"
    _move(disk, col)
    mat = bpy.data.materials.new("Crater_Glow"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    emit = nodes.new("ShaderNodeEmission"); emit.location = (450, 0)
    body = nodes.new("ShaderNodeBlackbody"); body.location = (200, 100); body.inputs["Temperature"].default_value = 1250.0
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-200, -100); noise.inputs["Scale"].default_value = 9.0; noise.inputs["Detail"].default_value = 6.0
    ramp = nodes.new("ShaderNodeMapRange"); ramp.location = (0, -100)
    ramp.inputs["From Min"].default_value = 0.35; ramp.inputs["From Max"].default_value = 0.7
    links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    gain = nodes.new("ShaderNodeMath"); gain.operation = "MULTIPLY"; gain.location = (250, -100); gain.name = "Crater_Gain"
    links.new(ramp.outputs[0], gain.inputs[0])
    links.new(body.outputs[0], emit.inputs["Color"]); links.new(gain.outputs[0], emit.inputs["Strength"])
    links.new(emit.outputs[0], out.inputs[0])
    disk.data.materials.append(mat)
    data = bpy.data.lights.new("Vent_Glow", "POINT"); data.color = (1.0, 0.45, 0.15); data.shadow_soft_size = 0.8
    light = bpy.data.objects.new("Vent_Glow", data); col.objects.link(light)
    light.location = (SUMMIT[0], SUMMIT[1], summit_level + 0.4)
    light.visible_volume_scatter = True   # a warm underglow inside the lowest ash is what the eye reads as "fire"
    for frame, value in ((1, 0.0), (rupture - 1, 0.0), (rupture + 2, 1.0), (rupture + 3 * FPS, 0.6), (fade, 0.15)):
        gain.inputs[1].default_value = 60.0 * value; gain.inputs[1].keyframe_insert("default_value", frame=frame)
        data.energy = 1200.0 * value; data.keyframe_insert("energy", frame=frame)
    return disk
