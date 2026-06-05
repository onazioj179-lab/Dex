// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampAutosaveInterval,
  getAutosaveIntervalOverride,
  setAutosaveIntervalOverride,
  resolveAutosaveInterval,
  MIN_AUTOSAVE_INTERVAL_MS,
  MAX_AUTOSAVE_INTERVAL_MS,
} from '../../src/renderer/utils/autosavePrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('autosave prefs', () => {
  it('defaults to no override (null)', () => {
    expect(getAutosaveIntervalOverride()).toBeNull();
  });

  it('clamps into the safe range', () => {
    expect(clampAutosaveInterval(0)).toBe(MIN_AUTOSAVE_INTERVAL_MS);
    expect(clampAutosaveInterval(999_999_999)).toBe(MAX_AUTOSAVE_INTERVAL_MS);
    expect(clampAutosaveInterval(45_000)).toBe(45_000);
    expect(clampAutosaveInterval(Number.NaN)).toBe(MIN_AUTOSAVE_INTERVAL_MS);
  });

  it('persists and clears the override', () => {
    setAutosaveIntervalOverride(60_000);
    expect(getAutosaveIntervalOverride()).toBe(60_000);
    setAutosaveIntervalOverride(null);
    expect(getAutosaveIntervalOverride()).toBeNull();
  });

  it('stores a clamped value', () => {
    setAutosaveIntervalOverride(1_000); // below min
    expect(getAutosaveIntervalOverride()).toBe(MIN_AUTOSAVE_INTERVAL_MS);
  });

  it('resolve prefers the override, falls back to the call-site default', () => {
    expect(resolveAutosaveInterval(30_000)).toBe(30_000); // no override
    setAutosaveIntervalOverride(120_000);
    expect(resolveAutosaveInterval(30_000)).toBe(120_000); // override wins
  });

  it('resolve clamps a stray fallback', () => {
    expect(resolveAutosaveInterval(0)).toBe(MIN_AUTOSAVE_INTERVAL_MS);
  });
});
