// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseDuration, parseDurationOr } from '../../src/shared/format/durationParse';

describe('duration parse', () => {
  it('parses compound durations', () => {
    expect(parseDuration('1h 30m')).toBe(5_400_000);
    expect(parseDuration('2d 3h')).toBe(2 * 86_400_000 + 3 * 3_600_000);
    expect(parseDuration('45s')).toBe(45_000);
    expect(parseDuration('500ms')).toBe(500);
  });

  it('parses ms vs m correctly', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('5m')).toBe(300_000);
  });

  it('treats a bare number as milliseconds', () => {
    expect(parseDuration('1000')).toBe(1000);
  });

  it('returns null for unparseable input', () => {
    expect(parseDuration('hello')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('round-trips with formatDuration-style values', () => {
    expect(parseDuration('3m 20s')).toBe(200_000);
  });

  it('parseDurationOr falls back', () => {
    expect(parseDurationOr('bad', 30_000)).toBe(30_000);
    expect(parseDurationOr('2m', 30_000)).toBe(120_000);
  });
});
