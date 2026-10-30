"""Deterministic heightfield for the Vulcanian stratovolcano (pure numpy, no bpy).

Units: 1 scene unit = 100 m. The map spans x, y in [-EXTENT, EXTENT] (12 km square).
Pipeline: regional hills -> asymmetric concave cone + old Somma rim + parasitic cone
-> radial gullies -> vectorised droplet erosion -> crater with dacite plug
-> older blocky andesite lava flow (thick lobe, levees, steep front).
Every random draw comes from numpy RandomState(SEED + offset), so rebuilding is bit-for-bit repeatable.
"""

import math

import numpy as np

EXTENT = 60.0
SUMMIT = (-1.5, 0.0)   # the section plane y = 0 passes through the crater and conduit
CONE_HEIGHT = 16.0     # 1.6 km relief
CONE_RADIUS = 34.0
CRATER_RADIUS = 3.2
CRATER_DEPTH = 1.8
PLUG_TOP = -0.55       # plug surface relative to the crater rim height


def coords(n):
    axis = np.linspace(-EXTENT, EXTENT, n, dtype=np.float64)
    x, y = np.meshgrid(axis, axis, indexing="xy")  # row = y, column = x
    return axis, x, y


def upsample(grid, n):
    """Smooth (smoothstep-weighted bilinear) upsampling of a coarse random grid to n x n."""
    m = grid.shape[0]
    t = np.linspace(0, m - 1.000001, n)
    i0 = np.floor(t).astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    rows = grid[i0] * (1 - f)[:, None] + grid[i0 + 1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i0 + 1] * f[None, :]


def fbm(n, seed, base=4, octaves=6, gain=0.5):
    rng = np.random.RandomState(seed)
    total = np.zeros((n, n))
    amplitude, norm = 1.0, 0.0
    for octave in range(octaves):
        cells = base * 2 ** octave + 2
        total += amplitude * upsample(rng.uniform(-1, 1, (cells, cells)), n)
        norm += amplitude
        amplitude *= gain
    return total / norm


def blur(field, radius):
    """Three box blurs ~ gaussian; radius in cells."""
    r = max(1, int(radius))
    out = field.copy()
    for _ in range(3):
        for axis in (0, 1):
            padded = np.pad(out, [(r, r) if a == axis else (0, 0) for a in (0, 1)], mode="edge")
            c = np.cumsum(padded, axis=axis)
            c = np.concatenate([np.zeros_like(np.take(c, [0], axis=axis)), c], axis=axis)
            hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
            lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
            out = (hi - lo) / (2 * r + 1)
    return out


def smoothstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def cone(x, y, seed):
    """Concave stratovolcano profile with azimuth-dependent radius (asymmetric, not a lathe shape)."""
    dx, dy = x - SUMMIT[0], y - SUMMIT[1]
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    rng = np.random.RandomState(seed)
    phases = rng.uniform(0, 2 * math.pi, 4)
    stretch = (1 + 0.24 * np.cos(theta - 0.5)
               + 0.13 * np.cos(2 * theta + phases[1])
               + 0.07 * np.cos(3 * theta + phases[2])
               + 0.05 * np.cos(5 * theta + phases[3]))
    # the summit is not on the cone's axis: younger lava piled up on the east flank
    shoulder = 2.2 * np.exp(-(((x - SUMMIT[0] - 5.5) / 4.5) ** 2 + ((y - SUMMIT[1] + 2.0) / 3.2) ** 2))
    radius = CONE_RADIUS * stretch
    u = np.clip(r / radius, 0, 1.6)
    profile = np.clip(1 - u, 0, None) ** 1.75
    apron = 0.10 * np.exp(-((u - 0.9) / 0.35) ** 2)  # volcaniclastic apron that flattens the foot
    return CONE_HEIGHT * (profile + apron * (u > 0.6)) + shoulder, r, theta


