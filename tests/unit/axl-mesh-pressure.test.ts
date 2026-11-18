// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { meshCacheLimit } from '../../src/renderer/DEXAPPLICATIONS/axl/engine/Renderer';

describe('AXL GPU mesh cache under memory pressure', () => {
  it('normal 48, high 16, critical keeps only what is drawn', () => {
    expect(meshCacheLimit('normal', 3)).toBe(48);
    expect(meshCacheLimit('high', 3)).toBe(16);
    expect(meshCacheLimit('critical', 3)).toBe(3);
  });
  it('never below the parts on screen (no per-frame re-upload)', () => {
    expect(meshCacheLimit('high', 40)).toBe(40);
    expect(meshCacheLimit('normal', 90)).toBe(90);
  });
});
