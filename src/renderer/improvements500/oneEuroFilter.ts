// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface OneEuroOptions {
  freq: number;
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
}

function alphaFor(cutoff: number, freq: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / freq;
  return 1 / (1 + tau / te);
}

class LowPass {
  private y = 0;
  private hasPrev = false;
  filter(x: number, alpha: number): number {
    if (!this.hasPrev) {
      this.y = x;
      this.hasPrev = true;
    } else {
      this.y = alpha * x + (1 - alpha) * this.y;
    }
    return this.y;
  }
  get value(): number {
    return this.y;
  }
  reset(): void {
    this.hasPrev = false;
    this.y = 0;
  }
}

export class OneEuroFilter {
  private xLp = new LowPass();
  private dLp = new LowPass();
  private prevX: number | null = null;
  private opts: Required<OneEuroOptions>;

  constructor(opts: OneEuroOptions) {
    this.opts = {
      freq: opts.freq,
      minCutoff: opts.minCutoff ?? 1.0,
      beta: opts.beta ?? 0.0,
      dCutoff: opts.dCutoff ?? 1.0,
    };
  }

  filter(x: number): number {
    const dx = this.prevX === null ? 0 : (x - this.prevX) * this.opts.freq;
    const edx = this.dLp.filter(dx, alphaFor(this.opts.dCutoff, this.opts.freq));
    const cutoff = this.opts.minCutoff + this.opts.beta * Math.abs(edx);
    const out = this.xLp.filter(x, alphaFor(cutoff, this.opts.freq));
    this.prevX = x;
    return out;
  }

  reset(): void {
    this.xLp.reset();
    this.dLp.reset();
    this.prevX = null;
  }
}
