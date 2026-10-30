"""Single source of truth for the deterministic volcano lesson."""

SEED = 20261029

# Screen time is compressed: 1 s on screen = TIME_SCALE s of real eruption time. Everything that moves
# (plume, ballistics, shock) uses the same factor, so speeds stay physically consistent and can be stated in class.
TIME_SCALE = 5.0
UNIT_METRES = 100.0

# Vulcanian sequence on screen (seconds, 24 fps). Matches the lesson text:
# 蓄压 → 喷口破裂 → 闪光与冲击 → 高速气灰喷流 → 火山弹抛射 → 灰柱卷吸膨胀 → 灰尘沉降
PHASES = [
    {"id": "charge", "name": "蓄压", "start": 0.0, "end": 2.4},
    {"id": "rupture", "name": "喷口破裂", "start": 2.4, "end": 2.7},
    {"id": "flash", "name": "闪光与冲击", "start": 2.7, "end": 3.3},
    {"id": "jet", "name": "高速气灰喷流", "start": 2.8, "end": 6.0},
    {"id": "ballistic", "name": "火山弹抛射", "start": 2.8, "end": 9.5},
    {"id": "plume", "name": "灰柱卷吸膨胀", "start": 5.0, "end": 10.5},
    {"id": "fallout", "name": "灰尘沉降", "start": 9.0, "end": 12.0},
]
ERUPTION_SECONDS = 12.0

ERUPTION = {
    "jet_speed_ms": 160.0,        # gas-ash jet exit speed (m/s), typical Vulcanian 100–200
    "bomb_speed_ms": (90.0, 210.0),
    "bomb_diameter_m": (0.6, 3.5),
    "bomb_density": 2500.0,       # kg/m³, dense dacite/andesite blocks
    "lapilli_diameter_m": (0.03, 0.06),
    "wind_ms": 9.0,
    "plume_top_km": 3.2,          # reached at the end of the clip (real ≈ 60 s)
}

CONTROLS = {
    "render": {"width": 1920, "height": 1080, "fps": 24},
    "magma": {"emission": 4.0, "boosted_emission": 9.0},
    "ash": {"density": 0.32, "boosted_density": 0.51},
    "ejecta": {"bombs": 28, "boosted_bombs": 56, "lapilli": 120, "boosted_lapilli": 240},
    "sun": {"day_elevation": 10.0, "night_elevation": -4.0, "azimuth": 110.0, "hdri": "kloppenheim_06_puresky_4k.exr", "hdri_sun_azimuth": 40.3},  # golden hour, side/back light: relief and ash billows read in depth
    "orbit": {"duration_seconds": 6, "height": 12.0, "radius": 52.0},
}

STEPS = [
    {
        "id": 1, "title": "把视线说清楚", "vague": "让我看看里面",
        "precise": "切换到 Camera_Section（沿过火山口的南北向剖面），焦距 30→35 mm，对准 Magma_Chamber。",
        "objects": ["Camera_Section", "Section_Face", "Magma_Chamber"],
        "changes": [
            {"path": "scene.camera", "before": "Camera_Hero", "after": "Camera_Section", "unit": ""},
            {"path": "Camera_Section.lens", "before": 30, "after": 35, "unit": "mm"},
        ],
    },
    {
        "id": 2, "title": "把过程说清楚", "vague": "喷得猛一点",
        "precise": "Vent_Plug 蓄压 2.4 秒后破裂：气灰喷流以 160 m/s 冲出，28 枚 0.6–3.5 m 的火山弹按带空气阻力的弹道落在 2.4 km 内，破裂冲击掀起约 2 km 的尘环，灰柱卷吸空气、越升越宽，约一分钟升到 3.2 km（画面时间压缩 5 倍）。",
        "objects": ["Vent_Plug", "Ash_Column", "Ballistic_Bombs", "Tephra_Lapilli", "Eruption_Flash"],
        "changes": [
            {"path": "Vent_Plug.state", "before": "sealed", "after": "ruptured @2.4 s", "unit": ""},
            {"path": "Eruption_Flow.speed", "before": 0, "after": 160, "unit": " m/s"},
            {"path": "Ballistic_Bombs.count", "before": 0, "after": 28, "unit": ""},
            {"path": "Ballistic_Bombs.max_range", "before": 0, "after": 2.4, "unit": " km"},
            {"path": "Ash_Column.top", "before": 0, "after": 3.2, "unit": " km"},
        ],
    },
    {
        "id": 3, "title": "把时间变成参数", "vague": "换成晚上",
        "precise": "Sun 高度角 10° → -4°，天空切换为夜景，曝光 +1.6 EV；只保留炽热火山弹轨迹、喷口与灰柱底部的自发光和低强度月光。",
        "objects": ["Sun", "World_Nishita", "Moon_Fill", "Ash_Column"],
        "changes": [
            {"path": "Sun.elevation", "before": 10, "after": -4, "unit": "°"},
            {"path": "World_Nishita.mode", "before": "day", "after": "night", "unit": ""},
            {"path": "scene.exposure", "before": 0, "after": 1.6, "unit": " EV"},
        ],
    },
    {
        "id": 4, "title": "把知识结构点名", "vague": "标出地层",
        "precise": "在剖面上标出 11 个结构：岩浆房（晶粥体）、火山通道、岩塞、岩墙、岩床、熔岩流层、火山碎屑层、沉积岩层、不整合面、变质基底、热液蚀变带。",
        "objects": ["Section_Face", "Magma_Chamber", "Conduit", "Vent_Plug"],
        "changes": [{"path": "Geology_Labels.visible", "before": False, "after": True, "unit": ""}, {"path": "Geology_Labels.count", "before": 0, "after": 11, "unit": ""}],
    },
    {
        "id": 5, "title": "把运镜写成约束", "vague": "转一圈",
        "precise": "Camera_Orbit 在 6 秒内绕剖面沙盘中心转 120°，半径 16.5 km、高度 4.8 km，始终对准沙盘中心。",
        "objects": ["Camera_Orbit", "Section_Plinth"],
        "changes": [
            {"path": "Camera_Orbit.rotation", "before": 0, "after": 120, "unit": "°"},
            {"path": "Camera_Orbit.duration", "before": 0, "after": 6, "unit": "s"},
            {"path": "Camera_Orbit.radius", "before": 0, "after": 16.5, "unit": " km"},
        ],
    },
]
