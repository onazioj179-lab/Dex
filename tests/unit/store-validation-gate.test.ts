// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { evaluateAppValidation, isApproved, type ValidationInput } from '../../src/shared/store/validationGate';

function input(over: Partial<ValidationInput> = {}): ValidationInput {
  return {
    manifestIssues: [], signatureOk: true, integrityOk: true, scanIssues: [],
    undeclaredSensitiveCaps: [], publisherKnown: true, sizeBytes: 1000, maxSizeBytes: 50 * 1024 * 1024,
    metadata: { name: 'X', description: 'd', hasCategory: true, hasContentRating: true, hasIcon: true },
    now: 1, ...over,
  };
}

describe('validation gate (#E2)', () => {
  it('approves a fully clean app', () => {
    const r = evaluateAppValidation(input());
    expect(r.status).toBe('approved');
    expect(isApproved(r)).toBe(true);
    expect(r.checks.every(c => c.passed)).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects on ANY block failure', () => {
    expect(evaluateAppValidation(input({ manifestIssues: ['bad id'] })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ signatureOk: false, signatureReason: 'untrusted-key' })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ integrityOk: false })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ scanIssues: [{ file: 'a.js', line: 2, reason: 'eval' }] })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ undeclaredSensitiveCaps: ['network'] })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ publisherKnown: false })).status).toBe('rejected');
    expect(evaluateAppValidation(input({ sizeBytes: 99, maxSizeBytes: 10 })).status).toBe('rejected');
  });

  it('is pending (not approved) when only warnings fail', () => {
    const r = evaluateAppValidation(input({
      metadata: { name: 'X', description: '', hasCategory: false, hasContentRating: false, hasIcon: false },
    }));
    expect(r.status).toBe('pending');
    expect(isApproved(r)).toBe(false);
  });

  it('surfaces a precise reason with detail for a failed check', () => {
    const r = evaluateAppValidation(input({ scanIssues: [{ file: 'a.js', line: 2, reason: 'eval() is forbidden' }] }));
    expect(r.reasons.join(' ')).toMatch(/forbidden code/i);
    expect(r.reasons.join(' ')).toMatch(/a\.js:2/);
  });

  it('block failures take priority over warnings in status', () => {
    const r = evaluateAppValidation(input({ signatureOk: false, metadata: { name: '', description: '', hasCategory: false, hasContentRating: false, hasIcon: false } }));
    expect(r.status).toBe('rejected');
  });
});
