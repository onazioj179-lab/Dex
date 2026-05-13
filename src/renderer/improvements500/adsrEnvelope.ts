// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface AdsrParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export class AdsrEnvelope {
  private params: AdsrParams;
  private value = 0;
  private state: 'idle' | 'attack' | 'decay' | 'sustain' | 'release' = 'idle';
  private elapsed = 0;
  private releaseStart = 0;

  constructor(params: AdsrParams) {
    this.params = params;
  }

  trigger(): void {
    this.state = 'attack';
    this.elapsed = 0;
  }

  release(): void {
    if (this.state === 'idle') return;
    this.state = 'release';
    this.elapsed = 0;
    this.releaseStart = this.value;
  }

  process(dt: number): number {
    this.elapsed += dt;
    switch (this.state) {
      case 'attack':
        this.value = Math.min(1, this.elapsed / Math.max(this.params.attack, 1e-9));
        if (this.value >= 1) {
          this.value = 1;
          this.state = 'decay';
          this.elapsed = 0;
        }
        break;
      case 'decay': {
        const t = Math.min(1, this.elapsed / Math.max(this.params.decay, 1e-9));
        this.value = 1 - (1 - this.params.sustain) * t;
        if (t >= 1) {
          this.value = this.params.sustain;
          this.state = 'sustain';
        }
        break;
      }
      case 'sustain':
        this.value = this.params.sustain;
        break;
      case 'release': {
        const t = Math.min(1, this.elapsed / Math.max(this.params.release, 1e-9));
        this.value = this.releaseStart * (1 - t);
        if (t >= 1) {
          this.value = 0;
          this.state = 'idle';
        }
        break;
      }
    }
    return this.value;
  }

  isActive(): boolean {
    return this.state !== 'idle';
  }
}
