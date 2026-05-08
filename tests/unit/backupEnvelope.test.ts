// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  buildEnvelope,
  canonicalJson,
  defaultFilename,
  mergePayload,
  parseEnvelope,
} from '../../src/shared/backup/envelope';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf-8').digest('hex');

describe('backup envelope', () => {
  it('canonicalJson sorts object keys recursively', () => {
    const a = canonicalJson({ b: 2, a: 1, c: { y: 2, x: 1 } });
    const b = canonicalJson({ a: 1, c: { x: 1, y: 2 }, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":{"x":1,"y":2}}');
  });

  it('buildEnvelope -> parseEnvelope round-trip is ok', () => {
    const env = buildEnvelope({ notes: [{ id: 'n1', text: 'hi' }] }, '4.1.8', sha256, 1234);
    expect(env.kind).toBe('dex.backup.v1');
    expect(env.appVersion).toBe('4.1.8');
    expect(env.createdAt).toBe(1234);
    expect(env.integrity.startsWith('sha256:')).toBe(true);
    const parsed = parseEnvelope(env, sha256);
    expect(parsed.ok).toBe(true);
    expect(parsed.envelope?.data).toEqual({ notes: [{ id: 'n1', text: 'hi' }] });
  });

  it('parseEnvelope detects mutated payload', () => {
    const env = buildEnvelope({ notes: [{ id: 'n1', text: 'hi' }] }, '4.1.8', sha256);
    const tampered = { ...env, data: { notes: [{ id: 'n1', text: 'EVIL' }] } };
    const parsed = parseEnvelope(tampered, sha256);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toMatch(/integrity/i);
  });

  it('parseEnvelope rejects unknown kind, missing fields, and arrays', () => {
    expect(parseEnvelope(null, sha256).ok).toBe(false);
    expect(parseEnvelope([], sha256).ok).toBe(false);
    expect(parseEnvelope({ kind: 'something-else' }, sha256).ok).toBe(false);
    expect(parseEnvelope({ kind: 'dex.backup.v1' }, sha256).ok).toBe(false);
    expect(parseEnvelope({ kind: 'dex.backup.v1', createdAt: 1, appVersion: '1', data: [], integrity: 'sha256:0' }, sha256).ok).toBe(false);
  });

  it('mergePayload only touches opted-in sections and dedups arrays by id', () => {
    const current = {
      notes: [{ id: 'a', t: 1 }, { id: 'b', t: 2 }],
      secret: 'do-not-touch',
    };
    const incoming = {
      notes: [{ id: 'b', t: 99 }, { id: 'c', t: 3 }],
      secret: 'OVERWRITE-ATTEMPT',
    };
    const merged = mergePayload(current, incoming, ['notes']);
    expect(merged.secret).toBe('do-not-touch');
    // De-dup by id keeps the existing 'b' (arrives first), adds 'c'.
    expect(merged.notes).toEqual([{ id: 'a', t: 1 }, { id: 'b', t: 2 }, { id: 'c', t: 3 }]);
  });

  it('mergePayload replaces non-array sections wholesale', () => {
    const merged = mergePayload({ settings: { theme: 'dark' } }, { settings: { theme: 'light' } }, ['settings']);
    expect(merged.settings).toEqual({ theme: 'light' });
  });

  it('defaultFilename produces a stable safe pattern', () => {
    const name = defaultFilename(new Date(2026, 4, 8, 9, 5));
    expect(name).toBe('dex-backup-20260508-0905.json');
  });
});
