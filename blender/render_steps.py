#!/usr/bin/env python3
"""Render the five lesson steps: stills, frame sequences and steps.json (run inside Blender).

  blender public/blender/volcano-classroom.blend --background --python blender/render_steps.py -- [--preview] [--only=1,2] [--stills]
Frames go to .cache/volcano-frames/step-N/, stills and steps.json to public/media/blender/.
Every frame is a real Cycles render of the baked scene; nothing is interpolated in post.
"""

import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_lookdev import configure
from volcano_config import CONTROLS, ERUPTION, PHASES, STEPS, TIME_SCALE
from volcano_scene import set_presentation

PROJECT = Path(__file__).resolve().parents[1]
MEDIA = PROJECT / "public" / "media" / "blender"
ROOT_MEDIA = PROJECT / "public" / "media"
FRAMES = PROJECT / ".cache" / "volcano-frames"
ANCHORS = PROJECT / "public" / "blender" / "anchors.json"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
ONLY = next((set(int(v) for v in a.split("=")[1].split(",")) for a in ARGS if a.startswith("--only=")), {1, 2, 3, 4, 5})
STILLS_ONLY = "--stills" in ARGS
PERCENT = 40 if PREVIEW else 66  # upscaled to 1080p by the encoder (lanczos); keeps a full rebuild overnight
SAMPLES = 24 if PREVIEW else 40
FPS = CONTROLS["render"]["fps"]

LABELS = [  # anchor key in anchors.json, text shown in HTML (Chinese), step 4 appearance order
    ("chamber", "岩浆房（晶粥体）"), ("conduit", "火山通道"), ("plug", "岩塞（致密英安岩）"), ("dike", "岩墙"),
    ("sill", "岩床"), ("lava", "熔岩流层"), ("tuff", "火山碎屑层"), ("sediment", "沉积岩层"),
    ("unconformity", "不整合面"), ("basement", "变质基底"), ("alteration", "热液蚀变带"),
]


def magma_emission(strength):
    """Classroom parameter 4 → 9: emission strength scales with its square (so 9 is clearly hotter, not just brighter)."""
    material = bpy.data.materials["Section_Geology"]
    node = material.node_tree.nodes["Magma_Emission_Strength"]
    node.inputs[1].default_value = material["base_gain"] * (strength / 4.0) ** 2
    material["classroom_emission_strength"] = strength
    return node


def set_night(factor):
    world = bpy.context.scene.world
    world.node_tree.nodes["Night_Mix"].inputs[0].default_value = factor
    world["mode"] = "night" if factor >= 0.5 else "day"
    bpy.data.objects["Sun"].data.energy = 6.0 * (1 - factor)
    bpy.data.objects["Sun"]["elevation"] = CONTROLS["sun"]["day_elevation"] + factor * (CONTROLS["sun"]["night_elevation"] - CONTROLS["sun"]["day_elevation"])
    bpy.data.objects["Moon_Fill"].data.energy = 0.06 * factor
    bpy.context.scene.view_settings.exposure = 0.0 + 1.6 * factor
    glow = bpy.data.materials["Ash_Plume"].node_tree.nodes["Ash_Glow"]
    glow.inputs[1].default_value = 0.06 + 0.5 * factor  # lower plume lit from inside by hot fragments at night
    borrowed = bpy.data.materials.get("Ash_Column_VDB")
    if borrowed:
        borrowed.node_tree.nodes["Ash_Glow"].outputs[0].default_value = 0.45 * factor


