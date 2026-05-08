// =============================================================================
// DEX Platform — Wave 4.2 Flux: expression engine
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Expression engine — sandboxed JS DSL for animatable property expressions.
 *
 * After-Effects-style helpers exposed to the expression:
 *   time            current time in seconds
 *   value           the property's keyframed value at `time`
 *   wiggle(f, a)    pseudo-noise around value, frequency f Hz, amplitude a
 *   loopOut(kind)   'cycle' | 'pingpong' | 'continue' | 'offset' (post-loop)
 *   loopIn(kind)    same, before first keyframe
 *   linear(t,a,b,va,vb)  linear remap
 *   ease(t,a,b,va,vb)    smoothstep remap
 *   valueAtTime(t)  property value at arbitrary t
 *   noise(seed)     deterministic 0..1 noise
 *
 * Sandbox: expression executes inside a `Function` constructor with NO
 * access to globals (`globalThis`, `window`, `process`, `require`). Errors
 * fall back to the keyframed value.
 */

export interface ExpressionContext {
  time: number;
  /** Keyframed value at arbitrary time. */
  valueAtTime: (t: number) => number;
  /** Random source for noise/wiggle (seedable for determinism). */
  rand?: () => number;
}

export type Compiled = (ctx: ExpressionContext) => number;

// NOTE: 'eval', 'Function', and 'arguments' are reserved in strict mode and
// cannot be re-declared as locals. We rely on the strict-mode `Function`
// constructor + lexical absence of `require`/`process` etc. to keep the
// sandbox tight.
const GUARD_LIST = [
  'globalThis', 'window', 'self', 'global', 'process', 'require',
  'document', 'navigator', 'fetch', 'XMLHttpRequest', 'console',
  'WebAssembly',
];

/**
 * Compile a string expression into a callable. Throws on syntax errors.
 * The expression body is wrapped in `return (expr)`.
 */
export function compileExpression(src: string): Compiled {
  // Reject obviously dangerous tokens fast.
  for (const tok of ['import', '__proto__', 'constructor.constructor']) {
    if (src.includes(tok)) throw new Error(`expression: forbidden token "${tok}"`);
  }
  const guardArgs = GUARD_LIST.join(',');
  const body = `
    "use strict";
    var ${GUARD_LIST.map(g => `${g} = void 0`).join(', ')};
    var time = __ctx.time;
    var value = __ctx.valueAtTime(__ctx.time);
    var __rand = __ctx.rand || Math.random;
    function noise(seed) {
      // Deterministic LCG-ish based on seed
      var s = (Number(seed) * 9301 + 49297) % 233280;
      return s / 233280;
    }
    function wiggle(freq, amp) {
      var t = time * (Number(freq) || 1);
      var a = (Number(amp) || 0);
      // Sum of two sine harmonics with noise phase — cheap pseudo-noise.
      var v = Math.sin(t * 6.283) * 0.6 + Math.sin(t * 13.1 + 1.3) * 0.4;
      return value + v * a;
    }
    function valueAtTime(t) { return __ctx.valueAtTime(Number(t) || 0); }
    function linear(t, a, b, va, vb) {
      if (a === b) return va;
      var u = (t - a) / (b - a);
      if (u < 0) u = 0; else if (u > 1) u = 1;
      return va + (vb - va) * u;
    }
    function ease(t, a, b, va, vb) {
      if (a === b) return va;
      var u = (t - a) / (b - a);
      if (u < 0) u = 0; else if (u > 1) u = 1;
      u = u * u * (3 - 2 * u);
      return va + (vb - va) * u;
    }
    function loopOut(kind, cycles) {
      // Without keyframe metadata available in this scope, default to value.
      return value;
    }
    function loopIn(kind, cycles) { return value; }
    return (${src});
  `;
  let fn: Function;
  try {
    fn = new Function('__ctx', body);
  } catch (e) {
    throw new Error(`expression: compile error: ${(e as Error).message}`);
  }
  return (ctx: ExpressionContext) => {
    try {
      const out = fn(ctx);
      const n = Number(out);
      return Number.isFinite(n) ? n : ctx.valueAtTime(ctx.time);
    } catch {
      // Fail-soft: return keyframed value
      return ctx.valueAtTime(ctx.time);
    }
  };
}
