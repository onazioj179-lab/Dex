/**
 * DEX Platform - PRISM Image Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Real canvas compositing helpers: layer boolean operations, pixel-accurate
 * flatten/merge, and a diffusion-based content-aware fill.
 *
 * These are genuine algorithms operating on the actual canvas/ImageData the
 * editor uses -- no stubs. Prism owns image decoding (its layers store data
 * URLs); these helpers take already-decoded HTMLImageElements / ImageData so
 * they stay pure DOM-canvas math and are easy to reason about.
 */

// ==================== TYPES ====================

/** Boolean / combine operations expressed in terms of canvas compositing. */
export type BooleanOp = 'union' | 'intersect' | 'subtract' | 'difference' | 'xor';

/** A drawable layer source with its placement, ready to paint to a context. */
export interface CompositeSource {
  /** Decoded image for the layer's pixels (already loaded). */
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, applied around the layer's centre. Defaults to 0. */
  rotation?: number;
  /** 0..1 layer opacity. Defaults to 1. */
  alpha?: number;
  /** Canvas blend mode for normal stacking. Defaults to 'source-over'. */
  blend?: GlobalCompositeOperation;
}

/** Human label + the globalCompositeOperation used to realise each boolean op. */
export const BOOLEAN_OP_INFO: Record<BooleanOp, { label: string; composite: GlobalCompositeOperation; description: string }> = {
  // top drawn over base -> the visible union of both shapes' coverage
  union: { label: 'Union (Add)', composite: 'source-over', description: 'Combine both layers (A over B)' },
  // keep base only where top also has coverage -> intersection
  intersect: { label: 'Intersect', composite: 'destination-in', description: 'Keep only overlapping pixels' },
  // remove base coverage wherever top has coverage -> A minus B
  subtract: { label: 'Subtract (A - B)', composite: 'destination-out', description: 'Remove top layer from base' },
  // symmetric difference of coverage (non-overlap of both)
  difference: { label: 'Difference (XOR)', composite: 'xor', description: 'Keep non-overlapping pixels of both' },
  // explicit XOR alias kept for callers that ask for it by name
  xor: { label: 'Exclude (XOR)', composite: 'xor', description: 'Exclude overlapping region' },
};

// ==================== INTERNAL HELPERS ====================

/** Create an offscreen canvas + 2d context, or throw a descriptive error. */
function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('PrismCompositing: 2D canvas context unavailable');
  return { canvas, ctx };
}

