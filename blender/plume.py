"""Far-field ash column from plume theory (procedural volume shader, no simulation).

Why: a Mantaflow thermal without atmospheric stratification balloons into a mushroom; real Vulcanian columns
rise as a plume whose width grows roughly linearly with height (Morton–Taylor–Turner entrainment, b ≈ 6/5·α·z,
α ≈ 0.1 → half-angle ≈ 7–10°), bend downwind, and carry cauliflower billows that boil upward.
The close-up of the vent keeps the Mantaflow smoke (eruption.py); this column is used for wide shots.

Every shape number is a named Value node, so a class can read them back:
  Plume_Top (column height above the vent, scene units), Plume_Time (seconds, drives the boiling),
  Plume_Spread (radius growth per unit height), Plume_Drift (downwind bending), Plume_Density.
"""

import math

import bpy

from surface import WIND_AZIMUTH
from terrain import SUMMIT
from volcano_config import CONTROLS, ERUPTION, ERUPTION_SECONDS, PHASES, TIME_SCALE, UNIT_METRES
from vdb_asset import find_frames, load_sequence, retime
from volcano_scene import _move, _nodes, collection

FPS = CONTROLS["render"]["fps"]
PHASE = {phase["id"]: phase for phase in PHASES}


class Graph:
    """Tiny helper to write shader math as expressions."""

    def __init__(self, nodes, links):
        self.nodes, self.links, self.x = nodes, links, -1600

    def _node(self, kind, **settings):
        node = self.nodes.new(kind)
        node.location = (self.x, 0)
        self.x += 40
        for key, value in settings.items():
            setattr(node, key, value)
        return node

    def _feed(self, socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            self.links.new(value, socket)

    def math(self, op, a, b=0.0, c=None):
        node = self._node("ShaderNodeMath", operation=op)
        self._feed(node.inputs[0], a)
        self._feed(node.inputs[1], b)
        if c is not None:
            self._feed(node.inputs[2], c)
        return node.outputs[0]

    def value(self, name, default):
        node = self._node("ShaderNodeValue", name=name, label=name)
        node.outputs[0].default_value = default
        return node, node.outputs[0]

    def smoothstep(self, edge0, edge1, x):
        node = self._node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        self._feed(node.inputs["From Min"], edge0)
        self._feed(node.inputs["From Max"], edge1)
        self._feed(node.inputs["Value"], x)
        return node.outputs[0]


def column_material(vent):
    mat = bpy.data.materials.new("Ash_Column_Far"); nodes, links = _nodes(mat)
    g = Graph(nodes, links)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (1400, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (1150, 0)
    vol.inputs["Color"].default_value = (0.42, 0.40, 0.36, 1)
    vol.inputs["Absorption Color"].default_value = (0.03, 0.028, 0.025, 1)
    vol.inputs["Anisotropy"].default_value = 0.2

    geometry = nodes.new("ShaderNodeNewGeometry"); geometry.location = (-1800, 0)
    sep = nodes.new("ShaderNodeSeparateXYZ"); sep.location = (-1700, 0)
    links.new(geometry.outputs["Position"], sep.inputs[0])
    px, py, pz = sep.outputs[0], sep.outputs[1], sep.outputs[2]

    top_node, top = g.value("Plume_Top", 0.0)
    time_node, clock = g.value("Plume_Time", 0.0)
    _, spread = g.value("Plume_Spread", 0.26)      # radius growth per unit height (half-angle ≈ 15°, upper end of MTT for a rough, ash-laden column)
    _, drift_k = g.value("Plume_Drift", 0.06)      # downwind bending: drift = k·(z − 4)^1.45 (≈ 7 units at the top)
    _, base_radius = g.value("Plume_Base_Radius", 1.1)
    density_node, density_gain = g.value("Plume_Density", CONTROLS["ash"]["density"] * 22.0)

    z = g.math("SUBTRACT", pz, vent[2])
    bend = g.math("POWER", g.math("MAXIMUM", g.math("SUBTRACT", z, 4.0), 0.0), 1.45)
    drift = g.math("MULTIPLY", bend, drift_k)
    cx = g.math("MULTIPLY_ADD", drift, math.cos(WIND_AZIMUTH), vent[0])
    cy = g.math("MULTIPLY_ADD", drift, math.sin(WIND_AZIMUTH), vent[1])
    dx, dy = g.math("SUBTRACT", px, cx), g.math("SUBTRACT", py, cy)
    rho = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", dx, dx), g.math("MULTIPLY", dy, dy)))

    radius = g.math("MULTIPLY_ADD", z, spread, base_radius)
    head = g.smoothstep(g.math("SUBTRACT", top, 7.0), top, z)                    # the rising head is ~30 % wider
    radius = g.math("MULTIPLY", radius, g.math("MULTIPLY_ADD", head, 0.3, 1.0))

    # boiling cauliflower: 4D noise advected upward with the flow, strongest near the edge
    rise = nodes.new("ShaderNodeVectorMath"); rise.operation = "SUBTRACT"; rise.location = (-1400, -400)
    links.new(geometry.outputs["Position"], rise.inputs[0])
    lift = nodes.new("ShaderNodeCombineXYZ"); lift.location = (-1500, -500)
    links.new(g.math("MULTIPLY", clock, 1.6), lift.inputs[2])
    links.new(lift.outputs[0], rise.inputs[1])
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-1250, -400); noise.name = "Plume_Billows"
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 0.42
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.58
    links.new(rise.outputs[0], noise.inputs["Vector"])
    links.new(g.math("MULTIPLY", clock, 0.12), noise.inputs["W"])
    lumps = g.math("MULTIPLY", g.math("SUBTRACT", noise.outputs["Fac"], 0.5), 1.3)  # billows along the whole column, not only the head

    profile = g.math("SUBTRACT", 1.0, g.math("DIVIDE", rho, radius))
    shaped = g.smoothstep(0.0, 0.22, g.math("ADD", profile, lumps))           # crisp but irregular silhouette
    # domed head: the top boundary drops by ~4 units from the axis to the edge (a rising thermal cap, not a flat lid)
    ratio = g.math("DIVIDE", rho, radius)
    dome = g.math("MULTIPLY", g.math("MULTIPLY", ratio, ratio), 4.0)
    surface_z = g.math("ADD", g.math("SUBTRACT", z, g.math("MULTIPLY", lumps, 4.0)), dome)
    cap = g.math("SUBTRACT", 1.0, g.smoothstep(g.math("SUBTRACT", top, 2.5), g.math("ADD", top, 1.5), surface_z))
    floor = g.smoothstep(-0.6, 0.6, z)
    density = g.math("MULTIPLY", g.math("MULTIPLY", g.math("MULTIPLY", shaped, cap), floor), density_gain)
    links.new(density, vol.inputs["Density"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat, top_node, time_node, density_node


VDB_BASE_Y = -170.0      # the asset's thin source stem (y −248…−170) is sunk into the conduit: the column body starts at the vent
VDB_HEIGHT = 504.0       # voxel height of the developed plume


def vdb_material():
    mat = bpy.data.materials.new("Ash_Column_VDB"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (400, 0)
    vol.inputs["Color"].default_value = (0.52, 0.48, 0.43, 1)           # sunlit ash scatters grey-brown; shadowed sides stay dark by depth
    vol.inputs["Absorption Color"].default_value = (0.12, 0.11, 0.10, 1)
    vol.inputs["Anisotropy"].default_value = 0.5                          # strong forward scattering: silver rims against the low sun
    attribute = nodes.new("ShaderNodeAttribute"); attribute.location = (-300, 0)
    attribute.attribute_type = "GEOMETRY"; attribute.attribute_name = "density"
    gain = nodes.new("ShaderNodeMath"); gain.location = (100, 0); gain.operation = "MULTIPLY"; gain.name = "Plume_Density"
    # the asset's plume fills its simulation box: fade it inside a noisy envelope so the head is rounded, not sliced
    g = Graph(nodes, links)
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-900, -300)
    sep = nodes.new("ShaderNodeSeparateXYZ"); sep.location = (-750, -300)
    links.new(coords.outputs["Object"], sep.inputs[0])
    wobble = nodes.new("ShaderNodeTexNoise"); wobble.location = (-750, -500)
    wobble.inputs["Scale"].default_value = 0.012; wobble.inputs["Detail"].default_value = 4.0
    links.new(coords.outputs["Object"], wobble.inputs["Vector"])
    jitter = g.math("MULTIPLY", g.math("SUBTRACT", wobble.outputs["Fac"], 0.5), 90.0)
    x, y, z = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    top = g.math("SUBTRACT", 1.0, g.smoothstep(g.math("ADD", 150.0, jitter), 250.0, y))
    rho = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", x, x), g.math("MULTIPLY", z, z)))
    side = g.math("SUBTRACT", 1.0, g.smoothstep(g.math("ADD", 95.0, jitter), 135.0, rho))
    shaped = g.math("MULTIPLY", g.math("MULTIPLY", attribute.outputs["Fac"], top), side)
    links.new(shaped, gain.inputs[0])
    links.new(gain.outputs[0], vol.inputs["Density"])
    # hot fragments light the lowest part of the column from inside (visible at night)
    # emission in a Principled Volume does not scale with density: weight it by the shaped density and keep it to the
    # lowest part of the column, where incandescent fragments are
    glow = nodes.new("ShaderNodeValue"); glow.name = "Ash_Glow"; glow.label = "Ash_Glow"; glow.outputs[0].default_value = 0.0; glow.location = (100, -250)
    low = g.math("SUBTRACT", 1.0, g.smoothstep(-170.0, g.math("ADD", 30.0, jitter), y))
    links.new(g.math("MULTIPLY", g.math("MULTIPLY", glow.outputs[0], shaped), low), vol.inputs["Emission Strength"])
    vol.inputs["Emission Color"].default_value = (1.0, 0.35, 0.08, 1)
    links.new(vol.outputs[0], out.inputs["Volume"])
    return mat, gain


def build_vdb_column(vent):
    """Borrowed EmberGen plume (CC0), grown self-similarly: plume theory gives width ∝ height, so a uniform scale
    of a developed plume is a consistent model of the rising column; height ∝ t^0.75 up to ERUPTION["plume_top_km"]."""
    files = find_frames("jangafx-smoke-plume", pattern="*.vdb")
    files.sort(key=lambda path: int(path.rsplit("_", 1)[1].split(".")[0]))  # unpadded frame numbers
    start = PHASE["rupture"]["start"]
    first = 1 + int(round(start * FPS))
    last = 1 + int(round(ERUPTION_SECONDS * FPS))
    obj = load_sequence("Ash_Column_Far", files, first)
    if obj is None:
        return None
    _move(obj, collection("Eruption"))
    obj.rotation_euler = (math.radians(90), 0, WIND_AZIMUTH)   # asset is Y-up; its lobes face downwind
    retime(obj, [(first, 0), (last, len(files) - 1)])           # 166 asset frames stretched over the clip: big plumes boil slowly
    material, gain = vdb_material()
    obj.data.materials.append(material)
    top_units = ERUPTION["plume_top_km"] * 1000 / UNIT_METRES
    end_scale = top_units / VDB_HEIGHT
    for step in range(0, 25):
        seconds = start + (ERUPTION_SECONDS - start) * step / 24
        frame = 1 + int(round(seconds * FPS))
        scale = max(end_scale * (step / 24) ** 0.75, end_scale * 0.02)
        obj.scale = (scale, scale, scale)
        obj.location = (vent[0], vent[1], vent[2] - VDB_BASE_Y * scale)
        obj.keyframe_insert("scale", frame=frame)
        obj.keyframe_insert("location", frame=frame)
        gain.inputs[1].default_value = 0.025 / scale              # constant optical depth while the column grows
        gain.inputs[1].keyframe_insert("default_value", frame=frame)
    obj.hide_render = True
    obj.keyframe_insert("hide_render", frame=first - 1)
    obj.hide_render = False
    obj.keyframe_insert("hide_render", frame=first)
    obj["source"] = "JangaFX Smoke Plume 01 VDB (EmberGen), CC0 — https://jangafx.com/software/embergen/download/free-vdb-animations/"
    obj["model"] = "self-similar plume: width ∝ height (MTT), top ∝ t^0.75 to plume_top_km"
    obj["time_scale"] = TIME_SCALE
    print(f"[plume] VDB column {len(files)} frames, end scale {end_scale:.4f}, top {ERUPTION['plume_top_km']} km", flush=True)
    return obj


def build_column(summit_level):
    vent = (SUMMIT[0], SUMMIT[1], summit_level - 0.6)
    borrowed = build_vdb_column(vent)
    if borrowed is not None:
        return borrowed
    col = collection("Eruption")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(SUMMIT[0] + 12, SUMMIT[1] + 8, summit_level + 21))
    box = bpy.context.object
    box.name = "Ash_Column_Far"
    box.scale = (90, 80, 46)
    _move(box, col)
    material, top_node, time_node, density_node = column_material(vent)
    box.data.materials.append(material)
    if hasattr(box, "cycles"):
        box.cycles.use_motion_blur = False

    # column height: a starting plume rises ∝ t^(3/4) (buoyancy-flux-driven), here reaching ERUPTION["plume_top_km"]
    start = PHASE["rupture"]["start"]
    top_units = ERUPTION["plume_top_km"] * 1000 / UNIT_METRES
    for step in range(0, 25):
        seconds = start + (ERUPTION_SECONDS - start) * step / 24
        frame = 1 + int(round(seconds * FPS))
        top_node.outputs[0].default_value = top_units * (step / 24) ** 0.75
        top_node.outputs[0].keyframe_insert("default_value", frame=frame)
    top_node.outputs[0].default_value = 0.0
    top_node.outputs[0].keyframe_insert("default_value", frame=1 + int(round(start * FPS)) - 1)
    for frame, seconds in ((1, 0.0), (1 + int(ERUPTION_SECONDS * FPS), ERUPTION_SECONDS)):
        time_node.outputs[0].default_value = seconds
        time_node.outputs[0].keyframe_insert("default_value", frame=frame)
    fallout = PHASE["fallout"]
    for seconds, factor in ((fallout["start"], 1.0), (fallout["end"], 0.75)):   # the column thins as ash falls out
        density_node.outputs[0].default_value = CONTROLS["ash"]["density"] * 22.0 * factor
        density_node.outputs[0].keyframe_insert("default_value", frame=1 + int(round(seconds * FPS)))
    box["model"] = "Morton–Taylor–Turner plume: radius = r0 + 0.26·z, top ∝ t^0.75, downwind drift ∝ z^1.45"
    box["time_scale"] = TIME_SCALE
    return box
