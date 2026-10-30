#!/usr/bin/env python3
"""Bake the “word universe”: real bge-m3 embeddings (via local Ollama) projected to 3D.

Run with:  uv run --with numpy --with scikit-learn python scripts/build-embeddings.py
Needs:     ollama serve + `ollama pull bge-m3`
Output:    public/data/embeddings.json

除了三维（t-SNE）坐标，还把每个词的 1024 维向量按 int8 量化存下来（每个向量一个缩放系数，base64），
浏览器就能在原始 1024 维里计算任意两词的余弦相似度和任意 A − B + C 类比。
所有相似度、近邻、类比都用“量化后再还原”的向量计算，与浏览器端（src/domain/embedding.ts）完全一致。
"""

from __future__ import annotations

import base64
import json
import urllib.request
from pathlib import Path

import numpy as np
from sklearn.manifold import TSNE

GROUPS = {
    "动物": [("猫", "cat"), ("狗", "dog"), ("老虎", "tiger"), ("狮子", "lion"), ("鸟", "bird"), ("鱼", "fish"), ("马", "horse")],
    "人物": [("国王", "king"), ("王后", "queen"), ("男人", "man"), ("女人", "woman"), ("王子", "prince"), ("公主", "princess")],
    "学科": [("数学", "mathematics"), ("物理", "physics"), ("化学", "chemistry"), ("生物", "biology"), ("历史", "history"), ("地理", "geography")],
    "情感": [("快乐", "happy"), ("悲伤", "sad"), ("愤怒", "angry"), ("恐惧", "fear"), ("爱", "love")],
    "城市国家": [("北京", "Beijing"), ("中国", "China"), ("东京", "Tokyo"), ("日本", "Japan"), ("巴黎", "Paris"), ("法国", "France"), ("伦敦", "London"), ("英国", "Britain")],
    "颜色": [("红色", "red"), ("蓝色", "blue"), ("绿色", "green"), ("黄色", "yellow")],
    "数字": [("一", "one"), ("二", "two"), ("三", "three"), ("十", "ten"), ("一百", "hundred")],
    "食物": [("苹果", "apple"), ("米饭", "rice"), ("面条", "noodles"), ("咖啡", "coffee")],
    "天体": [("太阳", "sun"), ("月亮", "moon"), ("地球", "earth"), ("星星", "star")],
    "语言": [("诗", "poem"), ("语言", "language"), ("文字", "writing"), ("代码", "code"), ("公式", "formula")],
}
# (A, B, C, 期望答案)：A − B + C 应该接近谁。期望答案由人写下，页面用它判断“命中”与否，不再写死结论。
ANALOGIES = [
    ("国王", "男人", "女人", "王后"), ("king", "man", "woman", "queen"), ("东京", "日本", "中国", "北京"),
    ("Paris", "France", "Japan", "Tokyo"), ("王子", "男人", "女人", "公主"),
    ("巴黎", "法国", "日本", "东京"), ("伦敦", "英国", "法国", "巴黎"), ("prince", "man", "woman", "princess"),
]
# 只用来打印、帮助挑选课堂例子的候选类比（不写进 JSON）
CANDIDATES = [
    ("Beijing", "China", "Japan", "Tokyo"), ("London", "Britain", "China", "Beijing"), ("dog", "狗", "猫", "cat"),
    ("red", "红色", "蓝色", "blue"), ("二", "一", "二", "三"), ("太阳", "地球", "月亮", "星星"),
    ("国王", "王子", "公主", "王后"), ("快乐", "爱", "恐惧", "悲伤"), ("king", "国王", "王后", "queen"),
]


