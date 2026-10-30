# Third-party notices

The authoritative dependency versions are the committed `package.json` and `package-lock.json`. Asset-level records and checksums are in `assets/manifest.json`.

## Direct runtime dependencies

| Package | Version | License |
|---|---:|---|
| `@deck.gl/core`, `@deck.gl/geo-layers`, `@deck.gl/layers` | 9.4.0 | MIT |
| `maplibre-contour` | 0.1.1 | BSD-3-Clause |
| `maplibre-gl` | 6.14.0 | BSD-3-Clause |
| `qrcode` | 1.5.4 | MIT |
| `qrcode-terminal` | 0.12.0 | Apache-2.0 |
| `three` | 0.180.0 | MIT |

Development dependencies are limited to TypeScript, Vite, Vitest, Playwright, public type packages, TopoJSON and World Atlas; their locked versions and licenses remain available through the package lock and installed package metadata.

## Public teaching data

- BAAI/bge-m3: MIT model; used locally to generate the committed teaching embeddings. <https://huggingface.co/BAAI/bge-m3>
- Qwen3 family: Apache-2.0 open-weight family; only locally generated token probabilities are committed, not model weights. <https://github.com/QwenLM/Qwen3>
- RDKit: BSD-3-Clause; used locally to generate molecule conformers. <https://github.com/rdkit/rdkit/blob/master/license.txt>
- NIST Chemistry WebBook: the committed table is a small attributed factual extract. NIST SRD terms and disclaimers remain authoritative. <https://www.nist.gov/open/license>

## Local-only assets

Map boundaries, classroom media, Blend files, VDB/HDRI archives and other large inputs stay outside the public repository until each file has a completed redistribution review. Their teaching provenance is described in `docs/来源与边界.md`.

