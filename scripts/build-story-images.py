#!/usr/bin/env python3
"""Download and unify the Long March story images (offline at class time).

Run with:  uv run --with pillow --with numpy python scripts/build-story-images.py
Inputs:    STORIES below (Wikimedia Commons, CC/PD only) + AI images in .cache/story-ai/<node>-<n>.png
Output:    public/media/long-march/<node>-<n>.jpg + stories.json (caption, credit, licence, kind)

Every image gets the same treatment so photos, maps and AI images read as one set:
16:9 1600x900 (maps are fitted, not cropped), warm documentary grade, vignette, light grain.
"""

from __future__ import annotations

import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

PROJECT = Path(__file__).resolve().parents[1]
OUT = PROJECT / "public" / "media" / "long-march"
CACHE = PROJECT / ".cache" / "story-src"
AI = PROJECT / ".cache" / "story-ai"
UA = {"User-Agent": "ai3d-course-builder/1.0 (classroom use)"}
W, H = 1600, 900

# (Commons 文件名, 中文说明, 类型) —— photo 裁成 16:9；map 完整放入
STORIES: dict[str, list[tuple[str, str, str]]] = {
    "yudu": [
        ("File:Yudu Zhongyang Hongjun Changzheng Diyi Dukou 2014.05.30 11-05-37.jpg", "于都 · 中央红军长征第一渡口（东门外渡口）", "photo"),
        ("File:Yudu Zhongyang Hongjun Changzheng Diyi Dukou 2014.05.30 11-09-44.jpg", "于都河畔 · 中央红军长征出发地纪念园", "photo"),
    ],
    "xiangjiang": [
        ("File:中国工农红军红星司令部在抢渡湘江前绘制的地图 03572.jpg", "红星司令部抢渡湘江前绘制的地图（馆藏文物）", "map"),
        ("File:Xiangjiang Campaign Memorial Hall, Quanzhou (20250122171627).jpg", "全州 · 湘江战役纪念馆", "photo"),
    ],
    "zunyi": [
        ("File:遵义会址05189.jpg", "遵义会议会址 · 大门", "photo"),
        ("File:Site of Zunyi Conference (20180220101816).jpg", "遵义会议会址 · 主楼", "photo"),
        ("File:ZunyiMeeting.jpg", "遵义会议会议室", "photo"),
    ],
    "chishui": [
        ("File:Battle of Chishui River-zh.png", "四渡赤水示意图", "map"),
        ("File:Memorial Hall of Red Army Crossing Chishui River Four Times (20260206151449).jpg", "土城 · 四渡赤水纪念馆", "photo"),
        ("File:Chishui River Bank in Maotai(Moutai) Town, Renhuai City, Zunyi, Guizhou.jpg", "茅台镇 · 赤水河", "photo"),
    ],
    "jinsha": [
        ("File:New Jiaopingdu Bridge 2020A.jpg", "皎平渡 · 金沙江（今日的皎平渡大桥）", "photo"),
        ("File:Stone carvings of Mao Zedong's poems near Jiaoping Du.jpg", "皎平渡附近 · 《七律·长征》石刻", "photo"),
    ],
    "luding": [
        ("File:1967-10 红军时期泸定桥.jpg", "红军时期的泸定桥（《人民画报》1967 年刊载）", "photo"),
        ("File:Luding Bridge from the west (20260205115349).jpg", "泸定桥 · 大渡河上的十三根铁索", "photo"),
        ("File:Stele of Battle of Luding Bridge in Luding County, Sichuan, China, 2018.jpg", "飞夺泸定桥纪念碑", "photo"),
    ],
    "jiajin": [
        ("File:夹金山垭口 - panoramio.jpg", "夹金山垭口（海拔 4000 米以上）", "photo"),
        ("File:四川夹金山 - panoramio.jpg", "夹金山", "photo"),
        ("File:夹金山-毛泽东手迹 - panoramio.jpg", "夹金山 · 纪念碑上的毛泽东手迹", "photo"),
    ],
    "grassland": [
        ("File:若尔盖草原风情1.JPG", "若尔盖草原（红军穿越的松潘草地一带）", "photo"),
        ("File:热尔大坝草原Rerdaba grassland - panoramio.jpg", "热尔大坝草原", "photo"),
    ],
    "lazikou": [],
    "wuqi": [],
}
# AI 图：没有可用照片的节点用 AI 生成，统一标注
AI_CAPTIONS = {
    "lazikou": ["腊子口天险（AI 生成·示意图）", "腊子口峡谷（AI 生成·示意图）"],
    "wuqi": ["陕北黄土高原上的吴起镇（AI 生成·示意图）", "红军到达陕北（AI 生成·示意图）"],
}


