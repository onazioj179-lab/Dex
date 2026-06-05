// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../src/shared/plugins/manifest';

describe('Plugin manifest validation', () => {
  it('accepts a well-formed manifest', () => {
    const r = validateManifest({
      id: 'acme.notes-sync',
      name: 'Notes Sync',
      version: '1.2.0',
      permissions: ['files', 'network'],
      contributes: { commands: [{ id: 'sync', title: 'Sync Notes' }] },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects a non-object', () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest('nope').valid).toBe(false);
  });

  it('flags bad id / missing name / bad version', () => {
    const r = validateManifest({ id: 'Bad ID!', version: 'v1' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('id'))).toBe(true);
    expect(r.errors.some((e) => e.includes('name'))).toBe(true);
    expect(r.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('flags unknown permissions and malformed commands', () => {
    const r = validateManifest({
      id: 'x.y',
      name: 'X',
      version: '0.1.0',
      permissions: ['files', 'mind-control'],
      contributes: { commands: [{ id: 'ok', title: 'OK' }, { id: 42 }] },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('mind-control'))).toBe(true);
    expect(r.errors.some((e) => e.includes('commands[1]'))).toBe(true);
  });
});