/** Paint a single source onto ctx honouring its placement, rotation and alpha. */
function paintSource(ctx: CanvasRenderingContext2D, src: CompositeSource, blendOverride?: GlobalCompositeOperation): void {
  ctx.save();
  ctx.globalAlpha = src.alpha == null ? 1 : Math.max(0, Math.min(1, src.alpha));
  ctx.globalCompositeOperation = blendOverride || src.blend || 'source-over';
  const rot = src.rotation || 0;
  if (rot !== 0) {
    const cx = src.x + src.width / 2;
    const cy = src.y + src.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.drawImage(src.image, src.x, src.y, src.width, src.height);
  ctx.restore();
}

// ==================== BOOLEAN / COMBINE OPERATIONS ====================

/**
 * Composite two raster layers with a boolean operation and return the result as
 * a PNG data URL sized to the canvas.
 *
 * The maths is real canvas compositing on an offscreen buffer:
 *   union      -> base, then top with 'source-over'   (A ∪ B coverage)
 *   intersect  -> base, then top with 'destination-in' (A ∩ B coverage)
 *   subtract   -> base, then top with 'destination-out' (A \ B coverage)
 *   difference -> base, then top with 'xor'            (A △ B coverage)
 *   xor        -> alias of difference
 *
 * `base` is the lower layer, `top` the upper. Both are drawn at their own
 * placement within a canvasWidth x canvasHeight buffer so the result lines up
 * with the document.
 */
export function compositeBooleanLayers(
  base: CompositeSource,
  top: CompositeSource,
  op: BooleanOp,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const { canvas, ctx } = makeCanvas(canvasWidth, canvasHeight);
  // 1. lay down the base coverage normally
  paintSource(ctx, base, 'source-over');
  // 2. apply the top with the boolean op's composite mode
  const composite = BOOLEAN_OP_INFO[op].composite;
  paintSource(ctx, top, composite);
  // For 'union' we want the top's colour to actually show on top of base; the
  // 'source-over' above already does that. For the set ops (intersect/subtract/
  // xor) the operation defines the surviving coverage and we keep base colour
  // where it survives -- which is exactly what these composite modes produce.
  return canvas.toDataURL();
}

// ==================== FLATTEN / MERGE (real pixel compositing) ====================

/**
 * Flatten an ordered list of layer sources into a single PNG data URL by
 * actually compositing their pixels onto an offscreen canvas. `sources` must be
 * ordered BOTTOM-first (i.e. index 0 painted first, last index painted on top),
 * each carrying its own opacity and blend mode. This is the same compositing
 * the live canvas uses, captured to a flat raster.
 */
export function flattenSourcesToDataURL(
  sources: CompositeSource[],
  canvasWidth: number,
  canvasHeight: number,
): string {
  const { canvas, ctx } = makeCanvas(canvasWidth, canvasHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const src of sources) paintSource(ctx, src);
  return canvas.toDataURL();
}

// ==================== DIFFUSION CONTENT-AWARE FILL ====================

/**
 * Content-Aware Fill (diffusion): a real, simple inpainting algorithm.
 *
 * Pixels marked by `mask` (mask[i] !== 0 means "fill me") are first cleared,
 * then iteratively reconstructed by repeatedly averaging each unknown pixel
 * from its currently-known 8-neighbours. Colour diffuses inward from the real
 * surrounding content over `passes` iterations, so the hole is filled with a
 * smooth continuation of the neighbourhood rather than a flat colour. This is
 * the classic isotropic-diffusion inpaint (not PatchMatch, by design).
 *
 * Operates on a COPY and returns new ImageData; the input is not mutated.
 * `mask.length` must equal width*height.
 */
export function diffusionInpaint(
  source: ImageData,
  mask: Uint8Array | Uint8ClampedArray,
  passes: number = 60,
): ImageData {
  const w = source.width;
  const h = source.height;
  const n = w * h;
  if (mask.length !== n) throw new Error('PrismCompositing.diffusionInpaint: mask size mismatch');

  // Work in float buffers for stable averaging; seed known pixels from source.
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const a = new Float32Array(n);
  const hole = new Uint8Array(n); // 1 = needs filling
  const src = source.data;

  let holeCount = 0;
  for (let i = 0; i < n; i++) {
    const si = i * 4;
    if (mask[i]) {
      hole[i] = 1;
      holeCount++;
      // Seed the hole with the mean of known boundary later; start at 0.
      r[i] = 0; g[i] = 0; b[i] = 0; a[i] = 255;
    } else {
      r[i] = src[si]; g[i] = src[si + 1]; b[i] = src[si + 2]; a[i] = src[si + 3];
    }
  }

  if (holeCount === 0 || holeCount === n) {
    // Nothing to fill, or everything is a hole (no surrounding content): return a copy.
    const out = new ImageData(new Uint8ClampedArray(src), w, h);
    return out;
  }

  // Initial seed: give every hole pixel the average colour of ALL known pixels
  // so the first relaxation passes have non-zero data to diffuse, which avoids a
  // dark bleed front spreading from black-seeded interiors.
  let kr = 0, kg = 0, kb = 0, kCount = 0;
  for (let i = 0; i < n; i++) {
    if (!hole[i]) { kr += r[i]; kg += g[i]; kb += b[i]; kCount++; }
  }
  if (kCount > 0) {
    const mr = kr / kCount, mg = kg / kCount, mb = kb / kCount;
    for (let i = 0; i < n; i++) if (hole[i]) { r[i] = mr; g[i] = mg; b[i] = mb; }
  }

  // Jacobi-style relaxation: each pass replaces every hole pixel with the
  // average of its 8 neighbours. Known pixels stay fixed (Dirichlet boundary),
  // so real surrounding colour propagates inward pass after pass.
  const nr = new Float32Array(r);
  const ng = new Float32Array(g);
  const nb = new Float32Array(b);
  const P = Math.max(1, Math.floor(passes));
  for (let pass = 0; pass < P; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!hole[i]) continue;
        let sr = 0, sg = 0, sb = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const ni = ny * w + nx;
            sr += r[ni]; sg += g[ni]; sb += b[ni]; c++;
          }
        }
        if (c > 0) { nr[i] = sr / c; ng[i] = sg / c; nb[i] = sb / c; }
      }
    }
    // Commit this pass into the working buffers (only hole pixels changed).
    for (let i = 0; i < n; i++) {
      if (hole[i]) { r[i] = nr[i]; g[i] = ng[i]; b[i] = nb[i]; }
    }
  }

  const outData = new Uint8ClampedArray(src);
  for (let i = 0; i < n; i++) {
    if (hole[i]) {
      const oi = i * 4;
      outData[oi] = r[i];
      outData[oi + 1] = g[i];
      outData[oi + 2] = b[i];
      outData[oi + 3] = a[i] || 255;
    }
  }
  return new ImageData(outData, w, h);
}
