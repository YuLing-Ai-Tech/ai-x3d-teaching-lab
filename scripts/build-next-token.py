#!/usr/bin/env python3
"""Bake real next-token probabilities from a local LLM (offline at class time).

Run with:  uv run --with mlx-lm python scripts/build-next-token.py [model_dir]
Default model: LM Studio's Qwen3.8-27B-MLX-4bit. Output: public/data/next-token.json
Each step stores the top-8 candidates and their probabilities; the greedy choice is appended.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import mlx.core as mx
from mlx_lm import load

MODEL = Path.home() / ".lmstudio/models/lmstudio-community/Qwen3.8-27B-MLX-4bit"
PROMPTS = [
    ("古诗", "床前明月光，疑是地上", 4),
    ("古诗", "大漠孤烟直，长河", 4),
    ("物理", "牛顿第二定律的公式是 F =", 4),
    ("英语", "The capital of France is", 4),
    ("数学", "勾股定理：直角三角形中，a² + b² =", 4),
    ("开放", "在人工智能时代，学生最重要的能力是", 8),
]


def main() -> None:
    model_dir = sys.argv[1] if len(sys.argv) > 1 else str(MODEL)
    model, tokenizer = load(model_dir)
    out = {"model": Path(model_dir).name, "prompts": []}
    for label, prompt, steps in PROMPTS:
        ids = tokenizer.encode(prompt)
        record = {"label": label, "prompt": prompt, "steps": []}
        for _ in range(steps):
            logits = model(mx.array([ids]))[:, -1, :].astype(mx.float32)
            probs = mx.softmax(logits, axis=-1)[0]
            top = mx.argsort(-probs)[:8].tolist()
            candidates = [{"token": tokenizer.decode([i]), "p": round(probs[i].item(), 4)} for i in top]
            record["steps"].append(candidates)
            ids.append(top[0])
        record["completion"] = "".join(step[0]["token"] for step in record["steps"])
        out["prompts"].append(record)
        print(f"[{label}] {prompt} → {record['completion']!r}   first: {[(c['token'], c['p']) for c in record['steps'][0][:4]]}")
    path = Path(__file__).resolve().parents[1] / "public" / "data" / "next-token.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(path)


if __name__ == "__main__":
    main()
