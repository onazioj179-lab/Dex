// =============================================================================
// DEX Platform - DEX v3.10.0 wave S - motion + 3D primitives
// =============================================================================

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

// ---- vectors / quaternions ----
export function v3add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
export function v3sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
export function v3scale(a: Vec3, s: number): Vec3 { return [a[0]*s, a[1]*s, a[2]*s]; }
export function v3dot(a: Vec3, b: Vec3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
export function v3cross(a: Vec3, b: Vec3): Vec3 { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
export function v3len(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
export function v3norm(a: Vec3): Vec3 { const l = v3len(a); return l === 0 ? [0,0,0] : [a[0]/l, a[1]/l, a[2]/l]; }

// ---- bezier ----
export function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
  const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
  return [x, y];
}

export function bezierEasing(p1x: number, p1y: number, p2x: number, p2y: number, t: number): number {
  // approximate t lookup
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const x = cubicBezier([0,0], [p1x, p1y], [p2x, p2y], [1,1], mid)[0];
    if (x < t) lo = mid; else hi = mid;
  }
  return cubicBezier([0,0], [p1x, p1y], [p2x, p2y], [1,1], (lo + hi) / 2)[1];
}

// ---- motion blur (shutter samples) ----
export function motionBlurSamples(shutterAngleDeg: number, fps: number, samples: number, t: number): number[] {
  const shutterSeconds = (shutterAngleDeg / 360) / fps;
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    out.push(t - shutterSeconds * 0.5 + (shutterSeconds * i) / Math.max(1, samples - 1));
  }
  return out;
}

// ---- 3D camera projection ----
export function projectPerspective(p: Vec3, fovDeg: number, aspect: number, near: number = 0.1): Vec2 | null {
  if (p[2] >= -near) return null;
  const f = 1 / Math.tan((fovDeg * Math.PI / 180) / 2);
  return [(f / aspect) * p[0] / -p[2], f * p[1] / -p[2]];
}

// ---- IK: 2-bone analytic ----
export function solveIK2Bone(rootPos: Vec3, target: Vec3, lenA: number, lenB: number): { angleA: number; angleB: number; reachable: boolean } {
  const d = v3sub(target, rootPos);
  const dist = Math.min(v3len(d), lenA + lenB - 1e-6);
  const reachable = v3len(d) <= lenA + lenB;
  const cosB = (lenA*lenA + lenB*lenB - dist*dist) / (2 * lenA * lenB);
  const angleB = Math.acos(Math.max(-1, Math.min(1, cosB)));
  const cosA = (lenA*lenA + dist*dist - lenB*lenB) / (2 * lenA * dist);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  return { angleA, angleB, reachable };
}

// ---- skin weights normalize ----
export function normaliseSkinWeights(weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum === 0) return weights.map(() => 0);
  return weights.map((w) => Math.max(0, w) / sum);
}

// ---- PBR: schlick fresnel ----
export function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
  const k = Math.pow(1 - cosTheta, 5);
  return [f0[0] + (1 - f0[0]) * k, f0[1] + (1 - f0[1]) * k, f0[2] + (1 - f0[2]) * k];
}

// ---- particle step ----
export interface Particle { position: Vec3; velocity: Vec3; life: number }
export function stepParticle(p: Particle, gravity: Vec3, drag: number, dt: number): Particle {
  const newVel: Vec3 = [
    (p.velocity[0] + gravity[0] * dt) * (1 - drag * dt),
    (p.velocity[1] + gravity[1] * dt) * (1 - drag * dt),
    (p.velocity[2] + gravity[2] * dt) * (1 - drag * dt),
  ];
  const newPos: Vec3 = [p.position[0] + newVel[0] * dt, p.position[1] + newVel[1] * dt, p.position[2] + newVel[2] * dt];
  return { position: newPos, velocity: newVel, life: Math.max(0, p.life - dt) };
}

// ---- cloth: 1 verlet step ----
export function verletStep(prev: Vec3, curr: Vec3, accel: Vec3, dt: number): Vec3 {
  return [
    2 * curr[0] - prev[0] + accel[0] * dt * dt,
    2 * curr[1] - prev[1] + accel[1] * dt * dt,
    2 * curr[2] - prev[2] + accel[2] * dt * dt,
  ];
}

// ---- expression sandbox ----
export function evalExpression(expr: string, vars: Readonly<Record<string, number>>): number {
  if (!/^[-+*/().,\s\d_a-zA-Z]+$/.test(expr)) throw new Error('invalid expression');
  const names = Object.keys(vars);
  const values = names.map((n) => vars[n]);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(...names, `"use strict";return (${expr});`);
  const result = fn(...values);
  return typeof result === 'number' && Number.isFinite(result) ? result : 0;
}

// ---- NLA strip blend ----
export interface NlaStrip { startFrame: number; endFrame: number; influence: number; value: number }
export function evaluateNla(strips: readonly NlaStrip[], frame: number): number {
  let sum = 0; let weight = 0;
  for (const s of strips) {
    if (frame < s.startFrame || frame > s.endFrame) continue;
    sum += s.value * s.influence;
    weight += s.influence;
  }
  return weight === 0 ? 0 : sum / weight;
}

// ---- pre-comp graph topo sort ----
export interface CompNode { id: string; deps: readonly string[] }
export function topoSortComps(nodes: readonly CompNode[]): string[] {
  const out: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const map = new Map(nodes.map((n) => [n.id, n]));
  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`cycle at ${id}`);
    visiting.add(id);
    const n = map.get(id);
    if (n) for (const d of n.deps) visit(d);
    visiting.delete(id);
    visited.add(id);
    out.push(id);
  }
  for (const n of nodes) visit(n.id);
  return out;
}
