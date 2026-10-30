#!/bin/zsh
# 为缺少授权照片的长征节点生成 AI 示意图（本机 mflux + FLUX.2-klein-4B，首次运行会下载约 16GB 模型）。
# 统一风格：1930 年代纪录片照片、暖灰调、远景、无可辨认人脸；生成后由 build-story-images.py 统一调色并标注“AI 生成·示意图”。
set -e
export PATH=/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH
cd "$(dirname "$0")/.."
OUT=.cache/story-ai
STYLE="documentary photograph, 1930s China, muted warm grey tones, soft natural light, film grain, wide establishing shot, realistic, no text, no modern objects"
gen() { # name seed prompt
  [ -f "$OUT/$1.png" ] && { echo "skip $1"; return; }
  mflux-generate-flux2 --model flux2-klein-4b --steps 4 --width 1600 --height 896 --seed "$2" \
    --prompt "$3, $STYLE" --output "$OUT/$1.png"
}
gen lazikou-1 11 "Lazikou pass in southern Gansu: an extremely narrow limestone gorge about 30 metres wide, sheer vertical cliffs hundreds of metres high on both sides, a fast mountain river at the bottom, a small wooden plank bridge across the river at the gorge mouth"
gen lazikou-2 23 "view looking up inside the Lazikou gorge, towering grey cliffs almost closing the sky, pine trees clinging to rock ledges, mist, a narrow mountain trail beside a rushing stream"
gen wuqi-1 202 "Loess Plateau village in northern Shaanxi: a vertical yellow loess cliff face with a row of five arched cave-dwelling entrances (yaodong) dug directly into the earth, each arch with wooden lattice windows and a small wooden door, flat packed-earth courtyard in front, dry loess gullies and terraced hills behind, late autumn, no brick houses, no tiled roofs"
gen wuqi-2 41 "a long column of tired soldiers in grey uniforms seen from far away walking along a loess ridge at sunset, tiny distant silhouettes carrying a red flag, vast yellow loess hills, northern Shaanxi 1935"
ls -la "$OUT"
