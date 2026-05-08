// =============================================================================
// DEX Platform — Wave 3.1 Prism: smart objects (non-destructive)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Smart object — wraps a source asset with a re-editable transform + filter
 * stack. Re-rendering is on demand; the host caches the rasterized result by
 * a content hash of (source-id + transform + filters).
 *
 * No image work happens here — this module is pure data + cache key logic.
 * The renderer evaluates the cache key, looks up the bitmap, and re-runs
 * the filter pipeline if a miss occurs.
 */

export interface Transform2D {
  /** Top-left in canvas space. */
  x: number; y: number;
  /** Output width / height in canvas pixels (decouple from source size). */
  w: number; h: number;
  /** Rotation in radians. */
  rot: number;
  /** Skew x/y in radians. */
  skewX: number; skewY: number;
  /** Anchor (0..1, 0..1) for rotation/scale center. */
  ax: number; ay: number;
  /** Flip horizontal/vertical. */
  flipX: boolean; flipY: boolean;
}

export const IDENTITY_TRANSFORM: Transform2D = {
  x: 0, y: 0, w: 0, h: 0, rot: 0, skewX: 0, skewY: 0, ax: 0.5, ay: 0.5, flipX: false, flipY: false,
};

export type FilterStep =
  | { id: string; kind: 'blur-gaussian'; sigma: number }
  | { id: string; kind: 'sharpen'; amount: number; radius: number }
  | { id: string; kind: 'levels'; in: [number, number]; gamma: number; out: [number, number] }
  | { id: string; kind: 'curves'; lut: Float32Array }
  | { id: string; kind: 'hue-sat'; hue: number; sat: number; light: number }
  | { id: string; kind: 'invert' }
  | { id: string; kind: 'grayscale' }
  | { id: string; kind: 'noise'; amount: number };

export interface SmartObject {
  id: string;
  /** Asset id in the project — actual bytes come from the asset registry. */
  sourceAssetId: string;
  /** Transform in canvas space. */
  transform: Transform2D;
  /** Ordered, non-destructive filter stack. */
  filters: FilterStep[];
  /** Mask asset id (optional). */
  maskAssetId?: string;
  /** Blending mode. */
  blendMode: BlendMode;
  /** Opacity 0..1. */
  opacity: number;
  /** Visible flag. */
  visible: boolean;
}

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

/**
 * Stable cache key. Same inputs => same key. Different inputs => different
 * key with very high probability. Plain string (FNV-1a 64 hex).
 */
export function cacheKey(obj: SmartObject): string {
  const json = JSON.stringify({
    a: obj.sourceAssetId,
    t: obj.transform,
    f: obj.filters.map(f => normalizeFilter(f)),
    m: obj.maskAssetId ?? null,
    b: obj.blendMode,
    o: obj.opacity,
  });
  return fnv1a64(json);
}

function normalizeFilter(f: FilterStep): unknown {
  if (f.kind === 'curves') {
    // Hash curve LUT contents
    return { id: f.id, kind: f.kind, lut: fnv1a64(Buffer.from(f.lut.buffer).toString('base64')) };
  }
  return f;
}

function fnv1a64(s: string): string {
  // 64-bit FNV-1a, returns 16-char hex.
  let hi = 0xcbf29ce4 | 0;
  let lo = 0x84222325 | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) & 0xff;
    lo = (lo ^ c) >>> 0;
    // Multiply by 0x100000001b3
    const lo2 = Math.imul(lo, 0x000001b3);
    const hi2 = Math.imul(hi, 0x000001b3) + Math.imul(lo, 0x00000100);
    lo = lo2 >>> 0;
    hi = hi2 >>> 0;
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}