def plume_mode(mode, cut_frame=None):
    """'cut': simulated smoke until cut_frame, then the plume-theory column (step 2's edit hides the switch);
    'far': the plume-theory column only (continuous shots such as the night clip)."""
    near, far = bpy.data.objects["Ash_Column"], bpy.data.objects["Ash_Column_Far"]
    if far.type == "VOLUME":  # borrowed VDB column: one continuous column for every shot, its own animation stays
        near.animation_data_clear()
        near.hide_render = True
        return
    for obj in (near, far):  # neither object has other animation (the column animates in its material)
        obj.animation_data_clear()
    if mode == "far":
        near.hide_render, far.hide_render = True, False
        return
    for obj, before, after in ((near, False, True), (far, True, False)):
        obj.hide_render = before
        obj.keyframe_insert("hide_render", frame=1)
        obj.hide_render = before
        obj.keyframe_insert("hide_render", frame=cut_frame - 1)
        obj.hide_render = after
        obj.keyframe_insert("hide_render", frame=cut_frame)


def camera_cut(shots):
    """shots: [(first_frame, camera_name)] -> timeline markers bound to cameras (a real edit, one render pass)."""
    scene = bpy.context.scene
    scene.timeline_markers.clear()
    for frame, name in shots:
        marker = scene.timeline_markers.new(name, frame=frame)
        marker.camera = bpy.data.objects[name]
    scene.camera = bpy.data.objects[shots[0][1]]


def render_sequence(step, start, end, every=1):
    directory = FRAMES / f"step-{step}"
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob("frame-*.jpg"):
        old.unlink()
    scene = bpy.context.scene
    began = time.time()
    for index, frame in enumerate(range(start, end + 1, every)):
        scene.frame_set(frame)
        scene.render.filepath = str(directory / f"frame-{index + 1:04d}.jpg")
        bpy.ops.render.render(write_still=True)
    print(f"SEQUENCE step={step} frames={len(range(start, end + 1, every))} seconds={time.time() - began:.0f}", flush=True)


def still(path, frame, camera=None):
    scene = bpy.context.scene
    scene.timeline_markers.clear()
    if camera:
        scene.camera = bpy.data.objects[camera]
    scene.frame_set(frame)
    scene.render.image_settings.file_format = "PNG" if path.suffix == ".png" else "JPEG"
    scene.render.filepath = str(path)
    percent = scene.render.resolution_percentage
    scene.render.resolution_percentage = 100  # stills are posters: full 1920×1080, not the upscaled sequence size
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_percentage = percent
    scene.render.image_settings.file_format = "JPEG"


def label_payload():
    scene = bpy.context.scene
    camera = bpy.data.objects["Camera_Section"]
    scene.camera = camera
    bpy.context.view_layer.update()
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    labels = []
    for index, (key, text) in enumerate(LABELS):
        if key not in anchors:
            continue
        a = anchors[key]
        point = world_to_camera_view(scene, camera, Vector((a["x"], a["y"], a["z"])))
        labels.append({"object": key, "text": text, "anchor": {"x": round(float(point.x), 5), "y": round(float(1 - point.y), 5)}, "appearAtSeconds": round(0.4 + index * 0.32, 2)})
    return labels


def scale_bar(camera_name, metres=1000):
    """Screen positions of a 1 km bar at the summit's distance, for an honest HTML scale reference."""
    scene = bpy.context.scene
    camera = bpy.data.objects[camera_name]
    crater = Vector(json.loads(ANCHORS.read_text(encoding="utf-8"))["crater"].values())
    right = camera.matrix_world.to_3x3() @ Vector((1, 0, 0))
    a = world_to_camera_view(scene, camera, crater)
    b = world_to_camera_view(scene, camera, crater + right * (metres / 100.0))
    return {"metres": metres, "fraction": round(abs(b.x - a.x), 5)}


def step_cuts(step_id):
    """Camera edit of each step's clip: [(first frame, camera)]. Exported so the page can show an honest 1 km bar
    only while a wide camera is on screen (none during the vent close-up)."""
    rupture = 1 + int(round(PHASES[1]["start"] * FPS))
    return {2: [(1, "Camera_Hero"), (rupture - 12, "Camera_Vent"), (rupture + 52, "Camera_Climax")],
            3: [(1, "Camera_Hero")]}.get(step_id, [])


