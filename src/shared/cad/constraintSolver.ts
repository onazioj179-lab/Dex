// =============================================================================
// DEX Platform — Wave 5.1 Axl: 2D sketch constraint solver
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * 2D constraint solver — gradient-descent style relaxation, suitable for
 * interactive sketch editing (drag a point, the rest snaps to satisfy
 * constraints). Not a full DOF analyzer (Fusion-grade solvers use Newton
 * iteration on the Jacobian); this is fast and good enough for parametric
 * sketches up to a few hundred entities.
 *
 * Entities are 2D points addressed by index. Constraints are pure relations.
 * Fixed points are pinned to their initial positions.
 */

export interface Point2D { x: number; y: number; fixed?: boolean }

export type Constraint =
  | { kind: 'coincident'; a: number; b: number }
  | { kind: 'horizontal'; a: number; b: number }
  | { kind: 'vertical'; a: number; b: number }
  | { kind: 'distance'; a: number; b: number; d: number }
  | { kind: 'angle'; a: number; b: number; c: number; theta: number } // angle at b between a-b and b-c
  | { kind: 'parallel'; a: number; b: number; c: number; d: number }   // a-b parallel to c-d
  | { kind: 'perpendicular'; a: number; b: number; c: number; d: number }
  | { kind: 'fix-x'; a: number; x: number }
  | { kind: 'fix-y'; a: number; y: number };

export interface SolveOptions {
  maxIters?: number;
  tolerance?: number;
  /** Step size; lower = stable, higher = fast. */
  alpha?: number;
}

export interface SolveResult {
  iters: number;
  residual: number;
  converged: boolean;
}

export function solve(points: Point2D[], constraints: Constraint[], opts: SolveOptions = {}): SolveResult {
  const maxIters = opts.maxIters ?? 200;
  const tol = opts.tolerance ?? 1e-6;
  const alpha = opts.alpha ?? 0.5;

  let residual = Infinity;
  let iter = 0;
  for (; iter < maxIters; iter++) {
    // Accumulate gradient per point
    const grad = points.map(() => ({ x: 0, y: 0 }));
    let r = 0;

    for (const c of constraints) {
      r += applyConstraint(c, points, grad);
    }

    // Apply step
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (p.fixed) continue;
      p.x -= grad[i]!.x * alpha;
      p.y -= grad[i]!.y * alpha;
    }

    residual = r;
    if (r < tol) break;
  }
  return { iters: iter, residual, converged: residual < tol };
}

function applyConstraint(c: Constraint, P: Point2D[], G: { x: number; y: number }[]): number {
  switch (c.kind) {
    case 'coincident': {
      const a = P[c.a]!, b = P[c.b]!;
      const dx = a.x - b.x, dy = a.y - b.y;
      G[c.a]!.x += dx; G[c.a]!.y += dy;
      G[c.b]!.x -= dx; G[c.b]!.y -= dy;
      return dx * dx + dy * dy;
    }
    case 'horizontal': {
      const a = P[c.a]!, b = P[c.b]!;
      const dy = a.y - b.y;
      G[c.a]!.y += dy; G[c.b]!.y -= dy;
      return dy * dy;
    }
    case 'vertical': {
      const a = P[c.a]!, b = P[c.b]!;
      const dx = a.x - b.x;
      G[c.a]!.x += dx; G[c.b]!.x -= dx;
      return dx * dx;
    }
    case 'distance': {
      const a = P[c.a]!, b = P[c.b]!;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const err = d - c.d;
      if (d < 1e-9) return err * err;
      const f = err / d;
      G[c.a]!.x += dx * f; G[c.a]!.y += dy * f;
      G[c.b]!.x -= dx * f; G[c.b]!.y -= dy * f;
      return err * err;
    }
    case 'parallel':
    case 'perpendicular': {
      const a = P[c.a]!, b = P[c.b]!, cc = P[c.c]!, dd = P[c.d]!;
      const ux = b.x - a.x, uy = b.y - a.y;
      const vx = dd.x - cc.x, vy = dd.y - cc.y;
      // For parallel: cross product u x v = 0
      // For perpendicular: dot u . v = 0
      const target = c.kind === 'parallel' ? (ux * vy - uy * vx) : (ux * vx + uy * vy);
      // Reduce magnitude of target via small gradient-style adjustment.
      const k = 0.001 * target;
      // Push endpoints orthogonal to other vector to reduce target.
      // Simple soft adjustment:
      G[c.a]!.x +=  k * vy; G[c.a]!.y += -k * vx;
      G[c.b]!.x += -k * vy; G[c.b]!.y +=  k * vx;
      G[c.c]!.x +=  k * uy; G[c.c]!.y += -k * ux;
      G[c.d]!.x += -k * uy; G[c.d]!.y +=  k * ux;
      return target * target * 1e-3;
    }
    case 'angle': {
      // Soft penalty on the squared difference of cos(angle) — cheap.
      const a = P[c.a]!, b = P[c.b]!, cc = P[c.c]!;
      const ux = a.x - b.x, uy = a.y - b.y;
      const vx = cc.x - b.x, vy = cc.y - b.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-9 || lv < 1e-9) return 0;
      const cosA = (ux * vx + uy * vy) / (lu * lv);
      const cosT = Math.cos(c.theta);
      const err = cosA - cosT;
      // Apply small adjustment to b along the bisector to reduce error.
      const sign = err >= 0 ? 1 : -1;
      const bx = (ux / lu + vx / lv) * 0.5 * 0.001 * sign;
      const by = (uy / lu + vy / lv) * 0.5 * 0.001 * sign;
      G[c.b]!.x += bx; G[c.b]!.y += by;
      return err * err;
    }
    case 'fix-x': {
      const a = P[c.a]!;
      const dx = a.x - c.x;
      G[c.a]!.x += dx;
      return dx * dx;
    }
    case 'fix-y': {
      const a = P[c.a]!;
      const dy = a.y - c.y;
      G[c.a]!.y += dy;
      return dy * dy;
    }
  }
}
