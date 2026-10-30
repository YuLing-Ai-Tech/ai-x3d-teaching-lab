"""Blender scene assembly: meshes from numpy fields, images, materials, world, lights, cameras.

Two presentations share one .blend:
  * Landscape (Terrain_Full, sky, atmosphere): environment, vent close-up and climax shots.
  * Section (Terrain_Section + Section_Face + walls, studio): the museum cut-away, cut on y = 0.
`set_presentation("landscape" | "section")` toggles visibility, world mix and lights.
"""

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from geology import X_MAX, X_MIN, Z_BOTTOM, Z_TOP
from terrain import EXTENT, SUMMIT
from volcano_config import CONTROLS

PROJECT = Path(__file__).resolve().parents[1]
TEXTURES = PROJECT / "public" / "blender" / "textures"
TABLE_Z = Z_BOTTOM - 0.6


# ---------------------------------------------------------------- images
def save_image(name, array, path, alpha=False):
    """array: (rows, cols, 3|1) float in 0..1, row 0 = TOP. Saved to disk and linked relatively."""
    rows, cols = array.shape[:2]
    data = np.flipud(array.reshape(rows, cols, -1))
    channels = data.shape[2]
    rgba = np.ones((rows, cols, 4), np.float32)
    rgba[..., :3] = data[..., :3] if channels >= 3 else np.repeat(data[..., :1], 3, axis=2)
    image = bpy.data.images.new(name, cols, rows, alpha=alpha, float_buffer=False)
    image.pixels.foreach_set(rgba.ravel())
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.file_format = "JPEG" if path.suffix == ".jpg" else "PNG"
    try:
        image.save(quality=92)
    except TypeError:
        image.save()
    image.filepath = str(path)  # made relative when the .blend is saved (relative_remap)
    return image


def linear_to_srgb(rgb):
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055)


# ---------------------------------------------------------------- meshes
def grid_mesh(name, positions, uvs, collection):
    """positions: (rows, cols, 3); uvs: (rows, cols, 2). Quads between neighbouring samples."""
    rows, cols = positions.shape[:2]
    mesh = bpy.data.meshes.new(name)
    mesh.vertices.add(rows * cols)
    mesh.vertices.foreach_set("co", positions.reshape(-1).astype(np.float32))
    r, c = np.meshgrid(np.arange(rows - 1), np.arange(cols - 1), indexing="ij")
    v0 = (r * cols + c).ravel()
    quads = np.stack([v0, v0 + 1, v0 + cols + 1, v0 + cols], axis=1)
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set("vertex_index", quads.ravel().astype(np.int32))
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
    mesh.polygons.foreach_set("loop_total", np.full(len(quads), 4, np.int32))
    mesh.polygons.foreach_set("use_smooth", np.ones(len(quads), bool))
    uv = mesh.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", uvs.reshape(-1, 2)[quads.ravel()].ravel().astype(np.float32))
    mesh.update(calc_edges=True)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def detail_heightfield(field, factor=2, seed=20261029):
    """Upsample the eroded field and add metre-scale roughness (scoria, blocks), stronger on steep ground."""
    from terrain import fbm, upsample
    n = (field["height"].shape[0] - 1) * factor + 1
    h = upsample(field["height"].astype(np.float64), n)
    slope = upsample(field["slope"].astype(np.float64), n)
    lava = upsample(field["lava"].astype(np.float64), n)
    rough = fbm(n, seed + 41, base=160, octaves=4)
    ridged = (1 - np.abs(fbm(n, seed + 43, base=90, octaves=5))) ** 3  # sharp rock ribs and gully walls
    blocks = np.abs(fbm(n, seed + 42, base=420, octaves=2))
    steep = np.clip(slope - 0.25, 0, 1.0)
    h = h + 0.02 * rough + 0.22 * steep * (ridged - 0.3) + 0.08 * lava * blocks
    return np.linspace(-EXTENT, EXTENT, n), h