def export_steps(labels):
    end = int(round(12.0 * FPS)) + 1
    kinds = ["camera-transition", "vulcanian-sequence", "day-to-night", "geology-annotations", "orbit"]
    durations = [4, 12, 6, 4, 6]
    steps = []
    for step, kind, duration in zip(STEPS, kinds, durations):
        steps.append({**step, "image": f"./media/blender/step-{step['id']}.jpg", "video": f"./media/blender/step-{step['id']}.mp4",
                      "animation": {"kind": kind, "durationSeconds": duration, "fps": FPS}, "labels": labels if step["id"] == 4 else [],
                      "cuts": [{"seconds": round((frame - 1) / FPS, 3), "camera": name} for frame, name in step_cuts(step["id"])]})
    payload = {
        "generatedBy": f"Blender {bpy.app.version_string} / blender/render_steps.py",
        "controls": CONTROLS, "eruption": ERUPTION, "timeScale": TIME_SCALE,
        "phases": PHASES, "frames": end, "scaleBar": {"Camera_Hero": scale_bar("Camera_Hero"), "Camera_Climax": scale_bar("Camera_Climax")},
        "steps": steps,
    }
    MEDIA.mkdir(parents=True, exist_ok=True)
    (MEDIA / "steps.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def push_in(camera_name, frames, dolly=0.06, lens_to=None):
    camera = bpy.data.objects[camera_name]
    target = Vector(camera["target"])
    start = camera.location.copy()
    camera.keyframe_insert("location", frame=1)
    if lens_to:
        camera.data.keyframe_insert("lens", frame=1)
    camera.location = start + (target - start) * dolly
    camera.keyframe_insert("location", frame=frames)
    if lens_to:
        camera.data.lens = lens_to
        camera.data.keyframe_insert("lens", frame=frames)


def aim(camera_name, target, frame):
    camera = bpy.data.objects[camera_name]
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.keyframe_insert("rotation_euler", frame=frame)


def shock_shake(camera_name, flash_frame, seconds=0.6, degrees=0.35):
    """The blast wave reaches the camera at the speed of sound (340 m/s), on the compressed screen clock:
    the frame jolts once, then rings down. Returns the arrival frame."""
    camera = bpy.data.objects[camera_name]
    crater = Vector(camera["target"])
    distance_m = (camera.location - crater).length * 100.0
    arrival = flash_frame + int(round(distance_m / 340.0 / TIME_SCALE * FPS))
    base = camera.rotation_euler.copy()
    camera.rotation_euler = base
    camera.keyframe_insert("rotation_euler", frame=arrival - 1)
    frames = int(seconds * FPS)
    for i in range(frames + 1):
        decay = math.exp(-4.0 * i / frames)
        kick = math.radians(degrees) * decay
        camera.rotation_euler = (base.x + kick * math.sin(i * 2.3), base.y, base.z + kick * 0.6 * math.sin(i * 3.1 + 1.0))
        camera.keyframe_insert("rotation_euler", frame=arrival + i)
    camera.rotation_euler = base
    camera.keyframe_insert("rotation_euler", frame=arrival + frames + 1)
    camera["shock_arrival"] = f"{distance_m:.0f} m / 340 m/s / {TIME_SCALE:g} → frame {arrival}"
    return arrival


def orbit(camera_name, frames, radius=165.0, height=48.0, centre=(0, 22, -12)):
    camera = bpy.data.objects[camera_name]
    for frame in range(1, frames + 1):
        angle = math.radians(-110 + 120 * (frame - 1) / max(frames - 1, 1))
        camera.location = (centre[0] + math.cos(angle) * radius, centre[1] + math.sin(angle) * radius, height)
        camera.rotation_euler = (Vector(centre) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.keyframe_insert("location", frame=frame)
        camera.keyframe_insert("rotation_euler", frame=frame)


def main():
    configure(SAMPLES, PERCENT)
    scene = bpy.context.scene
    end = int(round(12.0 * FPS)) + 1
    set_presentation("section")
    magma_emission(CONTROLS["magma"]["emission"])
    export_steps(label_payload())
    rupture = 1 + int(round(PHASES[1]["start"] * FPS))

    if 1 in ONLY:  # 把视线说清楚：剖面镜头，35 mm 推进
        set_presentation("section"); camera_cut([(1, "Camera_Section")])
        still(MEDIA / "step-1.jpg", 1, "Camera_Section")
        if not STILLS_ONLY:
            bpy.data.objects["Camera_Section"].data.lens = 30
            push_in("Camera_Section", 4 * FPS, dolly=0.05, lens_to=35)
            render_sequence(1, 1, 4 * FPS)
    if 2 in ONLY:  # 把过程说清楚：蓄压 → 破裂 → 喷流 → 弹道 → 卷吸 → 沉降
        set_presentation("landscape")
        plume_mode("far")
        still(MEDIA / "step-2.jpg", rupture + 60, "Camera_Climax")
        still(ROOT_MEDIA / "blender-volcano-poster.png", rupture + 90, "Camera_Hero")
        if not STILLS_ONLY:
            # cinematic coverage: slow push on the quiet volcano → close on the vent, jolted when the blast wave
            # arrives → wide climax, tilting up with the rising column. The cut waits for the shock (≤ smoke cache end).
            climax_cut = step_cuts(2)[2][0]
            push_in("Camera_Hero", rupture - 12, dolly=0.08)
            push_in("Camera_Vent", climax_cut, dolly=0.05)
            flash = 1 + int(round(PHASES[2]["start"] * FPS))
            arrival = shock_shake("Camera_Vent", flash)
            print(f"SHOCK arrival frame={arrival} cut={climax_cut}", flush=True)
            target = Vector(bpy.data.objects["Camera_Climax"]["target"])
            aim("Camera_Climax", target - Vector((0, 0, 9)), climax_cut)
            aim("Camera_Climax", target + Vector((0, 0, 3)), end - 1)
            camera_cut(step_cuts(2))
            plume_mode("cut", climax_cut)
            render_sequence(2, 1, end - 1)
    if 3 in ONLY:  # 把时间变成参数：同一次喷发，换成夜晚
        set_presentation("landscape"); set_night(1.0); plume_mode("far")
        still(MEDIA / "step-3.jpg", rupture + 48, "Camera_Hero")
        if not STILLS_ONLY:
            camera_cut([(1, "Camera_Hero")])
            render_sequence(3, rupture - 24, rupture - 24 + 6 * FPS - 1)
        set_night(0.0)
    if 4 in ONLY:  # 把知识结构点名：剖面 + HTML 地层标签
        set_presentation("section"); camera_cut([(1, "Camera_Section")])
        bpy.data.objects["Camera_Section"].animation_data_clear()
        bpy.data.objects["Camera_Section"].data.animation_data_clear()
        bpy.data.objects["Camera_Section"].data.lens = 35
        still(MEDIA / "step-4.jpg", 1, "Camera_Section")
        if not STILLS_ONLY:
            render_sequence(4, 1, 4 * FPS, every=4 * FPS)  # the section is static: one real frame, held by the encoder
    if 5 in ONLY:  # 把运镜写成约束：环绕剖面沙盘
        set_presentation("section"); camera_cut([(1, "Camera_Orbit")])
        orbit("Camera_Orbit", 6 * FPS)
        still(MEDIA / "step-5.jpg", 3 * FPS, "Camera_Orbit")
        if not STILLS_ONLY:
            render_sequence(5, 1, 6 * FPS)
    print(f"STEPS_OK steps={sorted(ONLY)} percent={PERCENT} samples={SAMPLES} stills_only={STILLS_ONLY}", flush=True)


if __name__ == "__main__":
    main()
