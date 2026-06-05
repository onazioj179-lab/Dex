// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { redactSecrets, hasSecrets, luhnValid } from '../../src/shared/uki/redact';

describe('uki redact', () => {
  it('redacts emails', () => {
    const { text, counts } = redactSecrets('reach me at jane.doe@example.com please');
    expect(text).toContain('[redacted:email]');
    expect(text).not.toContain('jane.doe@example.com');
    expect(counts.email).toBe(1);
  });

  it('redacts api keys and bearer tokens', () => {
    const { text, counts } = redactSecrets('key sk-ABCDEFGHIJKLMNOPQRSTUV and Authorization: Bearer abcdef1234567890XYZ');
    expect(counts.apiKey).toBe(2);
    expect(text).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUV');
  });

  it('validates and redacts Luhn-valid card numbers only', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('1234 5678 9012 3456')).toBe(false);
    const { counts } = redactSecrets('card 4242 4242 4242 4242 but not 1234 5678 9012 3456');
    expect(counts.card).toBe(1);
  });

  it('leaves normal prose untouched', () => {
    const input = 'The meeting is at 3pm in room 200 about the 2026 budget.';
    const { text, counts } = redactSecrets(input);
    expect(text).toBe(input);
    expect(counts.email + counts.apiKey + counts.card).toBe(0);
  });

  it('hasSecrets reflects detection', () => {
    expect(hasSecrets('hello world')).toBe(false);
    expect(hasSecrets('a@b.com')).toBe(true);
  });
});
