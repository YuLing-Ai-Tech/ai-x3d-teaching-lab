"""Exterior surface maps from the heightfield (pure numpy, no bpy).

Albedo is driven by measurable terrain properties, not painted by hand:
  elevation + slope -> vegetation belt vs bare scoria/ash; flow accumulation -> greener, darker gullies;
  distance + downwind direction -> fresh ash mantle; crater -> hydrothermal staining;
  lava mask -> dark blocky crust; lava front -> incandescent cracks (heat map).
"""

import numpy as np

from terrain import SUMMIT, fbm, smoothstep, upsample

WIND_AZIMUTH = 0.35  # ash drifts towards +x (east-north-east); also used by the plume wind


def surface_maps(field, size=4096, seed=20261029):
    n = field["height"].shape[0]
    up = lambda a: upsample(a.astype(np.float64), size) if a.shape[0] != size else a.astype(np.float64)
    h, slope, flow, lava, front = (up(field[key]) for key in ("height", "slope", "flow", "lava", "lava_front"))
    axis = np.linspace(-60, 60, size)
    x, y = np.meshgrid(axis, axis, indexing="xy")
    dx, dy = x - SUMMIT[0], y - SUMMIT[1]
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    patches = fbm(size, seed + 31, base=24, octaves=5)
    fine = fbm(size, seed + 32, base=220, octaves=3)
    wet = smoothstep(2.0, 40.0, flow * (n / 513) ** 2)

    soil = np.array([0.062, 0.050, 0.038])
    ash_old = np.array([0.062, 0.056, 0.050])       # weathered tephra: dark grey-brown (albedo ≈ 0.05–0.07)
    ash_fresh = np.array([0.085, 0.078, 0.070])     # fresh andesitic ash: still darker than concrete (albedo ≈ 0.08)
    scoria = np.array([0.10, 0.045, 0.03])
    rock = np.array([0.05, 0.048, 0.046])
    forest = np.array([0.022, 0.03, 0.014])
    grass = np.array([0.06, 0.062, 0.03])
    lava_crust = np.array([0.03, 0.029, 0.03])
    sulphur = np.array([0.30, 0.25, 0.09])

    # vegetation belt: below ~800 m relief, not on steep walls, thinning upslope and in fresh ash
    veg = smoothstep(8.5, 3.5, h) * smoothstep(0.85, 0.35, slope) * np.clip(0.55 + 0.7 * patches + 0.5 * wet, 0, 1)
    forest_mix = np.clip(smoothstep(0.35, 0.75, veg) * (0.6 + 0.6 * fbm(size, seed + 33, base=60, octaves=3)), 0, 1)
    vegetation = grass[None, None] * (1 - forest_mix[..., None]) + forest[None, None] * forest_mix[..., None]

    bare = soil * (1 - smoothstep(4, 12, h)[..., None]) + ash_old * smoothstep(4, 12, h)[..., None]
    bare = bare * (1 - smoothstep(0.7, 1.1, slope)[..., None]) + rock * smoothstep(0.7, 1.1, slope)[..., None]
    near_summit = (1 - smoothstep(3, 7, r)) * (h > 12)
    bare = bare * (1 - near_summit[..., None]) + scoria * near_summit[..., None]

    downwind = np.clip(np.cos(theta - WIND_AZIMUTH), 0, 1) ** 2
    ash = np.clip(np.exp(-(r / 11.0) ** 2) + 0.55 * downwind * np.exp(-(r / 26.0) ** 2), 0, 1) * (0.75 + 0.35 * patches)
    color = bare * (1 - veg[..., None]) + vegetation * veg[..., None]
    color = color * (1 - 0.35 * wet[..., None]) + np.array([0.05, 0.06, 0.03]) * 0.35 * wet[..., None] * (h < 8)[..., None]
    color = color * (1 - ash[..., None] * 0.7) + ash_fresh * ash[..., None] * 0.7

    in_crater = 1 - smoothstep(0.9, 1.6, r)
    stain = in_crater * np.clip(2.0 * fbm(size, seed + 34, base=90, octaves=3) - 0.1, 0, 1)  # fumarole patches, not a coat
    color = color * (1 - stain[..., None] * 0.7) + sulphur * stain[..., None] * 0.7

    blocky = 0.75 + 0.5 * (fine > 0.05)
    oxid = np.array([0.09, 0.045, 0.03]) * (fine[..., None] > 0.35)
    lava_rgb = lava_crust * blocky[..., None] + oxid
    color = color * (1 - lava[..., None]) + lava_rgb * lava[..., None]

    color *= (0.85 + 0.3 * fine)[..., None]
    cracks = (np.abs(fbm(size, seed + 35, base=140, octaves=2)) < 0.05).astype(np.float64)
    heat = np.clip(front * cracks * 1.4 + front * 0.12, 0, 1) * lava
    roughness = np.clip(0.92 - 0.25 * wet - 0.1 * lava, 0.4, 1)
    return {"albedo": np.clip(color, 0, 1).astype(np.float32), "heat": heat.astype(np.float32), "roughness": roughness.astype(np.float32)}