def build_terrain_meshes(field, materials, factor=2):
    axis, h = detail_heightfield(field, factor)
    X, Y = np.meshgrid(axis, axis, indexing="xy")
    uv = np.dstack([(X + EXTENT) / (2 * EXTENT), (Y + EXTENT) / (2 * EXTENT)])
    landscape = collection("Landscape")
    full = grid_mesh("Terrain_Full", np.dstack([X, Y, h]), uv, landscape)
    full.data.materials.append(materials["terrain"])

    section = collection("Section")
    half = axis >= -1e-9
    top = grid_mesh("Terrain_Section", np.dstack([X[half], Y[half], h[half]]), uv[half], section)
    top.data.materials.append(materials["terrain"])

    # cut face on y = 0: columns follow the terrain profile, rows go down to the block floor
    profile = h[np.argmin(np.abs(axis))]
    levels = 260
    t = np.linspace(0, 1, levels)[:, None]
    zz = Z_BOTTOM + (profile[None, :] - Z_BOTTOM) * t  # rows bottom -> top
    face_pos = np.dstack([np.broadcast_to(axis, zz.shape), np.full(zz.shape, -0.002), zz])
    face_uv = np.dstack([np.broadcast_to((axis - X_MIN) / (X_MAX - X_MIN), zz.shape), (zz - Z_BOTTOM) / (Z_TOP - Z_BOTTOM)])
    face = grid_mesh("Section_Face", face_pos, face_uv, section)  # rows bottom -> top: normals face -y (the camera)
    face.data.materials.append(materials["section"])

    walls = []
    ys = axis[half]
    for name, xs_wall, ys_wall, prof in (
        ("Wall_East", np.full_like(ys, EXTENT), ys, h[half][:, -1]),
        ("Wall_West", np.full_like(ys, -EXTENT), ys, h[half][:, 0]),
        ("Wall_North", axis, np.full_like(axis, EXTENT), h[-1]),
    ):
        zz = Z_BOTTOM + (prof[None, :] - Z_BOTTOM) * t
        pos = np.dstack([np.broadcast_to(xs_wall, zz.shape), np.broadcast_to(ys_wall, zz.shape), zz])
        along = (ys_wall if name != "Wall_North" else xs_wall)
        wuv = np.dstack([np.broadcast_to((along - X_MIN) / (X_MAX - X_MIN), zz.shape), (zz - Z_BOTTOM) / (Z_TOP - Z_BOTTOM)])
        if name in ("Wall_West", "Wall_North"):  # keep every wall's normal pointing outwards
            pos, wuv = pos[:, ::-1], wuv[:, ::-1]
        wall = grid_mesh(name, pos, wuv, section)
        wall.data.materials.append(materials["wall"])
        walls.append(wall)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, EXTENT / 2, TABLE_Z + 0.3))
    plinth = bpy.context.object
    plinth.name = "Section_Plinth"
    plinth.scale = (2 * EXTENT + 1.6, EXTENT + 1.6, 0.6)
    plinth.location.y = EXTENT / 2 - 0.4
    _move(plinth, section)
    plinth.data.materials.append(materials["plinth"])
    bpy.ops.mesh.primitive_plane_add(size=1600, location=(0, 0, TABLE_Z))
    table = bpy.context.object
    table.name = "Studio_Table"
    _move(table, section)
    table.data.materials.append(materials["table"])
    return full, top, face, walls


def _move(obj, target):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


# ---------------------------------------------------------------- materials
def _nodes(material):
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    return tree.nodes, tree.links


def _image_node(nodes, image, colorspace, location):
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.image.colorspace_settings.name = colorspace
    node.interpolation = "Cubic"
    node.location = location
    return node


def _blackbody_emission(nodes, links, heat_socket, gain_name, gain, location, base_c=700.0, span_c=550.0):
    """Emission colour from a physical temperature (°C -> K); strength ∝ heat^3 so cool rock stays dark."""
    x, y = location
    temp = nodes.new("ShaderNodeMath"); temp.operation = "MULTIPLY_ADD"; temp.location = (x, y)
    temp.inputs[1].default_value = span_c
    temp.inputs[2].default_value = base_c + 273.15
    links.new(heat_socket, temp.inputs[0])
    body = nodes.new("ShaderNodeBlackbody"); body.location = (x + 180, y)
    links.new(temp.outputs[0], body.inputs[0])
    power = nodes.new("ShaderNodeMath"); power.operation = "POWER"; power.location = (x, y - 160)
    power.inputs[1].default_value = 3.0
    links.new(heat_socket, power.inputs[0])
    strength = nodes.new("ShaderNodeMath"); strength.operation = "MULTIPLY"; strength.name = gain_name; strength.label = gain_name
    strength.location = (x + 180, y - 160)
    strength.inputs[1].default_value = gain
    links.new(power.outputs[0], strength.inputs[0])
    return body.outputs[0], strength.outputs[0]


