#!/usr/bin/env python3
"""Cinematic cut of the same deterministic eruption (run inside Blender), separate from the five lesson steps.

  blender public/blender/volcano-classroom.blend --background --python blender/cinematic.py -- [--preview] [--only=1,3] [--every=N]
Frames go to .cache/cinematic/shot-N/; scripts/build-blender-cinematic.py cuts them into public/media/volcano-cinematic.mp4.

The eruption is shown from several angles, as an eruption sequence in a film would be: every shot replays a window of the
same simulation clock (×5 compressed), so ballistics, shock arrival and column growth stay consistent between shots.
"""

import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_lookdev import configure
from terrain import SUMMIT
from volcano_config import CONTROLS, PHASES, TIME_SCALE
from volcano_scene import set_presentation
from render_steps import magma_emission, set_night

PROJECT = Path(__file__).resolve().parents[1]
OUT = PROJECT / ".cache" / "cinematic"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
ONLY = next((set(int(v) for v in a.split("=")[1].split(",")) for a in ARGS if a.startswith("--only=")), {1, 2, 3, 4, 6, 7, 8})  # 5 was cut after the preview
EVERY = next((int(a.split("=")[1]) for a in ARGS if a.startswith("--every=")), 1)
FPS = CONTROLS["render"]["fps"]
WIDTH, HEIGHT = 1920, 804          # 2.39:1 scope
PERCENT = 34 if PREVIEW else 100    # final: native 1920×804, no upscaling
SAMPLES = 16 if PREVIEW else 32     # + OpenImageDenoise

PHASE = {phase["id"]: phase for phase in PHASES}
frame_at = lambda seconds: 1 + int(round(seconds * FPS))
RUPTURE, FLASH, END = frame_at(PHASE["rupture"]["start"]), frame_at(PHASE["flash"]["start"]), frame_at(12.0)


def ground(x, y):
    """Terrain height under (x, y): ray-cast the landscape meshes only (the haze box is a mesh too)."""
    best = 0.0
    for obj in bpy.data.collections["Landscape"].all_objects:
        if obj.type != "MESH" or obj.name == "Atmosphere":
            continue
        inverse = obj.matrix_world.inverted()
        origin, direction = inverse @ Vector((x, y, 500)), (inverse.to_3x3() @ Vector((0, 0, -1))).normalized()
        hit, location, *_ = obj.ray_cast(origin, direction)
        if hit:
            best = max(best, (obj.matrix_world @ location).z)
    return best


def make_camera(name, lens):
    data = bpy.data.cameras.new(name); data.lens = lens; data.sensor_width = 36.0
    data.clip_start = 0.05; data.clip_end = 3000
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def look(camera, position, target, roll=0.0):
    camera.location = Vector(position)
    q = (Vector(target) - camera.location).to_track_quat("-Z", "Y")
    camera.rotation_euler = q.to_euler()
    camera.rotation_euler.rotate_axis("Z", math.radians(roll))


def ease(t):
    return t * t * (3 - 2 * t)


def shake(t, start, seconds, degrees):
    """Decaying jolt (radians on two axes) when a pressure wave reaches the camera."""
    if t < start or t > start + seconds:
        return 0.0, 0.0
    k = (t - start) / seconds
    amp = math.radians(degrees) * math.exp(-4.0 * k)
    return amp * math.sin(k * 55.0), amp * 0.6 * math.sin(k * 71.0 + 1.0)


def summit_point(dz=0.0):
    return Vector((SUMMIT[0], SUMMIT[1], bpy.context.scene["summit_level"] + dz))


