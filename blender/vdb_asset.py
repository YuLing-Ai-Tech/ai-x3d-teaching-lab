"""Borrowed VDB sequences (JangaFX EmberGen free set, CC0) kept outside git under .cache/assets/.

load_sequence() returns None when the files are missing, so the scene still builds anywhere;
retime() maps scene frames to asset frames (Blender plays a sequence at one asset frame per scene frame,
so speed changes are written as keyframes on frame_offset, linear in between).
"""

import glob
from pathlib import Path

import bpy

ASSETS = Path(__file__).resolve().parents[1] / ".cache" / "assets"


def find_frames(*parts, pattern="*.vdb"):
    folder = ASSETS.joinpath(*parts)
    files = sorted(glob.glob(str(folder / "**" / pattern), recursive=True))
    return files


def load_sequence(name, files, start_frame, hold="EXTEND"):
    if not files:
        print(f"[vdb] {name}: asset missing under {ASSETS}; skipped", flush=True)
        return None
    volume = bpy.data.volumes.new(name)
    volume.filepath = files[0]
    volume.is_sequence = True
    volume.frame_duration = len(files)
    volume.frame_start = start_frame
    volume.sequence_mode = hold
    obj = bpy.data.objects.new(name, volume)
    if hasattr(obj, "cycles"):
        obj.cycles.use_motion_blur = False
    return obj


def retime(obj, keys):
    """keys: [(scene_frame, asset_frame)] → asset index = scene_frame − frame_start + frame_offset."""
    volume = obj.data
    for scene_frame, asset_frame in keys:
        volume.frame_offset = int(round(asset_frame - (scene_frame - volume.frame_start)))
        volume.keyframe_insert("frame_offset", frame=scene_frame)
    action = volume.animation_data.action if volume.animation_data else None
    for curve in getattr(action, "fcurves", []) or []:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