ROCK = PROJECT / ".cache" / "assets" / "polyhaven" / "aerial_rocks_02"
ROCK_TILE_UNITS = 2.0  # aerial photo of rocky ground: one repeat ≈ 200 m, its gullies and blocks read in the close-up
ROCK_MEAN_LUMINANCE = 0.13  # measured linear mean of the photo: luminance / mean modulates around 1


def _rock_detail(nodes, links, base_color):
    """Photographed rocky ground (Poly Haven "Aerial Rocks 02", CC0) on top of the measured albedo: the large-scale colour still
    comes from the terrain model; the photo adds rock-scale variation and a normal map. Box-projected, no UVs needed."""
    if not (ROCK / "aerial_rocks_02_diff_2k.jpg").exists():
        return None
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-900, 600)
    mapping = nodes.new("ShaderNodeMapping"); mapping.location = (-700, 600)
    mapping.inputs["Scale"].default_value = (1 / ROCK_TILE_UNITS,) * 3
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    def image(name, space, y):
        node = nodes.new("ShaderNodeTexImage"); node.location = (-450, y)
        node.image = bpy.data.images.load(str(ROCK / name)); node.image.colorspace_settings.name = space
        node.projection = "BOX"; node.projection_blend = 0.3
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node
    diff = image("aerial_rocks_02_diff_2k.jpg", "sRGB", 600)
    nor = image("aerial_rocks_02_nor_gl_2k.jpg", "Non-Color", 300)
    grey = nodes.new("ShaderNodeRGBToBW"); grey.location = (-250, 650)   # only the photo's light and shade; colour stays the model's
    links.new(diff.outputs["Color"], grey.inputs[0])
    gain = nodes.new("ShaderNodeMath"); gain.location = (-100, 600); gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = 1.0 / ROCK_MEAN_LUMINANCE
    links.new(grey.outputs[0], gain.inputs[0])
    mix = nodes.new("ShaderNodeMix"); mix.location = (0, 500); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.name = "Rock_Detail"
    mix.inputs[0].default_value = 0.65
    links.new(base_color, mix.inputs[6]); links.new(gain.outputs[0], mix.inputs[7])
    normal = nodes.new("ShaderNodeNormalMap"); normal.location = (-200, 300)
    normal.inputs["Strength"].default_value = 1.2
    links.new(nor.outputs["Color"], normal.inputs["Color"])
    return {"color": mix.outputs[2], "normal": normal.outputs["Normal"]}


