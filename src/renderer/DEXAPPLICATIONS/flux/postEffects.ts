/**
 * Flux per-layer post effects that CSS canvas filters cannot do.
 *
 * Chromatic Aberration was never drawn and Vignette only dimmed the whole
 * layer. A layer with either is now drawn to an offscreen frame, processed
 * here on its pixels, then composited.
 */

export interface ChromaticSettings { amount?: number; angle?: number }
export interface VignetteSettings { amount?: number; roundness?: number; feather?: number }

export const POST_FILTER_TYPES = new Set(['chromaticAberration', 'vignette']);

interface Pixels { data: Uint8ClampedArray; width: number; height: number }

/** Shift red one way and blue the other by `amount` px along `angle` degrees. */
export function applyChromatic(img: Pixels, s: ChromaticSettings): void {
  const amount = Math.max(0, Math.min(50, s.amount ?? 5));
  if (amount < 0.5) return;
  const a = ((s.angle ?? 0) * Math.PI) / 180;
  const dx = Math.round(Math.cos(a) * amount), dy = Math.round(Math.sin(a) * amount);
  const { data, width, height } = img;
  const src = new Uint8ClampedArray(data);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return (cy * width + cx) * 4;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = at(x - dx, y - dy), b = at(x + dx, y + dy);
      data[i] = src[r];
      data[i + 2] = src[b + 2];
      data[i + 3] = Math.max(src[i + 3], src[r + 3], src[b + 3]);
    }
  }
}

/** Darken towards the frame edges. amount 0..1, roundness 0 (frame-shaped) .. 1 (circle), feather 0..1. */
export function vignetteFactor(x: number, y: number, width: number, height: number, s: VignetteSettings): number {
  const amount = Math.max(0, Math.min(1, s.amount ?? 0.5));
  const round = Math.max(0, Math.min(1, s.roundness ?? 0.5));
  const feather = Math.max(0.01, Math.min(1, s.feather ?? 0.5));
  let nx = (x / Math.max(1, width - 1)) * 2 - 1;
  let ny = (y / Math.max(1, height - 1)) * 2 - 1;
  // roundness 1: correct for aspect so the falloff is a circle
  const aspect = width / Math.max(1, height);
  nx *= 1 + (aspect - 1) * round * (aspect > 1 ? 1 : 0);
  ny *= 1 + (1 / aspect - 1) * round * (aspect < 1 ? 1 : 0);
  const d = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
  const start = 1 - feather;
  const t = d <= start ? 0 : Math.min(1, (d - start) / feather);
  return 1 - amount * t * t * (3 - 2 * t);
}

export function applyVignette(img: Pixels, s: VignetteSettings): void {
  const { data, width, height } = img;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const f = vignetteFactor(x, y, width, height, s);
      if (f >= 1) continue;
      const i = (y * width + x) * 4;
      data[i] *= f; data[i + 1] *= f; data[i + 2] *= f;
    }
  }
}

export function applyPostEffects(img: Pixels, filters: Array<{ type: string; enabled: boolean; settings?: Record<string, number> }>): void {
  for (const f of filters) {
    if (!f.enabled) continue;
    if (f.type === 'chromaticAberration') applyChromatic(img, f.settings || {});
    else if (f.type === 'vignette') applyVignette(img, f.settings || {});
  }
}
