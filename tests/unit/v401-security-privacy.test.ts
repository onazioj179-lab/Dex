// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave I privacy + IPC validation tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  validateSchema,
  redactSecrets, redactObject,
  isGrantValid, pruneExpiredGrants,
  semverCompare, isValidSha256, isValidVersionString, evaluateUpdate,
} from '../../src/shared/security/privacy';

describe('schema validator', () => {
  it('validates string + pattern', () => {
    expect(validateSchema('hi', { type: 'string', pattern: /^[a-z]+$/ })).toEqual([]);
    expect(validateSchema('Hi', { type: 'string', pattern: /^[a-z]+$/ }).length).toBe(1);
  });
  it('integer rejects floats', () => {
    expect(validateSchema(1.5, { type: 'integer' }).length).toBe(1);
  });
  it('object enforces properties + additionalProperties', () => {
    const schema = { type: 'object' as const, properties: { a: { type: 'string' as const } }, additionalProperties: false };
    expect(validateSchema({ a: 'x' }, schema)).toEqual([]);
    expect(validateSchema({ a: 'x', b: 1 }, schema).length).toBe(1);
  });
  it('array items + min', () => {
    const schema = { type: 'array' as const, min: 1, items: { type: 'number' as const } };
    expect(validateSchema([], schema).length).toBe(1);
    expect(validateSchema([1, 2], schema)).toEqual([]);
  });
  it('optional skips undefined', () => {
    expect(validateSchema(undefined, { type: 'string', optional: true })).toEqual([]);
  });
});

describe('redaction', () => {
  it('redacts github token', () => {
    expect(redactSecrets('token=ghp_abcdefghijklmnopqrstuvwx').text).not.toContain('ghp_abcdef');
  });
  it('redacts emails', () => {
    expect(redactSecrets('contact me at user@example.com').text).not.toContain('user@example.com');
  });
  it('counts redactions', () => {
    const r = redactSecrets('a@b.com and c@d.com');
    expect(r.counts.email).toBe(2);
  });
  it('redactObject hides password keys', () => {
    const out = redactObject({ user: 'a', password: 'secret', nested: { token: 't' } });
    expect((out as { password: string }).password).toBe('[redacted]');
    expect(((out as { nested: { token: string } }).nested.token)).toBe('[redacted]');
  });
});

describe('permission grants', () => {
  it('valid when no expiry', () => {
    expect(isGrantValid({ appId: 'a', scope: 'fs', grantedAt: 0, expiresAt: null, oneShot: false }, 1000)).toBe(true);
  });
  it('expired beyond expiresAt', () => {
    expect(isGrantValid({ appId: 'a', scope: 'fs', grantedAt: 0, expiresAt: 100, oneShot: false }, 1000)).toBe(false);
  });
  it('prunes', () => {
    const r = pruneExpiredGrants([
      { appId: 'a', scope: 'fs', grantedAt: 0, expiresAt: 100, oneShot: false },
      { appId: 'b', scope: 'fs', grantedAt: 0, expiresAt: null, oneShot: false },
    ], 200);
    expect(r.expired.length).toBe(1);
    expect(r.active.length).toBe(1);
  });
});

describe('update verification', () => {
  it('semverCompare', () => {
    expect(semverCompare('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(semverCompare('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(semverCompare('1.0.0', '1.0.0')).toBe(0);
  });
  it('valid sha256', () => {
    expect(isValidSha256('a'.repeat(64))).toBe(true);
    expect(isValidSha256('a'.repeat(63))).toBe(false);
  });
  it('valid version', () => {
    expect(isValidVersionString('1.2.3')).toBe(true);
    expect(isValidVersionString('1.2.3-beta.1')).toBe(true);
    expect(isValidVersionString('1.2')).toBe(false);
  });
  it('evaluateUpdate ok', () => {
    const r = evaluateUpdate({ version: '1.2.4', sha256: 'a'.repeat(64), size: 100 }, '1.2.3');
    expect(r.ok).toBe(true);
  });
  it('evaluateUpdate rejects bad sig', () => {
    const r = evaluateUpdate({ version: '1.2.4', sha256: 'a'.repeat(64), size: 100, signedBy: 'evil' }, '1.2.3', 'good');
    expect(r.ok).toBe(false);
  });
});
