"""Geological cross-section on the cut plane y = 0, painted in numpy (no bpy).

Returns per-pixel albedo, heat (0..1, drives blackbody emission), roughness and relief (bump),
plus the world-space anchors of every named structure for the HTML labels.
Scale: 1 unit = 100 m, x in [-60, 60], z in [Z_BOTTOM, Z_TOP]. Vertical scale is true (1:1).

Structures, bottom to top:
  gneiss basement (foliated) -> folded, faulted sedimentary sequence -> angular unconformity
  -> volcanic pile of lens-shaped lava flows and pyroclastic beds that pinch out down-flank
  -> soil. Intrusions: older diorite pluton, crystal-mush magma reservoir with a crystallised
  carapace and contact aureole, en-echelon dikes, a sill, the active conduit capped by a dense
  dacite plug, and a hydrothermal alteration halo around the upper conduit.
"""

import math

import numpy as np

from terrain import SUMMIT, fbm, smoothstep

Z_BOTTOM = -45.0
Z_TOP = 17.0
X_MIN, X_MAX = -60.0, 60.0

ROCK = {
    "air": 0, "soil": 1, "tuff": 2, "lava": 3, "scoria": 4, "sediment": 5, "basement": 6, "pluton": 7,
    "dike": 8, "magma": 9, "mush": 10, "plug": 11,
}

SEDIMENT_COLORS = [  # linear albedo, bottom to top; muted like weathered outcrop, not a textbook legend
    (0.20, 0.12, 0.085),  # red mudstone
    (0.30, 0.25, 0.18),   # sandstone
    (0.105, 0.10, 0.095), # black shale
    (0.30, 0.29, 0.26),   # limestone
    (0.24, 0.205, 0.16),  # siltstone
    (0.13, 0.12, 0.11),   # shale
    (0.33, 0.27, 0.19),   # cross-bedded sandstone
    (0.19, 0.16, 0.13),   # conglomerate
]


def noise1d(x, seed, scale, octaves=4):
    rng = np.random.RandomState(seed)
    out = np.zeros_like(x)
    amp, norm = 1.0, 0.0
    for octave in range(octaves):
        freq = scale * 2 ** octave
        knots = rng.uniform(-1, 1, int((X_MAX - X_MIN) * freq) + 3)
        t = (x - X_MIN) * freq
        i = np.clip(np.floor(t).astype(int), 0, len(knots) - 2)
        f = t - i
        f = f * f * (3 - 2 * f)
        out += amp * (knots[i] * (1 - f) + knots[i + 1] * f)
        norm += amp
        amp *= 0.5
    return out / norm


def field2d(shape, seed, base, octaves=5):
    """fbm on a non-square grid by cropping a square one."""
    n = max(shape)
    return fbm(n, seed, base=base, octaves=octaves)[: shape[0], : shape[1]]


