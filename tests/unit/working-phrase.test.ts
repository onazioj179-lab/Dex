// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { workingPhrase } from '../../src/renderer/hooks/useWorkingPhrase';

describe('useWorkingPhrase selector', () => {
  it('the first frame reads as the plain verb (matches the old static label)', () => {
    expect(workingPhrase('export', 0)).toBe('Exporting');
    expect(workingPhrase('encode', 0)).toBe('Encoding');
    expect(workingPhrase('extract', 0)).toBe('Extracting');
    expect(workingPhrase('encrypt', 0)).toBe('Encrypting');
    expect(workingPhrase('run', 0)).toBe('Running');
    expect(workingPhrase('simulate', 0)).toBe('Simulating');
    expect(workingPhrase('search', 0)).toBe('Searching');
    expect(workingPhrase('fetch', 0)).toBe('Fetching');
  });

  it('rotates within a pool as the tick advances', () => {
    expect(workingPhrase('export', 0)).not.toBe(workingPhrase('export', 1));
  });

  it('wraps cleanly for any tick, including negative', () => {
    expect(typeof workingPhrase('render', 999)).toBe('string');
    expect(workingPhrase('render', 999).length).toBeGreaterThan(0);
    expect(workingPhrase('render', -2).length).toBeGreaterThan(0);
  });

  it('falls back to the generic pool for an unknown kind', () => {
    // @ts-expect-error — intentionally passing an invalid kind
    expect(workingPhrase('nonsense', 0)).toBe('Working');
  });
});
