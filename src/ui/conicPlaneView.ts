import { measurePoint, sampleConic, type ConicSection } from "../domain/conic";

// 切面“摊平”后的二维视图：把三维截线放回直角坐标系，写成方程。
// 横轴 = 切面内沿倾斜方向的 t（长轴 / 实轴 / 对称轴方向），纵轴 = 水平方向 s。
// 原点取在对称中心（抛物线取顶点），这样画出来的就是课本上的标准位置。

const COLORS = { axis: "rgba(170, 200, 215, .35)", curve: "#ffffff", f1: "#ff7a59", f2: "#6fe3ff", directrix: "#c39bff", point: "#ffe066", text: "#d9e6ec" };

export interface PlaneViewOptions { foci: boolean; point: boolean; u: number; height: number }

export function drawPlaneView(canvas: HTMLCanvasElement, section: ConicSection, options: PlaneViewOptions): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const origin = section.center;
  const runs = sampleConic(section, options.height, 240).map((run) => run.map(([s, t]) => [t - origin, s] as [number, number]));
  const all = runs.flat();
  // 视窗：包住曲线、焦点和准线，最多 ±12 个单位
  const xs = [...all.map(([x]) => x), ...section.foci.map((f) => f - origin), ...section.directrices.map((d) => d - origin)];
  const ys = all.map(([, y]) => y);
  const extentX = Math.min(12, Math.max(2, ...xs.map(Math.abs))) * 1.12;
  const extentY = Math.min(12, Math.max(1.5, ...ys.map(Math.abs))) * 1.12;
  const scale = Math.min((width - 24) / (2 * extentX), (height - 24) / (2 * extentY));
  const X = (x: number) => width / 2 + x * scale;
  const Y = (y: number) => height / 2 - y * scale;

  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(8, Y(0)); ctx.lineTo(width - 8, Y(0));
  ctx.moveTo(X(0), 8); ctx.lineTo(X(0), height - 8);
  ctx.stroke();
  ctx.fillStyle = COLORS.axis;
  ctx.font = "11px 'SF Mono', ui-monospace, monospace";
  ctx.fillText("x", width - 16, Y(0) - 6);
  ctx.fillText("y", X(0) + 6, 16);

  ctx.strokeStyle = COLORS.curve;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = "rgba(255, 220, 150, .6)";
  ctx.shadowBlur = 8;
  for (const run of runs) {
    ctx.beginPath();
    run.forEach(([x, y], index) => (index ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (section.degenerate === "point") {
    ctx.fillStyle = COLORS.curve;
    ctx.beginPath(); ctx.arc(X(0), Y(0), 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (section.degenerate) return;

  if (options.foci) {
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = COLORS.directrix;
    ctx.lineWidth = 1.4;
    section.directrices.forEach((d) => {
      ctx.beginPath(); ctx.moveTo(X(d - origin), 8); ctx.lineTo(X(d - origin), height - 8); ctx.stroke();
    });
    ctx.setLineDash([]);
    section.foci.forEach((f, index) => {
      ctx.fillStyle = index ? COLORS.f2 : COLORS.f1;
      ctx.beginPath(); ctx.arc(X(f - origin), Y(0), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(section.foci.length > 1 ? `F${index + 1}` : "F", X(f - origin) - 6, Y(0) + 18);
    });
  }

  const measure = options.point ? measurePoint(section, options.u) : undefined;
  if (measure) {
    const px = X(measure.t - origin);
    const py = Y(measure.s);
    ctx.lineWidth = 1.6;
    section.foci.forEach((f, index) => {
      ctx.strokeStyle = index ? COLORS.f2 : COLORS.f1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(X(f - origin), Y(0)); ctx.stroke();
    });
    const directrix = section.directrices[section.kind === "hyperbola" ? 1 : 0];
    if (directrix !== undefined) {
      ctx.strokeStyle = COLORS.directrix;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(X(directrix - origin), py); ctx.stroke();
    }
    ctx.fillStyle = COLORS.point;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillText("P", px + 8, py - 8);
  }
}

const fmt = (value: number, digits = 2) => (Math.abs(value) < 0.005 ? "0" : value.toFixed(digits));

/** 带具体数值的标准方程（平面坐标，单位与三维场景一致） */
export function numericEquation(section: ConicSection): string {
  if (section.degenerate) return "—";
  if (section.kind === "circle") return `x² + y² = ${fmt(section.a ** 2)}`;
  if (section.kind === "ellipse") return `x²/${fmt(section.a ** 2)} + y²/${fmt(section.b ** 2)} = 1`;
  if (section.kind === "hyperbola") return `x²/${fmt(section.a ** 2)} − y²/${fmt(section.b ** 2)} = 1`;
  return `y² = ${fmt(2 * section.p)}x`;
}