def build_section(surface_x, surface_z, width=4096, seed=20261029, volcanic=True):
    height = int(round(width * (Z_TOP - Z_BOTTOM) / (X_MAX - X_MIN)))
    xs = np.linspace(X_MIN, X_MAX, width)
    zs = np.linspace(Z_TOP, Z_BOTTOM, height)  # row 0 = top
    X, Z = np.meshgrid(xs, zs)
    S = np.interp(xs, surface_x, surface_z)[None, :]
    if not volcanic:  # far walls: a gentle regional surface, no edifice
        S = (0.8 + 0.6 * noise1d(xs, seed + 90, 0.05))[None, :]
    grain = field2d(X.shape, seed + 1, base=180, octaves=3)
    warp = field2d(X.shape, seed + 2, base=14, octaves=5)
    rock = np.zeros(X.shape, np.int8)
    albedo = np.zeros(X.shape + (3,), np.float32)
    heat = np.zeros(X.shape, np.float32)
    rough = np.full(X.shape, 0.85, np.float32)
    relief = np.zeros(X.shape, np.float32)
    below = Z <= S

    # --- basement and sediments ------------------------------------------------------------
    B = -21 + 2.2 * noise1d(xs, seed + 3, 0.04)[None, :]
    P = -1.4 + 0.9 * noise1d(xs, seed + 4, 0.03)[None, :]  # unconformity / pre-volcanic land surface
    fold = 2.6 * np.sin(X * 0.055 + 0.8) + 1.1 * np.sin(X * 0.13 + 2.1) + 0.012 * X * 6
    swell = field2d(X.shape, seed + 7, base=5, octaves=3)  # layers thicken and thin laterally (wedges, channels)
    q = Z - fold + 0.35 * warp
    q = q * (1 + 0.22 * swell) + 1.4 * swell
    for x_fault, dip, throw in ((-31.0, 2.4, 2.8), (23.0, -2.1, -2.2)):
        right = X > x_fault + Z / dip
        q = np.where(right, q + throw, q)
    rng = np.random.RandomState(seed + 5)
    thickness = rng.uniform(0.7, 2.6, 40)
    boundaries = -28 + np.cumsum(thickness)
    layer = np.searchsorted(boundaries, q)
    sed = below & (Z < P) & (Z > B)
    sed_color = np.array(SEDIMENT_COLORS, np.float32)[layer % len(SEDIMENT_COLORS)]
    lamination = 1 + 0.05 * np.sin(q * 38 + warp * 4) + 0.06 * field2d(X.shape, seed + 8, base=60, octaves=3)
    blend_next = smoothstep(-0.18, 0.18, q - boundaries[np.clip(layer, 0, len(boundaries) - 1)] + 0.0)  # soft gradational contacts
    sed_color = sed_color * (1 - 0.25 * blend_next[..., None]) + np.array(SEDIMENT_COLORS, np.float32)[(layer + 1) % len(SEDIMENT_COLORS)] * 0.25 * blend_next[..., None]
    sed_color = sed_color * 0.8
    rock[sed] = ROCK["sediment"]
    albedo[sed] = (sed_color * lamination[..., None])[sed]
    relief[sed] = (0.35 + 0.3 * ((layer % 3) == 1))[sed]
    basement = below & (Z <= B)
    fwarp = field2d(X.shape, seed + 9, base=8, octaves=5)
    foliation = 0.5 + 0.5 * np.sin((X * 0.5 - Z * 1.9) + fwarp * 14 + warp * 4)
    rock[basement] = ROCK["basement"]
    foliation = foliation ** 3
    albedo[basement] = (np.array([0.085, 0.08, 0.08]) * (0.8 + 0.45 * foliation[..., None]) + 0.015 * grain[..., None])[basement]
    relief[basement] = 0.7

    # --- volcanic pile ---------------------------------------------------------------------
    pile = below & (Z >= P)
    kernel = np.ones(61) / 61
    S_smooth = np.convolve(np.pad(S[0], 30, mode="edge"), kernel, mode="valid")[None, :]
    f = np.clip((Z - P) / np.maximum(S_smooth - P, 0.4), 0, 1)
    units = 16
    k = np.floor(f * units + 0.55 * warp).astype(int)
    rng = np.random.RandomState(seed + 6)
    is_lava = rng.uniform(0, 1, units + 4) < 0.42
    reach = rng.uniform(9, 30, units + 4)       # lava lenses pinch out down-flank
    centre = rng.uniform(-6, 6, units + 4) + SUMMIT[0]
    kk = np.clip(k, 0, units + 3)
    lava_here = is_lava[kk] & (np.abs(X - centre[kk]) < reach[kk] * (0.85 + 0.25 * warp))
    tone = rng.uniform(0.85, 1.15, units + 4)[kk]
    tuff = np.array([0.17, 0.145, 0.115]) * tone[..., None] * (1 + 0.06 * np.sin(f[..., None] * units * 9 + warp[..., None] * 3))
    lava_rgb = np.array([0.085, 0.083, 0.09]) * tone[..., None]
    joints = 1 - 0.12 * np.abs(np.sin(X * 4.3 + warp * 7)) ** 30  # sparse columnar jointing in thick flows
    vol_rgb = np.where(lava_here[..., None], lava_rgb * joints[..., None], tuff)
    r_summit = np.hypot(X - SUMMIT[0], (Z - S) * 1.5)
    scoria = (r_summit < 4.5 + 1.2 * warp) & (f > 0.55)
    vol_rgb = np.where(scoria[..., None], np.array([0.22, 0.095, 0.06]) * (0.9 + 0.2 * grain[..., None]), vol_rgb)
    rock[pile] = ROCK["tuff"]
    rock[pile & lava_here] = ROCK["lava"]
    rock[pile & scoria] = ROCK["scoria"]
    albedo[pile] = vol_rgb[pile]
    relief[pile] = np.where(lava_here, 0.9, 0.25)[pile]
    rough[pile & lava_here] = 0.7

    anchors = {}
    if volcanic:
        anchors.update(_intrusions(X, Z, S, P, B, warp, grain, rock, albedo, heat, rough, relief, below, seed))
        # anchors for the layered rocks (pick representative pixels)
        anchors["lava"] = _pick(X, Z, (rock == ROCK["lava"]) & (np.abs(X - SUMMIT[0] - 11) < 3) & (Z > 2))
        anchors["tuff"] = _pick(X, Z, (rock == ROCK["tuff"]) & (np.abs(X - SUMMIT[0] + 13) < 3) & (Z > 1))
        anchors["sediment"] = _pick(X, Z, (rock == ROCK["sediment"]) & (np.abs(X + 40) < 3) & (Z < -6) & (Z > -14))
        anchors["unconformity"] = (float(-46.0), float(np.interp(-46.0, xs, P[0])))
        anchors["basement"] = (float(40.0), float(np.interp(40.0, xs, B[0]) - 6))

    soil = below & (Z > S - 0.18 - 0.08 * grain)
    rock[soil] = ROCK["soil"]
    albedo[soil] = np.array([0.075, 0.06, 0.045]) * (1 + 0.3 * grain[soil][:, None])
    albedo *= (0.92 + 0.16 * grain)[..., None]
    albedo[~below] = 0
    relief += 0.12 * grain
    return {
        "xs": xs, "zs": zs, "rock": rock, "albedo": np.clip(albedo, 0, 1), "heat": np.clip(heat, 0, 1),
        "rough": rough, "relief": np.clip(relief, 0, 1), "anchors": anchors,
    }


