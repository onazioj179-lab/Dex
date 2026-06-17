// =============================================================================
// DEX Platform — Wave 4.3 Flux: particle system
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Particle system — pure CPU simulation. Designed to be fed in one tick
 * per frame; suitable for thousands of particles. The renderer can later
 * mirror this in a WebGPU compute shader for hundreds of thousands.
 *
 * Forces: gravity (constant), drag (per-particle), turbulence (curl noise
 * approximated by sin sums), attractors (point-pull with falloff).
 */

export interface Particle {
  /** Stable id — incremented monotonically per emitter. */
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Seconds remaining. */
  life: number;
  /** Initial life (for normalized progress). */
  maxLife: number;
  /** Particle size in world units. */
  size: number;
  /** RGBA 0..1. */
  r: number; g: number; b: number; a: number;
}

export interface Emitter {
  rate: number;            // particles per second
  burst?: number;          // initial burst on spawn
  origin: [number, number, number];
  spread: number;          // emission cone half-angle in radians
  speed: { min: number; max: number };
  life: { min: number; max: number };
  size: { min: number; max: number };
  color: { r: number; g: number; b: number; a: number };
  /** For deterministic seeding. */
  seed?: number;
}

export interface Forces {
  gravity?: [number, number, number];
  drag?: number;           // 0..1 per second
  attractors?: { x: number; y: number; z: number; strength: number; falloff: number }[];
  turbulence?: { amp: number; freq: number };
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private nextId = 1;
  private spawnAccum = 0;
  private rng: () => number;

  constructor(public emitter: Emitter, public forces: Forces = {}, private cap: number = 50_000) {
    const seed = emitter.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = lcg(seed);
    if (emitter.burst) {
      for (let i = 0; i < emitter.burst && this.particles.length < cap; i++) this.spawnOne();
    }
  }

  count(): number { return this.particles.length; }
  list(): readonly Particle[] { return this.particles; }

  /** Advance simulation by `dt` seconds. */
  tick(dt: number): void {
    // Spawn
    this.spawnAccum += dt * this.emitter.rate;
    while (this.spawnAccum >= 1 && this.particles.length < this.cap) {
      this.spawnAccum -= 1;
      this.spawnOne();
    }

    // Step
    const g = this.forces.gravity ?? [0, 0, 0];
    const drag = this.forces.drag ?? 0;
    const turb = this.forces.turbulence;
    const attractors = this.forces.attractors ?? [];

    let write = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;

      // Apply gravity
      p.vx += g[0] * dt;
      p.vy += g[1] * dt;
      p.vz += g[2] * dt;

      // Drag (exponential decay, but this dt-stable)
      if (drag > 0) {
        const k = Math.exp(-drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }

      // Attractors
      for (const a of attractors) {
        const dx = a.x - p.x, dy = a.y - p.y, dz = a.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        const f = a.strength / Math.pow(d2, a.falloff * 0.5 + 0.5);
        const inv = 1 / Math.sqrt(d2);
        p.vx += dx * inv * f * dt;
        p.vy += dy * inv * f * dt;
        p.vz += dz * inv * f * dt;
      }

      // Turbulence (sin-noise approximation)
      if (turb) {
        const f = turb.freq;
        const a = turb.amp;
        p.vx += Math.sin(p.y * f + p.z * 0.7) * a * dt;
        p.vy += Math.sin(p.z * f + p.x * 1.1) * a * dt;
        p.vz += Math.sin(p.x * f + p.y * 0.9) * a * dt;
      }

      // Integrate position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Fade alpha by life progress
      const t = 1 - (p.life / p.maxLife);
      p.a = clamp01(1 - t);

      // Compact in place
      if (write !== i) this.particles[write] = p;
      write++;
    }
    this.particles.length = write;
  }

  private spawnOne(): void {
    const r = this.rng;
    // Direction within spread cone (around +Y)
    const az = (r() * 2 - 1) * this.emitter.spread;
    const el = (r() * 2 - 1) * this.emitter.spread;
    const speed = lerp(this.emitter.speed.min, this.emitter.speed.max, r());
    const dx = Math.sin(az) * Math.cos(el);
    const dy = Math.cos(az) * Math.cos(el);
    const dz = Math.sin(el);
    const life = lerp(this.emitter.life.min, this.emitter.life.max, r());
    const size = lerp(this.emitter.size.min, this.emitter.size.max, r());
    const c = this.emitter.color;
    this.particles.push({
      id: this.nextId++,
      x: this.emitter.origin[0], y: this.emitter.origin[1], z: this.emitter.origin[2],
      vx: dx * speed, vy: dy * speed, vz: dz * speed,
      life, maxLife: life, size,
      r: c.r, g: c.g, b: c.b, a: c.a,
    });
  }
}

import { lerp } from '../math/num';
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lcg(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) / 0xffffffff);
  };
}
