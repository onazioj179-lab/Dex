// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { tierForAction, requiresConfirm, isForbidden } from '../../src/shared/uki/confirmTier';

describe('UKI confirm tiers (#018/#106)', () => {
  it('reads → auto, mutations → confirm', () => {
    expect(tierForAction({ op: 'detectTempoKey', mutates: false })).toBe('auto');
    expect(tierForAction({ op: 'removeBackground', mutates: true })).toBe('confirm');
  });

  it('applies policy overrides', () => {
    expect(tierForAction({ op: 'deleteAll', mutates: true }, { forbidden: ['deleteAll'] })).toBe('forbidden');
    expect(tierForAction({ op: 'autoMix', mutates: true }, { autoAllow: ['autoMix'] })).toBe('auto');
    expect(tierForAction({ op: 'preview', mutates: false }, { alwaysConfirm: ['preview'] })).toBe('confirm');
  });

  it('exposes convenience predicates', () => {
    expect(isForbidden({ op: 'deleteAll', mutates: true }, { forbidden: ['deleteAll'] })).toBe(true);
    expect(requiresConfirm({ op: 'x', mutates: true })).toBe(true);
    expect(requiresConfirm({ op: 'y', mutates: false })).toBe(false);
  });
});
