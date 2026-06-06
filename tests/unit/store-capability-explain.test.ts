// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  explainCapability, explainCapabilities, isSensitiveCapability, undeclaredSensitive,
} from '../../src/shared/store/capabilityExplain';

describe('capability explain (#E6)', () => {
  it('explains known capabilities in plain English with sensitivity', () => {
    expect(explainCapability('capture')).toMatchObject({ title: 'Record your screen', sensitive: true });
    expect(explainCapability('audio.out')).toMatchObject({ sensitive: false });
    expect(explainCapability('files.read').detail).toMatch(/read/i);
  });

  it('falls back gracefully for unknown capabilities', () => {
    expect(explainCapability('weird.cap')).toMatchObject({ capability: 'weird.cap', sensitive: false });
  });

  it('explainCapabilities de-duplicates', () => {
    expect(explainCapabilities(['network', 'network', 'files.read']).length).toBe(2);
  });

  it('isSensitiveCapability flags the sensitive set', () => {
    expect(isSensitiveCapability('network')).toBe(true);
    expect(isSensitiveCapability('capture')).toBe(true);
    expect(isSensitiveCapability('notify')).toBe(false);
  });

  it('undeclaredSensitive returns sensitive caps used but not declared', () => {
    expect(undeclaredSensitive(['network', 'audio.out'], ['audio.out'])).toEqual(['network']);
    expect(undeclaredSensitive(['files.read'], ['files.read'])).toEqual([]);
    expect(undeclaredSensitive([], [])).toEqual([]);
  });
});
