// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Particle emitter (T3-058) — pure simulation, no rendering.
 *
 * Tick `step(dtMs)` to advance; `particles()` returns the live snapshot.
 */

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;     // remaining ms
  maxLife: number;
  size: number;
  rotation: number;
  color: string;
}

export interface EmitterConfig {
  /** Particles per second. */
  rate: number;
  /** Initial position. */
  origin: { x: number; y: number };
  /** Velocity range in px/s. */
  speedMin: number; speedMax: number;
  /** Emission cone half-angle in radians (PI = full circle). */
  spread: number;
  /** Direction angle in radians (0 = right). */
  direction: number;
  /** Lifetime range in ms. */
  lifeMin: number; lifeMax: number;
  /** Size range in px. */
  sizeMin: number; sizeMax: number;
  /** Gravity in px/s^2 (positive y = down). */
  gravity: number;
  /** Drag coefficient. 0 = none, 1 = strong. */
  drag: number;
  color: string;
}

export class ParticleEmitter {
  private list: Particle[] = [];
  private accum = 0;
  constructor(private cfg: EmitterConfig) {}

  step(dtMs: number): void {
    const dt = dtMs / 1000;
    // Spawn.
    this.accum += this.cfg.rate * dt;
    while (this.accum >= 1) {
      this.list.push(this.spawn());
      this.accum -= 1;
    }
    // Integrate + cull.
    const damp = Math.exp(-this.cfg.drag * dt);
    for (const p of this.list) {
      p.vy += this.cfg.gravity * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dtMs;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  private spawn(): Particle {
    const speed = lerp(this.cfg.speedMin, this.cfg.speedMax, Math.random());
    const ang = this.cfg.direction + (Math.random() * 2 - 1) * this.cfg.spread;
    const life = lerp(this.cfg.lifeMin, this.cfg.lifeMax, Math.random());
    const size = lerp(this.cfg.sizeMin, this.cfg.sizeMax, Math.random());
    return {
      x: this.cfg.origin.x, y: this.cfg.origin.y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      life, maxLife: life,
      size, rotation: Math.random() * Math.PI * 2, color: this.cfg.color,
    };
  }

  particles(): readonly Particle[] { return this.list; }
  count(): number { return this.list.length; }
  clear(): void { this.list.length = 0; }
  configure(patch: Partial<EmitterConfig>): void { this.cfg = { ...this.cfg, ...patch }; }
}

import { lerp } from '../../shared/math/num';