def somma_rim(x, y, seed=11):
    """Remnant of an older, collapsed edifice on the north-west side (like Monte Somma): broad, eroded, uneven."""
    dx, dy = x - SUMMIT[0], y - SUMMIT[1]
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    n = x.shape[0]
    wobble = 2.2 * fbm(n, seed, base=5, octaves=4)
    radius = 16.5 + wobble
    arc = smoothstep(1.2, 2.2, theta) * (1 - smoothstep(2.7, 3.6, theta))
    crest = np.exp(-((r - radius) / 3.2) ** 2)
    outer = np.exp(-np.clip(r - radius, 0, None) / 7.5) * smoothstep(-1, 2, r - radius)
    height = 3.4 + 1.6 * fbm(n, seed + 1, base=9, octaves=3)
    return arc * height * (0.65 * crest + 0.55 * outer)


def sector_collapse(x, y):
    """Horseshoe-shaped amphitheatre on the north flank left by an old flank collapse (cf. Bezymianny, St Helens),
    with hummocky debris-avalanche deposits beyond its mouth. Breaks the cone's symmetry the way real ones are broken."""
    dx, dy = x - SUMMIT[0], y - SUMMIT[1]
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    opening = np.exp(-((theta - 1.45) / 0.36) ** 2)
    scar = 3.4 * opening * smoothstep(1.5, 4.5, r) * (1 - smoothstep(10.0, 17.0, r))
    n = x.shape[0]
    hummocks = np.clip(fbm(n, 77, base=40, octaves=3), 0, None) * 1.6
    debris = np.exp(-((theta - 1.45) / 0.55) ** 2) * smoothstep(15, 19, r) * (1 - smoothstep(26, 34, r)) * (0.5 + hummocks)
    return -scar + debris


def parasitic_cone(x, y, cx=16.0, cy=12.5):
    r = np.hypot(x - cx, y - cy)
    body = 2.6 * np.clip(1 - r / 4.2, 0, None) ** 1.3
    crater = 0.7 * np.exp(-(r / 0.75) ** 2)
    return body - crater


def radial_gullies(r, theta, seed):
    """Barranco-style radial valleys: deepest on the mid-slopes, fading near the summit and the foot."""
    rng = np.random.RandomState(seed)
    carve = np.zeros_like(r)
    for k, amplitude in ((23, 0.55), (37, 0.30), (61, 0.16)):
        phase = rng.uniform(0, 2 * math.pi)
        wobble = 0.12 * np.sin(r * 0.21 + rng.uniform(0, 6)) + 0.05 * np.sin(r * 0.57 + rng.uniform(0, 6))
        wave = np.abs(np.sin(k * (theta + wobble) / 2 + phase))
        carve += amplitude * (1 - wave) ** 6
    belt = smoothstep(3.0, 9.0, r) * (1 - smoothstep(22.0, 34.0, r))
    return carve * belt