def shots():
    top = summit_point()
    shock_arrival = lambda position: FLASH + (Vector(position) - top).length * 100.0 / 340.0 / TIME_SCALE * FPS
    flank = Vector((SUMMIT[0] - 17.0, SUMMIT[1] - 15.0, 0)); flank.z = ground(flank.x, flank.y) + 0.25
    foot = Vector((SUMMIT[0] + 13.0, SUMMIT[1] - 11.0, 0)); foot.z = ground(foot.x, foot.y) + 0.35
    foot_near = Vector((SUMMIT[0] + 7.0, SUMMIT[1] - 6.5, 0)); foot_near.z = ground(foot_near.x, foot_near.y) + 0.25
    section_eye = Vector(bpy.data.objects["Camera_Section"].location)
    section_target = Vector(bpy.data.objects["Camera_Section"]["target"])
    return [
        # 1 黎明：航拍滑向沉睡的火山（模拟时间停在蓄压前）
        dict(title="dawn", lens=35, frames=5 * FPS, clock=lambda t: 20,
             pose=lambda t: (Vector((96, -70, 7)).lerp(Vector((52, -38, 5.5)), ease(t)), top + Vector((0, 0, 1.5)), -1.5 + 1.5 * t)),
        # 2 内部：剖开火山，岩浆房与火山通道里的岩浆在破裂时刻发亮
        dict(title="inside", lens=26, frames=4 * FPS, section=True, clock=lambda t: 36 + t * (RUPTURE + 20 - 36),
             magma=lambda t: 4.0 + 9.0 * ease(t),   # the conduit heats up towards the rupture
             pose=lambda t: (section_eye.lerp(section_target, 0.04 + 0.12 * ease(t)), section_target + Vector((0, 0, 2.0 + 2.0 * t)), 0)),
        # 3 破裂：喷口近景，闪光，冲击波到达时镜头一震
        dict(title="rupture", lens=60, frames=3 * FPS, clock=lambda t: RUPTURE - 4 + t * 3 * FPS,
             pose=lambda t: (top + Vector((11, -13, 6)), top + Vector((0, 0, 1.0 + 3.0 * t)), 0),
             jolt=lambda t, clock, pos: shake(clock, shock_arrival(pos), 0.6 * FPS, 0.6)),
        # 4 冲击：在山顶高度的空中，尘环沿山坡向四周滚开
        dict(title="shock", lens=32, frames=int(3.5 * FPS), clock=lambda t: FLASH + t * 3.5 * FPS,
             pose=lambda t: (top + Vector((-24, -20, 3.0)).lerp(Vector((-22, -18.5, 2.6)), t), top + Vector((0, 0, -2.0)), 0),
             jolt=lambda t, clock, pos: shake(clock, shock_arrival(pos), 0.8 * FPS, 0.8)),
        # 5 火山弹：站在弹道落区边上的山坡，炽热的火山弹从头顶划过、砸起尘土
        dict(title="ejecta", lens=35, frames=int(3.5 * FPS), clock=lambda t: FLASH + 10 + t * 3.5 * FPS,
             pose=lambda t: (foot_near, top + Vector((0, 0, 3.0 + 1.0 * t)), 1.5)),
        # 6 灰柱：山脚仰拍，镜头随柱顶上抬
        dict(title="column", lens=20, frames=5 * FPS, clock=lambda t: 150 + t * 120,
             pose=lambda t: (foot, top + Vector((0, 0, 8 + 16 * ease(t))), -2.0)),
        # 7 全景：航拍拉远，灰柱高耸在大地之上
        dict(title="panorama", lens=28, frames=6 * FPS, clock=lambda t: min(END, 200 + t * 140),
             pose=lambda t: (Vector((26, -30, 16)).lerp(Vector((78, -86, 34)), ease(t)), top + Vector((0, 0, 13)), 0)),
        # 8 夜幕：同一次喷发换成夜晚，炽热火山弹划出弧线
        dict(title="night", lens=40, frames=5 * FPS, night=True, clock=lambda t: FLASH - 2 + t * 5 * FPS,
             pose=lambda t: (top + Vector((30, -27, 2.5)).lerp(Vector((27, -24.5, 2.3)), t), top + Vector((0, 0, 3.5)), 0)),
    ]


def main():
    configure(SAMPLES, PERCENT)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    scene.timeline_markers.clear()
    set_presentation("landscape")
    lapilli = bpy.data.collections.get("Tephra_Lapilli")
    if lapilli is not None:  # sub-metre stones: at film resolution they only read as specks of dirt in the sky
        lapilli.hide_render = True
    ash = bpy.data.objects.get("Ash_Column")
    if ash is not None and bpy.data.objects["Ash_Column_Far"].type == "VOLUME":
        ash.animation_data_clear(); ash.hide_render = True
    all_shots = shots()
    for index, shot in enumerate(all_shots, start=1):
        if ONLY and index not in ONLY:
            continue
        set_night(1.0 if shot.get("night") else 0.0)
        set_presentation("section" if shot.get("section") else "landscape")
        magma_emission(9.0 if shot.get("section") else CONTROLS["magma"]["emission"])
        camera = make_camera(f"Cine_{index}_{shot['title']}", shot["lens"])
        scene.camera = camera
        folder = OUT / f"shot-{index}"
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("frame-*.jpg"):
            old.unlink()
        began = time.time()
        for i in range(0, shot["frames"], EVERY):
            t = i / max(shot["frames"] - 1, 1)
            clock = shot["clock"](t)
            scene.frame_set(int(clock), subframe=clock - int(clock))
            if "magma" in shot:
                magma_emission(shot["magma"](t))
            position, target, roll = shot["pose"](t)
            look(camera, position, target, roll)
            if "jolt" in shot:
                dx, dz = shot["jolt"](t, clock, position)
                camera.rotation_euler.x += dx; camera.rotation_euler.z += dz
            scene.render.filepath = str(folder / f"frame-{i + 1:04d}.jpg")
            bpy.ops.render.render(write_still=True)
        print(f"SHOT {index} {shot['title']} frames={shot['frames']} every={EVERY} seconds={time.time() - began:.0f}", flush=True)
    print(f"CINEMATIC_OK percent={PERCENT} samples={SAMPLES}", flush=True)


if __name__ == "__main__":
    main()
