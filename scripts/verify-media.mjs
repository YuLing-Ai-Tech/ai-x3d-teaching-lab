import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const videos = [
  ["public/media/long-march-demo.mp4", 60],
  ["public/media/conic-demo.mp4", 60],
  ["public/media/membrane-demo.mp4", 60],
  ...["embedding", "next-token", "compiler", "poem", "preposition", "gravity", "molecule", "dna", "geo"]
    .map((route) => [`public/media/${route}-demo.mp4`, 15]),
  ["public/media/blender-volcano-demo.mp4", 18],
  ["public/media/blender-live-edit-demo.mp4", 18],
  ["public/media/volcano-cinematic.mp4", 25],
  ...[1, 2, 3, 4, 5].map((step) => [`public/media/blender/step-${step}.mp4`, step === 5 ? 5.9 : 3.9]),
];

const required = [
  "public/blender/volcano-classroom.blend",
  "public/blender/volcano-live-edited.blend",
  "public/media/blender-volcano-poster.png",
  "public/media/blender-live-edit-preview.png",
  "public/media/blender/steps.json",
  "public/media/long-march-event-poster.png",
  "public/data/china-outline.json",
  "docs/讲师稿.md",
  "docs/课堂应急卡.md",
  "docs/来源与边界.md",
  "docs/生成记录.md",
];

const failures = required.filter((path) => !existsSync(path)).map((path) => `${path}: missing`);
for (const [path, minimumDuration] of videos) {
  if (!existsSync(path)) {
    failures.push(`${path}: missing`);
    continue;
  }
  const raw = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,pix_fmt:format=duration",
    "-of", "json", path,
  ], { encoding: "utf8" });
  const info = JSON.parse(raw);
  const stream = info.streams?.[0];
  const duration = Number(info.format?.duration);
  if (stream?.codec_name !== "h264") failures.push(`${path}: codec is ${stream?.codec_name}`);
  if (stream?.width !== 1920 || stream?.height !== 1080) failures.push(`${path}: resolution is ${stream?.width}x${stream?.height}`);
  if (stream?.pix_fmt !== "yuv420p") failures.push(`${path}: pixel format is ${stream?.pix_fmt}`);
  if (!Number.isFinite(duration) || duration < minimumDuration) failures.push(`${path}: duration is ${duration}s`);
  console.log(`${path}: h264 ${stream?.width}x${stream?.height} ${duration.toFixed(2)}s`);
}

if (failures.length) {
  console.error("media verification failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("media verification passed: twelve Web videos, seven Blender videos, and required artifacts");