def erode(height, seed, droplets=220_000, batch=8192, steps=64):
    """Vectorised droplet hydraulic erosion (after Hans Beyer / S. Lague), deterministic order."""
    n = height.shape[0]
    cell = 2 * EXTENT / (n - 1)
    h = height.copy()
    rng = np.random.RandomState(seed)
    inertia, capacity_k, min_slope, deposit_k, erode_k, evaporate, gravity = 0.06, 5.0, 0.01, 0.25, 0.35, 0.025, 4.0
    flow = np.zeros_like(h)

    def sample(px, py):
        ix = np.clip(px.astype(int), 0, n - 2)
        iy = np.clip(py.astype(int), 0, n - 2)
        fx, fy = px - ix, py - iy
        h00, h10, h01, h11 = h[iy, ix], h[iy, ix + 1], h[iy + 1, ix], h[iy + 1, ix + 1]
        gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy
        gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx
        value = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
        return value, gx, gy, ix, iy, fx, fy

    def splat(ix, iy, fx, fy, amount):
        np.add.at(h, (iy, ix), amount * (1 - fx) * (1 - fy))
        np.add.at(h, (iy, ix + 1), amount * fx * (1 - fy))
        np.add.at(h, (iy + 1, ix), amount * (1 - fx) * fy)
        np.add.at(h, (iy + 1, ix + 1), amount * fx * fy)

    for start in range(0, droplets, batch):
        count = min(batch, droplets - start)
        px = rng.uniform(1, n - 2, count)
        py = rng.uniform(1, n - 2, count)
        dx = np.zeros(count)
        dy = np.zeros(count)
        speed = np.ones(count)
        water = np.ones(count)
        sediment = np.zeros(count)
        alive = np.ones(count, bool)
        for _ in range(steps):
            value, gx, gy, ix, iy, fx, fy = sample(px, py)
            dx = dx * inertia - gx * (1 - inertia)
            dy = dy * inertia - gy * (1 - inertia)
            length = np.hypot(dx, dy) + 1e-12
            dx, dy = dx / length, dy / length
            nx, ny = px + dx, py + dy
            alive &= (nx > 1) & (nx < n - 2) & (ny > 1) & (ny < n - 2)
            nx = np.where(alive, nx, px)
            ny = np.where(alive, ny, py)
            new_value = sample(nx, ny)[0]
            delta = new_value - value
            capacity = np.maximum(-delta, min_slope * cell) * speed * water * capacity_k
            depositing = (sediment > capacity) | (delta > 0)
            deposit = np.where(delta > 0, np.minimum(delta, sediment), (sediment - capacity) * deposit_k)
            deposit = np.where(depositing & alive, deposit, 0.0)
            erosion = np.where(~depositing & alive, np.minimum((capacity - sediment) * erode_k, -delta), 0.0)
            splat(ix, iy, fx, fy, deposit - erosion)
            sediment += erosion - deposit
            np.add.at(flow, (iy, ix), alive.astype(float))
            speed = np.sqrt(np.maximum(speed * speed - delta * gravity, 0.0))
            water *= 1 - evaporate
            px, py = nx, ny
    return h, flow


def crater_and_plug(height, x, y, seed):
    """Breached summit crater with a domed dacite plug (the seal that fails in a Vulcanian blast)."""
    rng = np.random.RandomState(seed)
    dx, dy = x - SUMMIT[0], y - SUMMIT[1]
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    rim_radius = CRATER_RADIUS * (1 + 0.12 * np.cos(2 * theta + rng.uniform(0, 6)) + 0.07 * np.cos(3 * theta + rng.uniform(0, 6)))
    summit_level = float(height[r < CRATER_RADIUS * 1.25].max())
    ridge = 0.3 * np.exp(-((r - rim_radius) / 0.4) ** 2)
    breach = 0.75 * np.exp(-((theta - 0.6) / 0.28) ** 2) * np.exp(-((r - rim_radius) / 0.7) ** 2)  # notch towards the lava flow
    outside = height + ridge - breach
    bowl = summit_level - CRATER_DEPTH * (1 - smoothstep(0, 1, r / rim_radius)) ** 0.6
    plug = summit_level + PLUG_TOP + 0.35 * (1 - smoothstep(0, 1, r / (rim_radius * 0.55)))
    inner = np.minimum(np.maximum(bowl, np.where(r < rim_radius * 0.6, plug, -1e9)), outside)
    w_inner = 1 - smoothstep(rim_radius * 0.8, rim_radius * 1.0, r)
    return inner * w_inner + outside * (1 - w_inner), summit_level


