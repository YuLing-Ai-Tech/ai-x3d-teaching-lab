export interface RainOverlay {
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

interface Drop {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

export function createRainOverlay(host: HTMLElement): RainOverlay {
  const canvas = document.createElement("canvas");
  canvas.className = "map-rain";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const context = canvas.getContext("2d")!;
  const drops: Drop[] = [];
  let enabled = true;
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(host.clientWidth * ratio));
    canvas.height = Math.max(1, Math.floor(host.clientHeight * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drops.length = 0;
    const count = Math.min(460, Math.max(130, Math.floor(host.clientWidth * host.clientHeight / 4600)));
    for (let index = 0; index < count; index += 1) {
      drops.push({
        x: Math.random() * host.clientWidth,
        y: Math.random() * host.clientHeight,
        speed: 8 + Math.random() * 12,
        length: 10 + Math.random() * 23,
        alpha: .08 + Math.random() * .28,
      });
    }
  };

  const render = () => {
    context.clearRect(0, 0, host.clientWidth, host.clientHeight);
    if (enabled) {
      context.lineWidth = .7;
      for (const drop of drops) {
        const gradient = context.createLinearGradient(drop.x, drop.y, drop.x - 8, drop.y + drop.length);
        gradient.addColorStop(0, "rgba(172,225,237,0)");
        gradient.addColorStop(1, `rgba(172,225,237,${drop.alpha})`);
        context.strokeStyle = gradient;
        context.beginPath();
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x - 8, drop.y + drop.length);
        context.stroke();
        drop.x -= 2.4;
        drop.y += drop.speed;
        if (drop.y > host.clientHeight + 30) {
          drop.x = Math.random() * host.clientWidth + 40;
          drop.y = -drop.length;
        }
      }
    }
    frame = requestAnimationFrame(render);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  render();
  return {
    setEnabled: (value) => { enabled = value; canvas.classList.toggle("is-hidden", !value); },
    dispose: () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.remove(); },
  };
}
