#!/usr/bin/env bash
# 一键重建 Blender 火山：场景 → 烘焙灰柱 → 五步渲染 → 编码 → 现场修改预演 → 验收。每一步写入耗时。
# 教学五步约 2.2 小时（VOLCANO_RES=192）；加 CINEMATIC=1 另渲电影版约 5 小时；快速检查：VOLCANO_RES=96 scripts/build-blender-assets.sh --preview
# 借用素材（JangaFX VDB、Poly Haven）放在 .cache/assets/，缺少时自动退回程序化灰柱与天空
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
blender_bin="${BLENDER_BIN:-/opt/homebrew/bin/blender}"
log_dir="$repo_root/.cache/volcano-build"
mkdir -p "$log_dir"
preview_flag="${1:-}"
timer() { local name="$1"; shift; local start; start=$(date +%s); "$@"; echo "STAGE $name $(( $(date +%s) - start ))s" | tee -a "$log_dir/timing.txt"; }
: > "$log_dir/timing.txt"

res="${VOLCANO_RES:-256}"  # Mantaflow resolution; 256 ≈ 3 h bake on M5 Max, 128 ≈ 5 min
timer build bash -c "'$blender_bin' --background --python blender/build_volcano.py -- $preview_flag --res=$res 2>&1 | tee '$log_dir/build.log' | grep -E 'build|BUILD_OK'"
grep -q "BUILD_OK" "$log_dir/build.log"
timer bake bash -c "'$blender_bin' public/blender/volcano-classroom.blend --background --python blender/bake_plume.py 2>&1 | tee '$log_dir/bake.log' | grep -E 'BAKE_OK'"
timer render bash -c "'$blender_bin' public/blender/volcano-classroom.blend --background --python blender/render_steps.py -- $preview_flag 2>&1 | tee '$log_dir/render.log' | grep -E 'SEQUENCE|STEPS_OK'"
grep -q "STEPS_OK" "$log_dir/render.log"
timer encode python3 scripts/build-blender-videos.py
timer live_edit bash -c "'$blender_bin' public/blender/volcano-classroom.blend --background --python blender/live_edit.py 2>&1 | grep LIVE_EDIT_OK"
if [ "${CINEMATIC:-0}" = "1" ]; then  # 电影版（约 5 小时）：同一次喷发的多机位剪辑
  timer cinematic bash -c "'$blender_bin' public/blender/volcano-classroom.blend --background --python blender/cinematic.py 2>&1 | grep -E '^SHOT|CINEMATIC_OK'"
  timer cinematic_cut python3 scripts/build-blender-cinematic.py
fi
# 渲染全部结束后才发布轻量 .blend（地形抽稀、清缓存），供课堂打开与修改
for blend in public/blender/volcano-classroom.blend public/blender/volcano-live-edited.blend; do
  timer publish bash -c "'$blender_bin' '$blend' --background --python blender/publish_blend.py 2>&1 | grep -E 'PUBLISH_OK|publish\]'"
done
rm -f public/blender/*.blend1
timer verify python3 scripts/build-blender-verify.py
cat "$log_dir/timing.txt"
