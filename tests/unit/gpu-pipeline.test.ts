// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { pickTier, chooseTileSize } from '../../src/shared/runtime/gpuPipeline';

describe('GPU tier', () => {
  it('picks webgpu when available and budget fits', () => {
    expect(pickTier({ webgpu: true, webgl2: true, vramMb: 8192 }, { estVramMb: 100 }, 1024).tier).toBe('webgpu');
  });
  it('falls back to webgl2 when webgpu blocklisted', () => {
    expect(pickTier({ webgpu: true, webgl2: true, vramMb: 8192, blocklisted: { webgpu: true } }, { estVramMb: 100 }, 1024).tier).toBe('webgl2');
  });
  it('falls back to cpu when compute required without webgpu', () => {
    expect(pickTier({ webgpu: false, webgl2: true, vramMb: 0 }, { estVramMb: 100, requireCompute: true }, 1024).tier).toBe('cpu');
  });
  it('tile size respects budget', () => {
    const t = chooseTileSize(4, 64);
    expect([64, 128, 256, 512, 1024, 2048, 4096]).toContain(t);
  });
});