def _pick(X, Z, mask):
    rows, cols = np.nonzero(mask)
    if len(rows) == 0:
        return None
    i = len(rows) // 2
    return float(X[rows[i], cols[i]]), float(Z[rows[i], cols[i]])


def _intrusions(X, Z, S, P, B, warp, grain, rock, albedo, heat, rough, relief, below, seed):
    xs0 = SUMMIT[0]
    anchors = {}

    # older diorite pluton (crystallised, cold)
    pluton = (((X - 31) / 8.5) ** 2 + ((Z + 30) / 5.5) ** 2 + 0.35 * warp) < 1
    rock[pluton] = ROCK["pluton"]
    albedo[pluton] = (np.array([0.15, 0.145, 0.14]) * (0.8 + 0.4 * (grain[..., None] > 0.25)))[pluton]
    relief[pluton] = 0.8

    # magma reservoir: lens-shaped crystal-mush body (signed-distance union of ellipses + noise)
    def ellipse(cx, cz, ax, az):
        return np.sqrt(((X - cx) / ax) ** 2 + ((Z - cz) / az) ** 2) - 1
    sdf = np.minimum.reduce([
        ellipse(xs0 - 2, -32.0, 12.5, 3.3), ellipse(xs0 + 7, -30.6, 6.0, 2.2), ellipse(xs0 - 11, -33.6, 6.5, 2.6),
    ]) * 3.3 + 0.9 * warp
    aureole = (sdf > 2.2) & (sdf < 5.5) & below
    albedo[aureole] *= np.array([0.78, 0.76, 0.76])  # baked hornfels halo
    rim_noise = 1.6 * field2d(X.shape, seed + 23, base=20, octaves=4)
    carapace = (sdf > 1.0) & (sdf <= 2.0 + rim_noise)
    rock[carapace] = ROCK["pluton"]
    albedo[carapace] = (np.array([0.20, 0.19, 0.18]) * (0.8 + 0.4 * (grain[..., None] > 0.1)))[carapace]
    body = sdf <= 1.0
    melt_fraction = np.clip(smoothstep(1.0, -2.5, sdf) * (0.55 + 0.6 * field2d(X.shape, seed + 21, base=26, octaves=3)), 0, 1)
    lenses = np.abs(np.sin((Z + 0.3 * X * 0.15) * 2.6 + warp * 3)) ** 6 * smoothstep(0, -1.5, sdf)  # melt-rich sheets
    melt_fraction = np.clip(melt_fraction + 0.35 * lenses, 0, 1)
    crystals = (grain > 0.15).astype(np.float32)
    rock[body] = ROCK["mush"]
    rock[body & (melt_fraction > 0.6)] = ROCK["magma"]
    mush_rgb = np.array([0.11, 0.075, 0.06]) * (0.75 + 0.5 * crystals[..., None])
    melt_rgb = np.array([0.10, 0.03, 0.015])
    mf = melt_fraction[..., None]
    albedo[body] = (mush_rgb * (1 - mf) + melt_rgb * mf)[body]
    heat[body] = (0.28 + 0.42 * melt_fraction ** 1.5)[body]
    rough[body] = 0.6
    anchors["chamber"] = (float(xs0 - 2), -32.0)
    anchors["mush"] = (float(xs0 + 9.5), -29.6)

    # en-echelon dikes and a sill (older, solidified: dark dolerite with chilled margins)
    def dike(points, half_width):
        d = np.full(X.shape, np.inf)
        for (x0, z0), (x1, z1) in zip(points, points[1:]):
            vx, vz = x1 - x0, z1 - z0
            t = np.clip(((X - x0) * vx + (Z - z0) * vz) / (vx * vx + vz * vz), 0, 1)
            d = np.minimum(d, np.hypot(X - (x0 + t * vx), Z - (z0 + t * vz)))
        width = half_width * (1 + 0.55 * warp + 0.25 * np.sin(Z * 1.3 + X))
        return d < width, (d > width * 0.7) & (d < width)
    sill_band = np.abs(Z - (-8.6 + 0.4 * np.sin(X * 0.2))) < (0.42 * smoothstep(xs0 - 27, xs0 - 21, X) * (1 - smoothstep(xs0 - 12, xs0 - 9, X)))
    dikes = [
        [(xs0 + 8, -29.5), (xs0 + 10.5, -18), (xs0 + 11.2, -17.4), (xs0 + 13.5, -5), (xs0 + 14.3, -4.2), (xs0 + 16, 3.5)],
        [(xs0 - 12, -32.5), (xs0 - 14, -20), (xs0 - 14.6, -19.5), (xs0 - 16.5, -8.6)],
        [(xs0 - 4, -29.5), (xs0 - 5.5, -12), (xs0 - 6.2, -11.4), (xs0 - 7.5, 6.5)],
    ]
    solid = sill_band & below
    margin = np.zeros_like(solid)
    for points, half in zip(dikes, (0.5, 0.42, 0.34)):  # widths exaggerated ~5x so they read at this scale
        body, edge = dike(points, half)
        solid |= body & below
        margin |= edge & below
    rock[solid] = ROCK["dike"]
    albedo[solid] = np.array([0.065, 0.066, 0.07])
    albedo[margin] = np.array([0.04, 0.04, 0.045])
    relief[solid] = 1.0
    anchors["dike"] = (float(xs0 + 13.0), -8.0)
    anchors["sill"] = (float(xs0 - 18.0), -8.6)

    # active conduit: meandering, variable width, capped by a dense dacite plug under the crater floor
    floor = float(np.interp(xs0, X[0], S[0]))
    path = xs0 + 0.7 * np.sin(Z * 0.16 + 0.4) + 0.25 * np.sin(Z * 0.55)
    half = (0.42 + 0.12 * np.sin(Z * 0.8) + 0.5 * smoothstep(floor - 6, floor, Z)) * (1 + 0.2 * warp)
    inside = (np.abs(X - path) < half) & (Z > -30.5) & below
    plug_base = floor - 1.7
    plug = inside & (Z > plug_base)
    conduit = inside & ~plug
    rock[conduit] = ROCK["magma"]
    albedo[conduit] = np.array([0.11, 0.03, 0.015])
    vesicles = field2d(X.shape, seed + 22, base=90, octaves=2)
    across = np.abs(X - path) / np.maximum(half, 1e-3)
    heat[conduit] = ((0.3 + 0.36 * smoothstep(plug_base - 7, plug_base, Z) + 0.08 * vesicles) * (1 - 0.45 * across ** 2))[conduit]
    chill = (np.abs(X - path) > half * 0.82) & conduit
    heat[chill] *= 0.35
    albedo[chill] = np.array([0.06, 0.05, 0.05])
    rock[plug] = ROCK["plug"]
    albedo[plug] = (np.array([0.15, 0.145, 0.145]) * (0.85 + 0.3 * grain[..., None]))[plug]
    heat[plug] = (0.45 * (1 - smoothstep(plug_base, floor, Z)) * (np.abs(np.sin(X * 9 + Z * 3 + warp * 6)) > 0.93))[plug]
    relief[plug] = 0.95
    anchors["conduit"] = (float(xs0 + 0.6), -14.0)
    anchors["plug"] = (float(xs0), float(plug_base + 0.8))

    # hydrothermal alteration: bleached / sulphur-stained halo around the upper conduit
    r_alt = np.abs(X - path) - half
    alteration = below & (r_alt > 0) & (r_alt < 2.6 + 1.4 * warp) & (Z > plug_base - 9) & ~solid
    tint = np.array([0.52, 0.46, 0.26])
    mix = (0.55 * (1 - smoothstep(0, 2.8, r_alt)))[..., None]
    albedo[alteration] = (albedo * (1 - mix) + tint * mix)[alteration]
    anchors["alteration"] = (float(xs0 - 2.4), float(plug_base - 4))
    return anchors


def save_debug_png(section, path):
    """Preview without Blender: albedo with heat glow, sRGB-ish gamma."""
    from PIL import Image
    rgb = section["albedo"] ** (1 / 2.2)
    glow = section["heat"][..., None] ** 2 * np.array([1.0, 0.45, 0.12])
    Image.fromarray((np.clip(rgb + glow, 0, 1) * 255).astype(np.uint8)).save(path)
