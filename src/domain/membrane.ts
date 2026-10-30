// 跨膜运输的随机模型：膜外、膜内两个等体积小室，粒子个数就代表浓度。
// 每一步按速率抽样“有多少个粒子穿膜”，两个方向分别计数——平衡时粒子仍在双向穿膜，只是净移动为零。
//   自由扩散：每个粒子单位时间有固定概率穿过脂双层（速率 ∝ 浓度，Fick）
//   协助扩散：只能经通道/载体，双向；每个载体有最大周转速率，所以浓度差再大也会饱和
//   主动运输：载体泵把粒子从膜外泵入膜内，每运一个消耗 1 个 ATP；没有 ATP 就停止
// 数值只用于比较，不代表真实分子数、速率常数或时间尺度。

export type TransportMode = "diffusion" | "facilitated" | "active";

export interface MembraneSettings {
  outside: number;
  inside: number;
  channels: number;
  atp: boolean;
}

export interface MembraneState {
  mode: TransportMode;
  outside: number;
  inside: number;
  channels: number;
  atp: boolean;
  /** 累计穿膜次数 */
  inward: number;
  outward: number;
  atpUsed: number;
  time: number;
  /** 最近一段时间的净速率（外 → 内为正，个/秒） */
  netRate: number;
}

const LIMITS = { concentration: 100, channels: 8 };
/** 自由扩散：每个粒子每秒穿膜概率 */
export const K_DIFFUSION = 0.012;
/** 通道/载体：单个最大周转（个/秒）与半饱和浓度 */
export const CARRIER_VMAX = 1.6;
export const CARRIER_KM = 30;
/** 泵：单个最大泵速（个/秒）与半饱和浓度 */
export const PUMP_VMAX = 1.1;
export const PUMP_KM = 12;

export function clampMembraneSettings(settings: MembraneSettings): MembraneSettings {
  return {
    outside: Math.round(Math.min(LIMITS.concentration, Math.max(0, settings.outside))),
    inside: Math.round(Math.min(LIMITS.concentration, Math.max(0, settings.inside))),
    channels: Math.round(Math.min(LIMITS.channels, Math.max(0, settings.channels))),
    atp: settings.atp,
  };
}

/** 单方向的期望速率（个/秒），供模拟与讲解共用 */
export function directionalRates(mode: TransportMode, outside: number, inside: number, channels: number, atp: boolean): { inward: number; outward: number } {
  if (mode === "diffusion") return { inward: K_DIFFUSION * outside, outward: K_DIFFUSION * inside };
  if (mode === "facilitated") {
    const carrier = (c: number) => channels * CARRIER_VMAX * c / (CARRIER_KM + c);
    return { inward: carrier(outside), outward: carrier(inside) };
  }
  return { inward: atp ? channels * PUMP_VMAX * outside / (PUMP_KM + outside) : 0, outward: 0 };
}

/** 净速率（外 → 内为正）。协助扩散在浓度差很大时趋于 channels × VMAX，体现载体饱和 */
export function netRate(mode: TransportMode, settings: MembraneSettings): number {
  const rates = directionalRates(mode, settings.outside, settings.inside, settings.channels, settings.atp);
  return rates.inward - rates.outward;
}

export function transportDirection(mode: TransportMode, outside: number, inside: number, atp: boolean, channels = 4): "outside-to-inside" | "inside-to-outside" | "balanced" | "stopped" {
  const rates = directionalRates(mode, outside, inside, channels, atp);
  if (rates.inward === 0 && rates.outward === 0) return "stopped";
  const net = rates.inward - rates.outward;
  if (Math.abs(net) < 1e-9) return "balanced";
  return net > 0 ? "outside-to-inside" : "inside-to-outside";
}

/** 可复现的伪随机数（mulberry32） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 泊松抽样（期望较小时用乘积法，较大时用正态近似） */
function poisson(mean: number, random: () => number): number {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian(random)));
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do { k += 1; p *= random(); } while (p > limit);
  return k - 1;
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
}

export function createMembraneSim(mode: TransportMode, settings: MembraneSettings, seed = 20261029) {
  const random = seededRandom(seed);
  const start = clampMembraneSettings(settings);
  const state: MembraneState = { mode, ...start, inward: 0, outward: 0, atpUsed: 0, time: 0, netRate: 0 };
  const window: Array<{ time: number; net: number }> = [];

  return {
    state,
    /** 推进 dt 秒；返回这一步的穿膜事件，供画面播放 */
    step(dt: number): { inward: number; outward: number } {
      const rates = directionalRates(state.mode, state.outside, state.inside, state.channels, state.atp);
      let inward = Math.min(state.outside, poisson(rates.inward * dt, random));
      let outward = Math.min(state.inside, poisson(rates.outward * dt, random));
      if (state.mode === "active") outward = 0;
      if (state.mode === "active" && !state.atp) inward = 0;
      state.outside += outward - inward;
      state.inside += inward - outward;
      state.inward += inward;
      state.outward += outward;
      if (state.mode === "active") state.atpUsed += inward;
      state.time += dt;
      window.push({ time: state.time, net: inward - outward });
      while (window.length && window[0].time < state.time - 4) window.shift();
      const span = Math.min(4, state.time);
      state.netRate = span > 0 ? window.reduce((sum, item) => sum + item.net, 0) / span : 0;
      return { inward, outward };
    },
    set(next: Partial<Pick<MembraneState, "mode" | "channels" | "atp">>) { Object.assign(state, next); },
    reset(nextMode: TransportMode, nextSettings: MembraneSettings) {
      const clamped = clampMembraneSettings(nextSettings);
      Object.assign(state, { mode: nextMode, ...clamped, inward: 0, outward: 0, atpUsed: 0, time: 0, netRate: 0 });
      window.length = 0;
    },
  };
}

export type MembraneSim = ReturnType<typeof createMembraneSim>;