def build_materials(images, magma_gain):
    materials = {}

    mat = bpy.data.materials.new("Terrain_Surface"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (600, 0)
    albedo = _image_node(nodes, images["surface_albedo"], "sRGB", (0, 200))
    props = _image_node(nodes, images["surface_props"], "Non-Color", (0, -150))
    sep = nodes.new("ShaderNodeSeparateColor"); sep.location = (250, -150)
    links.new(props.outputs[0], sep.inputs[0])
    links.new(albedo.outputs[0], bsdf.inputs["Base Color"])
    links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    rock = _rock_detail(nodes, links, albedo.outputs[0])
    if rock:
        links.new(rock["color"], bsdf.inputs["Base Color"])
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-400, -450)
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (-200, -450)
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.62
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump"); bump.location = (350, -450)
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if rock:
        links.new(rock["normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    color, strength = _blackbody_emission(nodes, links, sep.outputs[0], "Lava_Emission_Strength", 0.35, (250, -700), base_c=650, span_c=450)
    links.new(color, bsdf.inputs["Emission Color"])
    links.new(strength, bsdf.inputs["Emission Strength"])
    links.new(bsdf.outputs[0], out.inputs[0])
    materials["terrain"] = mat

    mat = bpy.data.materials.new("Section_Geology"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (600, 0)
    albedo = _image_node(nodes, images["section_albedo"], "sRGB", (0, 200))
    props = _image_node(nodes, images["section_props"], "Non-Color", (0, -150))
    sep = nodes.new("ShaderNodeSeparateColor"); sep.location = (250, -150)
    links.new(props.outputs[0], sep.inputs[0])
    links.new(albedo.outputs[0], bsdf.inputs["Base Color"])
    links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump"); bump.location = (350, -400)
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.05
    links.new(sep.outputs[2], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    color, strength = _blackbody_emission(nodes, links, sep.outputs[0], "Magma_Emission_Strength", magma_gain, (250, -650))
    links.new(color, bsdf.inputs["Emission Color"])
    links.new(strength, bsdf.inputs["Emission Strength"])
    links.new(bsdf.outputs[0], out.inputs[0])
    mat["classroom_emission_strength"] = 4.0
    mat["base_gain"] = magma_gain
    materials["section"] = mat

    mat = bpy.data.materials.new("Section_Wall"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (400, 0)
    albedo = _image_node(nodes, images["wall_albedo"], "sRGB", (0, 100))
    links.new(albedo.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.88
    links.new(bsdf.outputs[0], out.inputs[0])
    materials["wall"] = mat

    for name, rgb, rough in (("plinth", (0.012, 0.012, 0.013), 0.45), ("table", (0.006, 0.0065, 0.007), 0.32)):
        mat = bpy.data.materials.new(f"Studio_{name.title()}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = rough
        materials[name] = mat
    return materials


# ---------------------------------------------------------------- world, lights, cameras
def build_world(sun_elevation):
    world = bpy.data.worlds.get("World_Nishita") or bpy.data.worlds.new("World_Nishita")
    bpy.context.scene.world = world
    nodes, links = _nodes(world)
    out = nodes.new("ShaderNodeOutputWorld"); out.location = (900, 0)
    sky = nodes.new("ShaderNodeTexSky"); sky.location = (0, 200); sky.name = "Sky"
    for attribute, value in (("sky_type", "MULTIPLE_SCATTERING"), ("sun_disc", False), ("altitude", 300.0), ("air_density", 1.2), ("dust_density", 2.5)):
        if hasattr(sky, attribute):
            setattr(sky, attribute, value)
    if hasattr(sky, "sun_elevation"):
        sky.sun_elevation = math.radians(sun_elevation)
        sky.sun_rotation = math.radians(CONTROLS["sun"]["azimuth"])
    sky_bg = nodes.new("ShaderNodeBackground"); sky_bg.location = (250, 200)
    sky_bg.inputs["Strength"].default_value = 0.018  # Blender 5 multiple-scattering sky is far brighter than the old Nishita
    links.new(sky.outputs[0], sky_bg.inputs[0])
    hdri_path = PROJECT / ".cache" / "assets" / "polyhaven" / "hdri" / CONTROLS["sun"]["hdri"]
    if hdri_path.exists():
        # photographed golden-hour sky (Poly Haven, CC0), turned so its sun sits where the Sun lamp is
        env = nodes.new("ShaderNodeTexEnvironment"); env.location = (-200, 450); env.name = "Sky_HDRI"
        env.image = bpy.data.images.load(str(hdri_path))
        coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-600, 450)
        mapping = nodes.new("ShaderNodeMapping"); mapping.location = (-400, 450)
        # equirect u = −atan2(y, x)/2π + 0.5, so azimuth_u = −atan2(y, x); the lamp's sun direction is (sin r, −cos r)
        rot = math.radians(CONTROLS["sun"]["azimuth"])
        lamp_az = -math.degrees(math.atan2(-math.cos(rot), math.sin(rot)))
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(lamp_az - CONTROLS["sun"]["hdri_sun_azimuth"]))
        links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], sky_bg.inputs["Color"])
        sky_bg.inputs["Strength"].default_value = 0.5
        world["sky"] = f"Poly Haven {CONTROLS['sun']['hdri']} (CC0)"
    night = nodes.new("ShaderNodeBackground"); night.location = (250, 0); night.name = "Night_Sky"
    night.inputs["Color"].default_value = (0.004, 0.006, 0.014, 1)
    night.inputs["Strength"].default_value = 1.0
    night_mix = nodes.new("ShaderNodeMixShader"); night_mix.location = (480, 100); night_mix.name = "Night_Mix"
    night_mix.inputs[0].default_value = 0.0
    links.new(sky_bg.outputs[0], night_mix.inputs[1]); links.new(night.outputs[0], night_mix.inputs[2])
    studio = nodes.new("ShaderNodeBackground"); studio.location = (480, -150); studio.name = "Studio_Background"
    studio.inputs["Color"].default_value = (0.006, 0.008, 0.011, 1)
    studio.inputs["Strength"].default_value = 1.0
    studio_mix = nodes.new("ShaderNodeMixShader"); studio_mix.location = (700, 0); studio_mix.name = "Studio_Mix"
    links.new(night_mix.outputs[0], studio_mix.inputs[1]); links.new(studio.outputs[0], studio_mix.inputs[2])
    links.new(studio_mix.outputs[0], out.inputs[0])
    world["mode"] = "day"
    return world


def build_lights(sun_elevation):
    lights = collection("Lights")
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 6.0
    sun_data.angle = math.radians(0.6)
    sun_data.color = (1.0, 0.86, 0.68)  # low sun: longer air path, warmer light
    sun = bpy.data.objects.new("Sun", sun_data)
    lights.objects.link(sun)
    sun.rotation_euler = (math.radians(90 - sun_elevation), 0, math.radians(CONTROLS["sun"]["azimuth"]))  # low side/back light: relief and billows read in depth
    sun["elevation"] = sun_elevation
    sun.visible_glossy = False
    for name, location, energy, size, color in (
        ("Studio_Key", (-90, -110, 70), 3.2e5, 60, (1.0, 0.95, 0.88)),
        ("Studio_Fill", (110, -80, 10), 0.7e5, 80, (0.75, 0.85, 1.0)),
        ("Rim_Light", (0, 160, 60), 1.6e5, 90, (0.8, 0.88, 1.0)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size, data.color = energy, size, color
        obj = bpy.data.objects.new(name, data)
        lights.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 20, -10)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        obj.visible_glossy = False
    moon = bpy.data.lights.new("Moon_Fill", "SUN")
    moon.energy, moon.color, moon.angle = 0.0, (0.55, 0.65, 1.0), math.radians(1.5)
    moon_obj = bpy.data.objects.new("Moon_Fill", moon)
    lights.objects.link(moon_obj)
    moon_obj.rotation_euler = (math.radians(60), 0, math.radians(30))


def camera(name, location, target, lens, sensor=36.0):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = sensor
    data.clip_start = 0.05
    data.clip_end = 2000
    obj = bpy.data.objects.new(name, data)
    collection("Cameras").objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    obj["target"] = list(target)
    return obj


def build_cameras(summit_level):
    crater = (SUMMIT[0], SUMMIT[1], summit_level)
    return {
        "Camera_Hero": camera("Camera_Hero", (78, 32, 7.0), (-3, 1, 21.0), 24),
        "Camera_Section": camera("Camera_Section", (SUMMIT[0], -126, 6), (SUMMIT[0], 0, -13.5), 35),
        "Camera_Vent": camera("Camera_Vent", (SUMMIT[0] + 13, -15, summit_level + 9.5), (crater[0], crater[1], crater[2] - 0.6), 70),
        "Camera_Climax": camera("Camera_Climax", (44, -56, 3.0), (SUMMIT[0], 0, 30), 24),
        "Camera_Orbit": camera("Camera_Orbit", (-110, -120, 45), (0, 22, -10), 35),
    }


def set_presentation(mode):
    section = mode == "section"
    for name, hide in (("Landscape", section), ("Section", not section)):
        col = bpy.data.collections.get(name)
        if col:
            col.hide_render = hide
            col.hide_viewport = hide
    world = bpy.context.scene.world
    world.node_tree.nodes["Studio_Mix"].inputs[0].default_value = 1.0 if section else 0.0
    for name in ("Studio_Key", "Studio_Fill", "Rim_Light"):
        bpy.data.objects[name].hide_render = not section
    atmosphere = bpy.data.objects.get("Atmosphere")
    if atmosphere:
        atmosphere.hide_render = section
    bpy.context.scene["presentation"] = mode


def build_atmosphere():
    """Aerial perspective: a thin, height-falling-off scattering volume over the landscape."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 30))
    box = bpy.context.object
    box.name = "Atmosphere"
    box.scale = (420, 420, 70)
    _move(box, collection("Landscape"))
    mat = bpy.data.materials.new("Atmosphere_Haze"); nodes, links = _nodes(mat)
    out = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    vol = nodes.new("ShaderNodeVolumePrincipled"); vol.location = (400, 0)
    vol.inputs["Color"].default_value = (0.62, 0.72, 0.86, 1)
    vol.inputs["Anisotropy"].default_value = 0.35
    coords = nodes.new("ShaderNodeTexCoord"); coords.location = (-400, 0)
    sep = nodes.new("ShaderNodeSeparateXYZ"); sep.location = (-200, 0)
    links.new(coords.outputs["Object"], sep.inputs[0])
    falloff = nodes.new("ShaderNodeMapRange"); falloff.location = (0, 0)
    falloff.inputs["From Min"].default_value = -0.5
    falloff.inputs["From Max"].default_value = 0.5
    falloff.inputs["To Min"].default_value = 0.0021  # thicker low haze: depth and scale read like a long-lens photograph
    falloff.inputs["To Max"].default_value = 0.00005
    links.new(sep.outputs["Z"], falloff.inputs["Value"])
    links.new(falloff.outputs[0], vol.inputs["Density"])
    links.new(vol.outputs[0], out.inputs["Volume"])
    box.data.materials.append(mat)
    return box


def build_grade():
    """Cinematic finish in the compositor: bloom only on what is really bright (flash, incandescent ejecta, magma),
    a soft vignette and a hint of lens dispersion. Nothing here changes what the scene shows."""
    scene = bpy.context.scene
    group = bpy.data.node_groups.new("Cinematic_Grade", "CompositorNodeTree")
    group.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    nodes, links = group.nodes, group.links
    layers = nodes.new("CompositorNodeRLayers"); layers.location = (-900, 0)
    glare = nodes.new("CompositorNodeGlare"); glare.location = (-650, 0); glare.name = "Bloom"
    glare.inputs["Type"].default_value = "Bloom"
    glare.inputs["Threshold"].default_value = 1.4
    glare.inputs["Strength"].default_value = 0.55
    glare.inputs["Size"].default_value = 0.6
    links.new(layers.outputs["Image"], glare.inputs["Image"])
    lens = nodes.new("CompositorNodeLensdist"); lens.location = (-420, 0)
    lens.inputs["Dispersion"].default_value = 0.006
    links.new(glare.outputs["Image"], lens.inputs["Image"])
    mask = nodes.new("CompositorNodeEllipseMask"); mask.location = (-650, -300)
    mask.inputs["Size"].default_value = (0.92, 0.82)
    blur = nodes.new("CompositorNodeBlur"); blur.location = (-420, -300)
    blur.inputs["Size"].default_value = (260, 260)
    links.new(mask.outputs["Mask"], blur.inputs["Image"])
    dark = nodes.new("ShaderNodeMix"); dark.location = (-200, -120); dark.data_type = "RGBA"; dark.blend_type = "MULTIPLY"
    dark.inputs[0].default_value = 1.0
    dark.inputs[7].default_value = (0.62, 0.62, 0.64, 1)
    links.new(lens.outputs["Image"], dark.inputs[6])
    vignette = nodes.new("ShaderNodeMix"); vignette.location = (50, 0); vignette.data_type = "RGBA"; vignette.name = "Vignette"
    links.new(blur.outputs["Image"], vignette.inputs[0])
    links.new(dark.outputs[2], vignette.inputs[6])
    links.new(lens.outputs["Image"], vignette.inputs[7])
    out = nodes.new("NodeGroupOutput"); out.location = (300, 0)
    links.new(vignette.outputs[2], out.inputs[0])
    scene.compositing_node_group = group
    return group
