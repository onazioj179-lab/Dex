// =============================================================================
// DEX Platform — VINX 3D LUTs (.cube)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Real 3D look-up tables in the Adobe/Resolve `.cube` format: parse, sample
// with trilinear interpolation, and apply to RGBA pixels. The GPU path
// (lutGL.ts) uses the same table as a 3D texture; this CPU path is the
// reference the tests pin and the fallback when WebGL2 is unavailable.

export interface Lut3D {
  title: string;
  /** Points per axis (2..256). */
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** size³ RGB triples, red changing fastest (cube order). */
  data: Float32Array;
}

export type CubeParse = { ok: true; lut: Lut3D } | { ok: false; error: string };

const MAX_SIZE = 256;

/** Parse `.cube` text. 1D LUTs and malformed files are refused with a reason. */
export function parseCube(text: string, fallbackTitle = 'LUT'): CubeParse {
  let title = '';
  let size = 0;
  let min: [number, number, number] = [0, 0, 0];
  let max: [number, number, number] = [1, 1, 1];
  let data: Float32Array | null = null;
  let n = 0;
  let lineNo = 0;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const head = /^([A-Z_0-9]+)\b\s*(.*)$/.exec(line);
    if (head && /[A-Z]/.test(head[1][0])) {
      const [, key, rest] = head;
      if (key === 'TITLE') title = rest.replace(/^"|"$/g, '').trim();
      else if (key === 'LUT_3D_SIZE') {
        size = Number(rest);
        if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE) return { ok: false, error: `LUT_3D_SIZE must be 2–${MAX_SIZE} (line ${lineNo}).` };
        data = new Float32Array(size * size * size * 3);
      } else if (key === 'LUT_1D_SIZE') return { ok: false, error: 'This is a 1D LUT; VINX applies 3D LUTs (.cube with LUT_3D_SIZE).' };
      else if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
        const v = rest.split(/\s+/).map(Number);
        if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) return { ok: false, error: `${key} needs three numbers (line ${lineNo}).` };
        if (key === 'DOMAIN_MIN') min = v as [number, number, number]; else max = v as [number, number, number];
      }
      // Other keywords (LUT_IN_VIDEO_RANGE etc.) are ignored.
      continue;
    }
    if (!data) return { ok: false, error: `Data before LUT_3D_SIZE (line ${lineNo}).` };
    const v = line.split(/\s+/).map(Number);
    if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) return { ok: false, error: `Line ${lineNo} is not three numbers.` };
    if (n >= data.length) return { ok: false, error: `More than ${size}³ entries (line ${lineNo}).` };
    data[n++] = v[0]; data[n++] = v[1]; data[n++] = v[2];
  }
  if (!data) return { ok: false, error: 'No LUT_3D_SIZE line; is this a .cube 3D LUT?' };
  if (n !== data.length) return { ok: false, error: `Expected ${size ** 3} entries, found ${n / 3}.` };
  for (let i = 0; i < 3; i++) if (!(max[i] > min[i])) return { ok: false, error: 'DOMAIN_MAX must be above DOMAIN_MIN.' };
  return { ok: true, lut: { title: title || fallbackTitle, size, domainMin: min, domainMax: max, data } };
}

/** Trilinear sample; r/g/b in the LUT domain, clamped. Writes into `out`. */
export function sampleLut(lut: Lut3D, r: number, g: number, b: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const s = lut.size;
  const m = s - 1;
  const pos = (v: number, i: number) => {
    const t = (v - lut.domainMin[i]) / (lut.domainMax[i] - lut.domainMin[i]);
    return Math.min(m, Math.max(0, t * m));
  };
  const x = pos(r, 0), y = pos(g, 1), z = pos(b, 2);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(m, x0 + 1), y1 = Math.min(m, y0 + 1), z1 = Math.min(m, z0 + 1);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const d = lut.data;
  const idx = (xi: number, yi: number, zi: number) => (xi + yi * s + zi * s * s) * 3;
  for (let c = 0; c < 3; c++) {
    const c000 = d[idx(x0, y0, z0) + c], c100 = d[idx(x1, y0, z0) + c];
    const c010 = d[idx(x0, y1, z0) + c], c110 = d[idx(x1, y1, z0) + c];
    const c001 = d[idx(x0, y0, z1) + c], c101 = d[idx(x1, y0, z1) + c];
    const c011 = d[idx(x0, y1, z1) + c], c111 = d[idx(x1, y1, z1) + c];
    const c00 = c000 + (c100 - c000) * fx, c10 = c010 + (c110 - c010) * fx;
    const c01 = c001 + (c101 - c001) * fx, c11 = c011 + (c111 - c011) * fx;
    const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
    out[c] = c0 + (c1 - c0) * fz;
  }
  return out;
}

/**
 * Apply to RGBA bytes in place. `intensity` 0..1 mixes original → graded.
 * Pixel values map onto the LUT domain (0..1 for most LUTs).
 */
export function applyLutToPixels(lut: Lut3D, px: Uint8ClampedArray, intensity = 1): void {
  const k = Math.min(1, Math.max(0, intensity));
  if (k === 0) return;
  const out: [number, number, number] = [0, 0, 0];
  const span = [0, 1, 2].map((i) => lut.domainMax[i] - lut.domainMin[i]);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    sampleLut(lut, lut.domainMin[0] + r * span[0], lut.domainMin[1] + g * span[1], lut.domainMin[2] + b * span[2], out);
    px[i] = (r + (out[0] - r) * k) * 255;
    px[i + 1] = (g + (out[1] - g) * k) * 255;
    px[i + 2] = (b + (out[2] - b) * k) * 255;
  }
}

/** Identity LUT of a given size (for tests and as a neutral default). */
export function identityLut(size = 2): Lut3D {
  const data = new Float32Array(size ** 3 * 3);
  let n = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    data[n++] = r / (size - 1); data[n++] = g / (size - 1); data[n++] = b / (size - 1);
  }
  return { title: 'Identity', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}
