// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX FLUX - Animation Expression Evaluator
// A safe, sandboxed expression engine for live per-frame property evaluation.
// Expressions are plain numeric formulas (After Effects / Motion style) that may
// reference whitelisted variables (time, value, index, frame, fps) and helpers
// (Math, wiggle, random, noise, clamp, lerp, smoothstep). They evaluate to a
// number or an [x, y] pair. A malformed expression NEVER throws to the caller —
// it degrades to the property's static value.
// =============================================================================

// ---------------------------------------------------------------------------
// Context passed to every evaluation.
// ---------------------------------------------------------------------------
export interface ExpressionContext {
  /** Current time in seconds (frame / fps). */
  time: number;
  /** The property's static value (the value before the expression applies). */
  value: number;
  /** Layer index within the composition. */
  index: number;
  /** Current frame number. */
  frame: number;
  /** Composition frame rate. */
  fps: number;
}

export type ExpressionResult = number | [number, number];

// ---------------------------------------------------------------------------
// Keywords that must never appear in a user expression. We reject the source
// outright if any are present, so the sandboxed Function body can only see the
// names we explicitly inject. Word-boundary matched to avoid false positives
// on substrings (e.g. "windowed" would NOT trip "window").
// ---------------------------------------------------------------------------
const BLOCKED_PATTERN =
  /\b(window|document|globalThis|self|eval|Function|fetch|XMLHttpRequest|import|require|process|module|exports|__dirname|__filename|localStorage|sessionStorage|indexedDB|navigator|location|history|setTimeout|setInterval|setImmediate|queueMicrotask|postMessage|Worker|SharedWorker|ServiceWorker|WebSocket|Reflect|Proxy|constructor|prototype|__proto__|arguments|globalThis)\b/;

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32). Same seed -> same sequence, so a
// given frame always produces the same "random" value: playback and export are
// bit-for-bit reproducible. Returns a generator producing floats in [0, 1).
// ---------------------------------------------------------------------------
export function makeSeededRandom(seed: number): () => number {
  // Normalize the seed into a 32-bit integer.
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Smooth 1D value noise: hashes integer lattice points and smoothly
// interpolates. Deterministic and continuous (unlike raw random), so it reads
// as organic drift rather than jitter. Output range roughly [-1, 1].
// ---------------------------------------------------------------------------
function valueNoise1D(x: number, seed: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const hash = (n: number): number => {
    const r = makeSeededRandom((n * 2654435761) ^ seed)();
    return r * 2 - 1;
  };
  const a = hash(xi);
  const b = hash(xi + 1);
  // Smoothstep (Hermite) blend for C1 continuity.
  const u = xf * xf * (3 - 2 * xf);
  return a + (b - a) * u;
}

// ---------------------------------------------------------------------------
// Build the helper bag for a single evaluation. Helpers close over the context
// so wiggle/random are deterministic for a (frame, index) pair.
// ---------------------------------------------------------------------------
function makeHelpers(ctx: ExpressionContext) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
  const smoothstep = (edge0: number, edge1: number, x: number) => {
    if (edge0 === edge1) return x < edge0 ? 0 : 1;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // noise(x): smooth deterministic 1D noise, layer-stable seed.
  const noise = (x: number) => valueNoise1D(x, (ctx.index + 1) * 1013);

  // random(seed?): deterministic per-frame pseudo-random in [0, 1). When a seed
  // is supplied it is mixed with the frame so each frame stays reproducible but
  // distinct; omit the seed for a frame+layer-stable value.
  const random = (seed?: number) => {
    const base = (ctx.frame + 1) * 1009 + (ctx.index + 1) * 7919;
    const mixed = seed === undefined ? base : base ^ (Math.floor(seed) * 2654435761);
    return makeSeededRandom(mixed)();
  };

  // wiggle(freq, amp): smooth band-limited noise oscillation around 0 at `freq`
  // wiggles per second with peak amplitude `amp`. Built from summed smooth noise
  // octaves so playback is deterministic and continuous (no per-frame jitter).
  const wiggle = (freq: number, amp: number) => {
    const t = ctx.time * (freq || 0);
    const layerSeed = (ctx.index + 1) * 2749;
    // Two octaves of smooth noise for a natural, non-repetitive feel.
    const n = valueNoise1D(t, layerSeed) * 0.7 + valueNoise1D(t * 2.13 + 4.2, layerSeed + 31) * 0.3;
    return n * (amp || 0);
  };

  return { clamp, lerp, smoothstep, noise, random, wiggle };
}

// ---------------------------------------------------------------------------
// Compiled expression. Compilation validates the source and produces a
// sandboxed evaluator. Keeping the Function compiled avoids re-parsing the
// source on every frame.
// ---------------------------------------------------------------------------
export interface CompiledExpression {
  /** Evaluate against a context. Never throws — returns the static value on error. */
  eval: (ctx: ExpressionContext) => ExpressionResult;
  /** Validation/runtime error message, or null when the expression is usable. */
  error: string | null;
}

// Names injected into the sandbox, in a fixed order.
const ARG_NAMES = [
  'time',
  'value',
  'index',
  'frame',
  'fps',
  'Math',
  'wiggle',
  'random',
  'noise',
  'clamp',
  'lerp',
  'smoothstep',
] as const;

/**
 * Validate + compile an expression string once. The returned object can be
 * evaluated per frame cheaply. If the source is structurally invalid (blocked
 * keyword or syntax error), `error` is set and `eval` falls back to the static
 * value.
 *
 * Sandboxing: we never use `eval`. We build a single `Function` whose only
 * parameters are the whitelisted names above, run its body in strict mode, and
 * pass ONLY those named arguments. window/globalThis/etc. are rejected at
 * compile time by BLOCKED_PATTERN, so the body cannot reach host globals by
 * name. Every evaluation is wrapped in try/catch.
 */
export function compileExpression(source: string): CompiledExpression {
  const code = (source || '').trim();

  if (!code) {
    return { eval: (ctx) => ctx.value, error: null };
  }

  if (BLOCKED_PATTERN.test(code)) {
    return {
      eval: (ctx) => ctx.value,
      error: 'Blocked keyword. Only math + animation helpers are allowed.',
    };
  }

  let fn: (...args: unknown[]) => unknown;
  try {
    // Strict mode prevents implicit globals and `with`; the body is an
    // expression-or-statements block that may `return` early or fall through to
    // the trailing return of the last expression.
    // eslint-disable-next-line no-new-func
    fn = new Function(
      ...ARG_NAMES,
      `"use strict";\nreturn ( ${code} \n);`
    ) as (...args: unknown[]) => unknown;
  } catch (err) {
    return {
      eval: (ctx) => ctx.value,
      error: err instanceof Error ? err.message : 'Syntax error',
    };
  }

  const compiled: CompiledExpression = {
    error: null,
    eval: (ctx: ExpressionContext): ExpressionResult => {
      try {
        const h = makeHelpers(ctx);
        const out = fn(
          ctx.time,
          ctx.value,
          ctx.index,
          ctx.frame,
          ctx.fps,
          Math,
          h.wiggle,
          h.random,
          h.noise,
          h.clamp,
          h.lerp,
          h.smoothstep
        );
        if (typeof out === 'number' && isFinite(out)) return out;
        if (
          Array.isArray(out) &&
          out.length >= 2 &&
          typeof out[0] === 'number' &&
          typeof out[1] === 'number' &&
          isFinite(out[0]) &&
          isFinite(out[1])
        ) {
          return [out[0], out[1]];
        }
        // Non-numeric / non-finite -> degrade to static value.
        return ctx.value;
      } catch {
        return ctx.value;
      }
    },
  };

  return compiled;
}

/**
 * Validate an expression and return a human-readable error (or null).
 *
 * Note: the compiled `eval()` swallows runtime errors (returning the static
 * value) so playback never throws — that hides genuine mistakes like a typo'd
 * identifier from the editor. So here we run a probe evaluation through the RAW
 * function (no catch) to surface syntax AND runtime errors up front.
 */
export function validateExpression(source: string): string | null {
  const code = (source || '').trim();
  if (!code) return null;
  if (BLOCKED_PATTERN.test(code)) {
    return 'Blocked keyword. Only math + animation helpers are allowed.';
  }
  let raw: (...args: unknown[]) => unknown;
  try {
    // eslint-disable-next-line no-new-func
    raw = new Function(
      ...ARG_NAMES,
      `"use strict";\nreturn ( ${code} \n);`
    ) as (...args: unknown[]) => unknown;
  } catch (err) {
    return err instanceof Error ? err.message : 'Syntax error';
  }
  const probe: ExpressionContext = { time: 0, value: 0, index: 0, frame: 0, fps: 30 };
  const h = makeHelpers(probe);
  try {
    raw(
      probe.time, probe.value, probe.index, probe.frame, probe.fps,
      Math, h.wiggle, h.random, h.noise, h.clamp, h.lerp, h.smoothstep
    );
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid expression';
  }
}

// ---------------------------------------------------------------------------
// Small LRU-ish compile cache so repeated render frames reuse compiled
// functions instead of re-parsing the same source string every frame.
// ---------------------------------------------------------------------------
const COMPILE_CACHE = new Map<string, CompiledExpression>();
const COMPILE_CACHE_MAX = 256;

export function getCompiled(source: string): CompiledExpression {
  const key = source || '';
  const hit = COMPILE_CACHE.get(key);
  if (hit) return hit;
  const compiled = compileExpression(key);
  if (COMPILE_CACHE.size >= COMPILE_CACHE_MAX) {
    const firstKey = COMPILE_CACHE.keys().next().value;
    if (firstKey !== undefined) COMPILE_CACHE.delete(firstKey);
  }
  COMPILE_CACHE.set(key, compiled);
  return compiled;
}

/**
 * Convenience: evaluate a source string for a single context, using the compile
 * cache. Always returns a finite number; if the expression yields a pair only
 * the first component is returned (use getCompiled().eval directly for pairs).
 */
export function evaluateExpression(source: string, ctx: ExpressionContext): number {
  const out = getCompiled(source).eval(ctx);
  return Array.isArray(out) ? out[0] : out;
}
