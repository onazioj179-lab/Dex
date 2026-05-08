// =============================================================================
// DEX Platform — Wave 4.2 Flux: keyframe interpolation modes
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Keyframe interpolation — extends the value-curve story with the four modes
 * After-Effects users expect:
 *   linear / hold / bezier / auto-bezier / continuous-bezier
 *
 * Plus "roving" keyframes — a flag that says "this keyframe's value is fixed
 * but its time is interpolated by the surrounding non-roving keyframes' time
 * spacing", used to make per-character text animation feel even.
 */

export type KeyMode = 'linear' | 'hold' | 'bezier' | 'auto-bezier' | 'continuous-bezier';

export interface Keyframe {
  /** Time in seconds. May be roving — see `roving`. */
  t: number;
  v: number;
  /** Outgoing mode. */
  outMode: KeyMode;
  /** Bezier handles. Only used for 'bezier'. (ix,iy) = incoming, (ox,oy) = outgoing in normalized 0..1 segment space. */
  ox?: number; oy?: number;
  ix?: number; iy?: number;
  /** Roving: time is automatically computed to evenly space against neighbours. */
  roving?: boolean;
}

export function valueAt(keys: readonly Keyframe[], t: number): number {
  if (keys.length === 0) return 0;
  if (keys.length === 1) return keys[0]!.v;
  const sorted = effectiveTimes(keys);
  if (t <= sorted[0]!.t) return sorted[0]!.v;
  const last = sorted[sorted.length - 1]!;
  if (t >= last.t) return last.v;
  // Binary search
  let lo = 0, hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.t <= t) lo = mid; else hi = mid;
  }
  const a = sorted[lo]!, b = sorted[hi]!;
  const u = (t - a.t) / (b.t - a.t);
  return interp(a, b, u);
}

function interp(a: Keyframe, b: Keyframe, u: number): number {
  switch (a.outMode) {
    case 'hold': return a.v;
    case 'linear': return a.v + (b.v - a.v) * u;
    case 'bezier':
    case 'auto-bezier':
    case 'continuous-bezier': {
      // 1D cubic bezier with handle y values (oy outgoing, iy incoming).
      const oy = a.oy ?? 0;
      const iy = b.iy ?? 0;
      const c0 = a.v;
      const c1 = a.v + oy * (b.v - a.v);
      const c2 = b.v + iy * (a.v - b.v);
      const c3 = b.v;
      const om = 1 - u;
      return om * om * om * c0
        + 3 * om * om * u * c1
        + 3 * om * u * u * c2
        + u * u * u * c3;
    }
  }
}

/**
 * Resolve effective times for roving keyframes by evenly spacing them between
 * the nearest non-roving anchors.
 */
function effectiveTimes(keys: readonly Keyframe[]): Keyframe[] {
  // Sort by index in the original array (caller is expected to maintain order).
  const arr = keys.map(k => ({ ...k }));
  let i = 0;
  while (i < arr.length) {
    if (!arr[i]!.roving) { i++; continue; }
    // Find the run of roving keyframes
    let j = i;
    while (j < arr.length && arr[j]!.roving) j++;
    const before = arr[i - 1];
    const after = arr[j];
    if (!before || !after) { i = j; continue; }
    const span = after.t - before.t;
    const steps = j - i + 1;
    for (let k = i; k < j; k++) {
      arr[k]!.t = before.t + span * ((k - i + 1) / steps);
    }
    i = j;
  }
  // Final sort to be safe.
  arr.sort((a, b) => a.t - b.t);
  return arr;
}
