// =============================================================================
// DEX Platform — Wave 2.1 VINX: 3D LUT loader + trilinear apply
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * 3D LUT (.cube / .3dl) parser + CPU trilinear interpolation.
 *
 * The CPU path is the fallback. The WebGPU path lives in the renderer (a
 * 3D texture sampled in WGSL) and reuses the same `LUT3D` data structure.
 *
 * Format support:
 *   .cube — Adobe / Resolve standard. LUT_3D_SIZE N + N^3 RGB triplets.
 *   .3dl  — Lustre format. Header lines + per-line RGB integers.
 */

export interface LUT3D {
  size: number; // typically 17 / 33 / 65
  /** Length = size^3 * 3, packed as RGB triplets row-major. */
  data: Float32Array;
  domain?: { min: [number, number, number]; max: [number, number, number] };
}

export function parseCube(text: string): LUT3D {
  let size = 0;
  const triplets: number[] = [];
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('TITLE')) continue;
    if (line.startsWith('LUT_3D_SIZE')) {
      const n = parseInt(line.split(/\s+/)[1] ?? '0', 10);
      if (!Number.isFinite(n) || n < 2 || n > 256) throw new Error(`parseCube: invalid LUT_3D_SIZE ${n}`);
      size = n;
      continue;
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      throw new Error('parseCube: 1D LUT not supported');
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) domainMin = [parts[0]!, parts[1]!, parts[2]!];
      continue;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      if (parts.length === 3) domainMax = [parts[0]!, parts[1]!, parts[2]!];
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every(p => Number.isFinite(p))) {
      triplets.push(parts[0]!, parts[1]!, parts[2]!);
    }
  }

  if (size === 0) throw new Error('parseCube: missing LUT_3D_SIZE');
  const expected = size * size * size * 3;
  if (triplets.length !== expected) {
    throw new Error(`parseCube: expected ${expected} values, got ${triplets.length}`);
  }
  return {
    size,
    data: new Float32Array(triplets),
    domain: { min: domainMin, max: domainMax },
  };
}

export function parse3dl(text: string): LUT3D {
  // Lustre 3DL: first non-comment line is "0 32 64 ... 1023" (size markers)
  // followed by N^3 lines of "R G B" integers (typically 10-bit so 0..1023).
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('parse3dl: empty');

  // First line: header markers — count how many tokens => grid size.
  const headerToks = lines[0]!.split(/\s+/).map(Number);
  const size = headerToks.length;
  if (size < 2 || size > 256) throw new Error(`parse3dl: invalid size ${size}`);

  // Determine integer max from the largest header value.
  const maxHeaderTok = Math.max(...headerToks);
  // Common: 1023 (10-bit) or 4095 (12-bit). Default range 0..1.
  const intMax = maxHeaderTok >= 4 ? maxHeaderTok : 1;

  const expected = size * size * size;
  const data = new Float32Array(expected * 3);
  let idx = 0;
  for (let i = 1; i < lines.length && idx < expected; i++) {
    const parts = lines[i]!.split(/\s+/).map(Number);
    if (parts.length < 3) continue;
    data[idx * 3]     = parts[0]! / intMax;
    data[idx * 3 + 1] = parts[1]! / intMax;
    data[idx * 3 + 2] = parts[2]! / intMax;
    idx++;
  }
  if (idx !== expected) throw new Error(`parse3dl: expected ${expected} entries, got ${idx}`);
  return { size, data };
}

/** Sample LUT at normalized RGB (0..1). Trilinear interpolation. */
export function sampleLut(lut: LUT3D, r: number, g: number, b: number): [number, number, number] {
  const N = lut.size;
  const sx = clamp01(r) * (N - 1);
  const sy = clamp01(g) * (N - 1);
  const sz = clamp01(b) * (N - 1);
  const x0 = Math.floor(sx), y0 = Math.floor(sy), z0 = Math.floor(sz);
  const x1 = Math.min(x0 + 1, N - 1), y1 = Math.min(y0 + 1, N - 1), z1 = Math.min(z0 + 1, N - 1);
  const fx = sx - x0, fy = sy - y0, fz = sz - z0;

  const c000 = idx(lut, x0, y0, z0);
  const c100 = idx(lut, x1, y0, z0);
  const c010 = idx(lut, x0, y1, z0);
  const c110 = idx(lut, x1, y1, z0);
  const c001 = idx(lut, x0, y0, z1);
  const c101 = idx(lut, x1, y0, z1);
  const c011 = idx(lut, x0, y1, z1);
  const c111 = idx(lut, x1, y1, z1);

  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const c00 = c000[k] * (1 - fx) + c100[k] * fx;
    const c01 = c001[k] * (1 - fx) + c101[k] * fx;
    const c10 = c010[k] * (1 - fx) + c110[k] * fx;
    const c11 = c011[k] * (1 - fx) + c111[k] * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    out[k] = c0 * (1 - fz) + c1 * fz;
  }
  return out;
}

/** Apply LUT to an RGBA image buffer in-place (sRGB 0..255 byte values). */
export function applyLutToImage(lut: LUT3D, rgba: Uint8ClampedArray): void {
  const inv = 1 / 255;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]! * inv, g = rgba[i + 1]! * inv, b = rgba[i + 2]! * inv;
    const out = sampleLut(lut, r, g, b);
    rgba[i]     = Math.round(clamp01(out[0]) * 255);
    rgba[i + 1] = Math.round(clamp01(out[1]) * 255);
    rgba[i + 2] = Math.round(clamp01(out[2]) * 255);
  }
}

function idx(lut: LUT3D, x: number, y: number, z: number): [number, number, number] {
  const N = lut.size;
  const off = (z * N * N + y * N + x) * 3;
  return [lut.data[off]!, lut.data[off + 1]!, lut.data[off + 2]!];
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Build identity LUT for testing. */
export function identityLut(size: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[i++] = x / (size - 1);
        data[i++] = y / (size - 1);
        data[i++] = z / (size - 1);
      }
    }
  }
  return { size, data };
}
