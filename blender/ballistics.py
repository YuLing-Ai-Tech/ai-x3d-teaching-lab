"""Ballistic ejecta with air drag, landed on the real heightfield (pure numpy, no bpy).

Physics in SI units: dv/dt = g − (3 Cd ρ_air / (4 ρ_rock d)) |v| v, integrated with RK4 at 200 Hz real time.
Then converted to scene units (UNIT_METRES) and sampled on screen frames with the global TIME_SCALE.
Reused idea from the old branch: deterministic RandomState(seed + offset) per ejecta class; new here:
drag, size-dependent range, true landing on terrain, impact frame for dust puffs.
"""

import math

import numpy as np

G = 9.81
RHO_AIR = 1.0  # kg/m³ at ~1.5–3 km altitude
CD = 1.0       # rough, angular blocks


def _height_sampler(height, extent):
    n = height.shape[0]
    cell = 2 * extent / (n - 1)

    def sample(x, y):
        fx = np.clip((x + extent) / cell, 0, n - 1.001)
        fy = np.clip((y + extent) / cell, 0, n - 1.001)
        i, j = fy.astype(int), fx.astype(int)
        u, v = fx - j, fy - i
        return (height[i, j] * (1 - u) * (1 - v) + height[i, j + 1] * u * (1 - v)
                + height[i + 1, j] * (1 - u) * v + height[i + 1, j + 1] * u * v)
    return sample


def simulate(height, extent, vent, unit_m, time_scale, fps, seconds, launch_s, count, speed_ms, diameter_m,
             density, seed, wind_ms=0.0, wind_azimuth=0.0, spread_deg=28.0, dt=0.005):
    """Returns dict of arrays: frames (count, F, 3) positions in scene units, landed_frame, diameter_m, spin."""
    rng = np.random.RandomState(seed)
    frames = int(round(seconds * fps))
    d = rng.uniform(*diameter_m, count) if np.ndim(diameter_m) else np.full(count, diameter_m)
    d = np.sort(d)[::-1]  # biggest first: easier to pick "hero" bombs
    speed = rng.uniform(*speed_ms, count)
    speed *= 1.0 - 0.25 * (d - d.min()) / max(d.max() - d.min(), 1e-6)  # big blocks leave slower
    azimuth = rng.uniform(-math.pi, math.pi, count)
    tilt = np.radians(np.abs(rng.normal(0, spread_deg, count)))  # angle from vertical, Vulcanian jets are steep
    v = np.stack([np.sin(tilt) * np.cos(azimuth), np.sin(tilt) * np.sin(azimuth), np.cos(tilt)], axis=1) * speed[:, None]
    # birth spread over the first part of the jet phase (real seconds after rupture)
    birth = launch_s + rng.uniform(0.0, 0.9, count) * (count > 1)
    k = 3 * CD * RHO_AIR / (4 * density * d)
    wind = np.array([math.cos(wind_azimuth), math.sin(wind_azimuth), 0.0]) * wind_ms
    sample = _height_sampler(height, extent)

    p = np.zeros((count, 3))
    p[:, 0], p[:, 1], p[:, 2] = vent[0] * unit_m, vent[1] * unit_m, vent[2] * unit_m
    p[:, :2] += rng.normal(0, 25.0, (count, 2))  # vent is ~300 m wide
    alive = np.ones(count, bool)
    landed_real = np.full(count, np.inf)

    real_total = seconds * time_scale
    samples_per_frame = max(1, int(round(time_scale / fps / dt)))
    step = time_scale / fps / samples_per_frame
    out = np.zeros((count, frames, 3))
    t_real = 0.0
    for frame in range(frames):
        for _ in range(samples_per_frame):
            active = alive & (t_real >= birth)
            if active.any():
                vel = v[active]
                a1 = accel_at(vel, k[active], wind)
                a2 = accel_at(vel + 0.5 * step * a1, k[active], wind)
                a3 = accel_at(vel + 0.5 * step * a2, k[active], wind)
                a4 = accel_at(vel + step * a3, k[active], wind)
                p[active] += step * (vel + step / 6 * (a1 + a2 + a3))  # Runge–Kutta–Nyström position update
                v[active] = vel + step / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
                ground = sample(p[:, 0] / unit_m, p[:, 1] / unit_m) * unit_m
                hit = active & (p[:, 2] <= ground) & (v[:, 2] < 0)
                p[hit, 2] = ground[hit]
                landed_real[hit] = t_real
                alive &= ~hit
            t_real += step
        out[:, frame] = p / unit_m
    landed_frame = np.where(np.isfinite(landed_real), np.round(landed_real / time_scale * fps).astype(int), -1)
    birth_frame = np.round(birth / time_scale * fps).astype(int)
    spin = rng.uniform(-6, 6, (count, 3))
    range_m = np.hypot(out[:, -1, 0] - vent[0], out[:, -1, 1] - vent[1]) * unit_m
    return {"frames": out, "birth_frame": birth_frame, "landed_frame": landed_frame, "diameter_m": d, "spin": spin,
            "range_m": range_m, "speed_ms": speed, "real_total_s": real_total}


def accel_at(vel, k, wind):
    rel = vel - wind
    return np.array([0, 0, -G]) - k[:, None] * np.linalg.norm(rel, axis=1, keepdims=True) * rel