def quantise(vectors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """每个向量单独缩放：q = round(v / s)，s = max|v| / 127。"""
    scales = np.abs(vectors).max(axis=1) / 127
    return np.clip(np.rint(vectors / scales[:, None]), -127, 127).astype(np.int8), scales


def dequantise(q: np.ndarray, scales: np.ndarray) -> np.ndarray:
    v = q.astype(np.float64) * scales[:, None]
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def analogy(vectors: np.ndarray, ia: int, ib: int, ic: int) -> tuple[list[int], np.ndarray]:
    target = vectors[ia] - vectors[ib] + vectors[ic]
    scores = vectors @ (target / np.linalg.norm(target))
    return [int(j) for j in np.argsort(-scores, kind="stable") if j not in (ia, ib, ic)], scores


def embed(texts: list[str]) -> np.ndarray:
    request = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=json.dumps({"model": "bge-m3", "input": texts}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=300) as response:
        vectors = np.array(json.load(response)["embeddings"], dtype=np.float64)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def main() -> None:
    words, groups, pairs = [], [], []
    for group, items in GROUPS.items():
        for zh, en in items:
            pairs.append((len(words), len(words) + 1))
            words += [zh, en]
            groups += [group, group]
    raw = embed(words)
    q, scales = quantise(raw)
    vectors = dequantise(q, scales)
    print("quantisation: max |cos(raw, int8)| error", float(np.max(1 - np.sum(raw * vectors, axis=1))))
    similarity = vectors @ vectors.T
    print("max |similarity(raw) - similarity(int8)|", float(np.abs(raw @ raw.T - similarity).max()))
    neighbours = [[int(j) for j in np.argsort(-similarity[i], kind="stable") if j != i][:5] for i in range(len(words))]
    coords = TSNE(n_components=3, perplexity=8, init="pca", random_state=7, max_iter=3000).fit_transform(raw)
    coords = (coords - coords.mean(axis=0)) / np.abs(coords).max() * 9
    coords = np.round(coords, 3)
    analogies = []
    for a, b, c, expected in ANALOGIES + CANDIDATES:
        ia, ib, ic, ie = (words.index(w) for w in (a, b, c, expected))
        ranked, scores = analogy(vectors, ia, ib, ic)
        raw_ranked, _ = analogy(raw, ia, ib, ic)
        rank = ranked.index(ie) + 1 if ie in ranked else None
        flag = "" if raw_ranked[:3] == ranked[:3] else f"  (float top-3 {[words[j] for j in raw_ranked[:3]]})"
        print(f"{'preset' if (a, b, c, expected) in ANALOGIES else 'cand  '} {a} - {b} + {c} = {words[ranked[0]]} ({scores[ranked[0]]:.3f}), then {words[ranked[1]]}, {words[ranked[2]]}; expected {expected} rank {rank} ({scores[ie]:.3f}){flag}")
        if (a, b, c, expected) in ANALOGIES:
            analogies.append({"a": ia, "b": ib, "c": ic, "result": ranked[0], "runnerUp": ranked[1], "score": round(float(scores[ranked[0]]), 3), "expected": ie, "expectedRank": rank})
    pair_sim = [round(float(similarity[i, j]), 3) for i, j in pairs]
    upper = similarity[np.triu_indices(len(words), 1)]
    mean_all = round(float(upper.mean()), 3)
    print("mean zh/en pair similarity", round(float(np.mean(pair_sim)), 3), "vs mean all", mean_all, "min/max all", round(float(upper.min()), 3), round(float(upper.max()), 3))
    # 课堂例子：猫的三组对比
    cat = words.index("猫")
    distance = np.linalg.norm(coords[:, None, :] - coords[None, :, :], axis=2)
    for other in ("cat", "狗", "数学", "dog", "老虎", "fish"):
        j = words.index(other)
        rank_hd = [k for k in np.argsort(-similarity[cat], kind="stable") if k != cat].index(j) + 1
        rank_3d = [k for k in np.argsort(distance[cat], kind="stable") if k != cat].index(j) + 1
        print(f"猫–{other}: cos {similarity[cat, j]:.3f} (rank {rank_hd})  3D {distance[cat, j]:.2f} (rank {rank_3d})")
    # 图上的远近可信吗：全局相关与局部近邻保留率
    iu = np.triu_indices(len(words), 1)
    print("corr(3D distance, cos)", round(float(np.corrcoef(distance[iu], similarity[iu])[0, 1]), 3))
    keep = np.mean([len(set(neighbours[i]) & set([k for k in np.argsort(distance[i], kind="stable") if k != i][:5])) / 5 for i in range(len(words))])
    print("5-NN preserved in 3D", round(float(keep), 3))
    # 3D 里远、1024 维却挺像 / 3D 里近、1024 维不太像 的例子
    order = np.argsort(-similarity[iu])
    far_but_similar = [(words[iu[0][k]], words[iu[1][k]], round(float(similarity[iu][k]), 3), round(float(distance[iu][k]), 2)) for k in order if distance[iu][k] > 8][:8]
    print("far in 3D but similar:", far_but_similar)
    near_low = sorted([(round(float(distance[iu][k]), 2), words[iu[0][k]], words[iu[1][k]], round(float(similarity[iu][k]), 3)) for k in range(len(iu[0])) if similarity[iu][k] < mean_all])[:8]
    print("near in 3D but below mean similarity:", near_low)
    out = {
        "model": "bge-m3 (1024 维)",
        "words": [{"text": w, "group": g, "xyz": [float(v) for v in coords[i]], "near": neighbours[i]} for i, (w, g) in enumerate(zip(words, groups))],
        "pairs": [{"zh": i, "en": j, "similarity": s} for (i, j), s in zip(pairs, pair_sim)],
        "analogies": analogies,
        "meanSimilarity": mean_all,
        "vectors": {
            "dim": int(q.shape[1]),
            "encoding": "int8 每向量缩放（值 = q × scale），base64；使用前重新归一化",
            "scales": [float(f"{s:.6g}") for s in scales],
            "data": [base64.b64encode(row.tobytes()).decode() for row in q],
        },
    }
    path = Path(__file__).resolve().parents[1] / "public" / "data" / "embeddings.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(path, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