def lava_flow(height, axis, seed, length=15.0, thickness=0.42, width=1.55):
    """Older blocky andesite flow: follows steepest descent from the crater breach; returns height + mask + front."""
    n = height.shape[0]
    cell = axis[1] - axis[0]
    smooth = blur(height, 6)
    rng = np.random.RandomState(seed)
    angle = 0.6
    px, py = SUMMIT[0] + math.cos(angle) * CRATER_RADIUS * 1.2, SUMMIT[1] + math.sin(angle) * CRATER_RADIUS * 1.2
    path = [(px, py)]
    travelled = 0.0
    step = cell * 2
    while travelled < length:
        i = int((py + EXTENT) / cell)
        j = int((px + EXTENT) / cell)
        gy = (smooth[min(i + 1, n - 1), j] - smooth[max(i - 1, 0), j]) / (2 * cell)
        gx = (smooth[i, min(j + 1, n - 1)] - smooth[i, max(j - 1, 0)]) / (2 * cell)
        g = math.hypot(gx, gy) + 1e-9
        heading = math.atan2(-gy / g, -gx / g) + 0.45 * math.sin(travelled * 0.55 + 1.3) + rng.normal(0, 0.1)
        px += math.cos(heading) * step
        py += math.sin(heading) * step
        travelled += step
        path.append((px, py))
    path = np.array(path)
    _, x, y = coords(n)
    distance = np.full(height.shape, np.inf)
    along = np.zeros(height.shape)
    cumulative = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(path, axis=0).T))])
    for index, (cx, cy) in enumerate(path[::2]):
        d = np.hypot(x - cx, y - cy)
        closer = d < distance
        distance = np.where(closer, d, distance)
        along = np.where(closer, cumulative[index * 2], along)
    local_width = width * (0.7 + 0.9 * smoothstep(0, length, along) ** 2)  # spreads into a lobate snout as it slows
    local_width = local_width * (1 + 0.18 * fbm(n, seed + 5, base=12, octaves=3))
    across = distance / local_width
    levee = 1 + 0.35 * np.exp(-((across - 0.8) / 0.12) ** 2)
    profile = np.clip(1 - across ** 4, 0, 1) * levee
    front = 1 - smoothstep(length - 1.4, length, along)  # steep, thick snout
    blocks = 0.08 * fbm(n, seed + 3, base=48, octaves=3)
    lobe = thickness * profile * np.maximum(front, 0) * (1 + blocks)
    mask = (profile > 0.02) & (front > 0.02)
    return height + lobe, mask.astype(np.float32), (front * (1 - front) * 4 * mask).astype(np.float32), path


def build_heightfield(n=769, seed=20261029, erosion=True):
    axis, x, y = coords(n)
    hills = 2.4 * fbm(n, seed + 1, base=3, octaves=6) + 1.2
    volcano, r, theta = cone(x, y, seed + 2)
    hills = hills * (0.55 + 0.45 * smoothstep(18, 45, r))
    height = hills * (1 - 0.6 * smoothstep(0, 1, volcano / 6)) + volcano + somma_rim(x, y, seed + 11) + parasitic_cone(x, y) + sector_collapse(x, y)
    height += 0.9 * fbm(n, seed + 4, base=10, octaves=5) * smoothstep(2, 10, r)
    height -= radial_gullies(r, theta, seed + 5) * 1.6
    flow = np.zeros_like(height)
    if erosion:
        height, flow = erode(height, seed + 6)
        height = 0.7 * height + 0.3 * blur(height, 1)  # thermal relaxation of single-cell spikes
    height, summit_level = crater_and_plug(height, x, y, seed + 7)
    height, lava_mask, lava_front, lava_path = lava_flow(height, axis, seed + 8)
    slope = np.hypot(*np.gradient(height, axis[1] - axis[0]))
    return {
        "axis": axis, "x": x, "y": y, "height": height.astype(np.float32), "flow": flow.astype(np.float32),
        "slope": slope.astype(np.float32), "lava": lava_mask, "lava_front": lava_front, "lava_path": lava_path,
        "summit_level": float(summit_level), "r": r.astype(np.float32),
    }


def profile_at_y0(field):
    """Surface height along the section plane y = 0 (used by the geology cross-section)."""
    axis = field["axis"]
    row = int(np.argmin(np.abs(axis)))
    return axis, field["height"][row].astype(np.float64)
