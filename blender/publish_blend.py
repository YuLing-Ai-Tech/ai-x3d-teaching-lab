"""Make the downloadable .blend light (run inside Blender on a rendered scene, after all renders).

  blender public/blender/volcano-classroom.blend --background --python blender/publish_blend.py

The render scene carries a 2.4 M-vertex terrain and a baked ember cache (≈130 MB); the classroom only needs to open,
inspect and edit it. Dense meshes are decimated (planar-aware collapse), point caches are freed, no .blend1 backup is
written. Full-quality renders always rebuild from scripts/build-blender-assets.sh, never from this file.
"""

import bpy

RATIO = 0.06  # terrain ≈ 140 k vertices: opens fast, still shows the cone, collapse scar and section
MIN_VERTICES = 200_000


def main():
    bpy.context.preferences.filepaths.save_version = 0
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and len(obj.data.vertices) > MIN_VERTICES:
            before = len(obj.data.vertices)
            modifier = obj.modifiers.new("Publish_Decimate", "DECIMATE")
            modifier.ratio = RATIO
            with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            print(f"[publish] {obj.name}: {before} → {len(obj.data.vertices)} vertices", flush=True)
        for system in getattr(obj, "particle_systems", []):
            with bpy.context.temp_override(point_cache=system.point_cache):
                bpy.ops.ptcache.free_bake()
    bpy.context.scene["published"] = "lightweight copy: terrain decimated, caches freed; rebuild with scripts/build-blender-assets.sh"
    bpy.ops.wm.save_mainfile(compress=True)
    print("PUBLISH_OK", bpy.data.filepath, flush=True)


if __name__ == "__main__":
    main()