def commons(title: str) -> dict:
    params = {"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 2000, "format": "json"}
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(6):
        time.sleep(2)
        try:
            page = next(iter(json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))["query"]["pages"].values()))
            return page["imageinfo"][0]
        except Exception:
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(title)


def fetch(url: str, path: Path) -> Image.Image:
    if not path.exists():
        for attempt in range(6):
            try:
                path.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
                break
            except Exception:
                time.sleep(10 * (attempt + 1))
    return Image.open(path).convert("RGB")


def frame(image: Image.Image, kind: str) -> Image.Image:
    if kind == "map":
        canvas = Image.new("RGB", (W, H), (14, 18, 20))
        fitted = image.copy()
        fitted.thumbnail((W - 120, H - 80), Image.LANCZOS)
        canvas.paste(fitted, ((W - fitted.width) // 2, (H - fitted.height) // 2))
        return canvas
    ratio = max(W / image.width, H / image.height)
    resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.LANCZOS)
    left = (resized.width - W) // 2
    top = (resized.height - H) // 2
    return resized.crop((left, top, left + W, top + H))


def grade(image: Image.Image, kind: str) -> Image.Image:
    a = np.asarray(image, dtype=np.float32) / 255
    luma = a @ np.array([.299, .587, .114], dtype=np.float32)
    a = a * .78 + luma[..., None] * .22                     # 略降饱和
    shadows = np.array([.06, .09, .11], dtype=np.float32)    # 暗部偏青
    highlights = np.array([1.04, .98, .9], dtype=np.float32) # 亮部偏暖
    a = shadows * (1 - a) + a * highlights
    a = np.clip((a - .5) * 1.06 + .5, 0, 1)                 # 轻微提对比
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
    a *= (1 - .32 * np.clip(r - .45, 0, 1) ** 1.6)[..., None]  # 暗角
    if kind != "map":
        a += np.random.default_rng(7).normal(0, .012, a.shape[:2])[..., None].astype(np.float32)  # 颗粒
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, list[dict]] = {}
    for node, items in STORIES.items():
        manifest[node] = []
        for index, (title, caption, kind) in enumerate(items):
            info = commons(title)
            meta = info.get("extmetadata", {})
            strip = lambda key: __import__("re").sub("<[^>]+>", "", meta.get(key, {}).get("value", "")).strip()
            source = fetch(info.get("thumburl") or info["url"], CACHE / f"{node}-{index}{Path(urllib.parse.urlparse(info['url']).path).suffix.lower()}")
            name = f"{node}-{index + 1}.jpg"
            grade(frame(source, kind), kind).save(OUT / name, quality=84, optimize=True, progressive=True)
            manifest[node].append({"src": f"media/long-march/{name}", "caption": caption, "kind": kind,
                                   "credit": strip("Artist")[:80] or "Wikimedia Commons", "license": strip("LicenseShortName"),
                                   "url": info["descriptionurl"]})
            print(node, name, kind, strip("LicenseShortName"))
        for index, caption in enumerate(AI_CAPTIONS.get(node, [])):
            path = AI / f"{node}-{index + 1}.png"
            if not path.exists():
                print(node, "AI image missing:", path.name)
                continue
            name = f"{node}-ai-{index + 1}.jpg"
            grade(frame(Image.open(path).convert("RGB"), "photo"), "ai").save(OUT / name, quality=84, optimize=True, progressive=True)
            manifest[node].append({"src": f"media/long-march/{name}", "caption": caption, "kind": "ai", "credit": "AI 生成（本机 FLUX）", "license": "示意图，非历史影像", "url": ""})
    (OUT / "stories.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print("done", sum(len(v) for v in manifest.values()), "images")


if __name__ == "__main__":
    main()
