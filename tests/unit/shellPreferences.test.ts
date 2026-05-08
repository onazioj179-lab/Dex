// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { mergePrefs } from '../../src/renderer/store/shellPreferencesStore';

describe('shellPreferences mergePrefs', () => {
  it('returns defaults for null/undefined input', () => {
    const a = mergePrefs(null);
    const b = mergePrefs(undefined);
    expect(a.dockEdge).toBe('bottom');
    expect(a.dockPreset).toBe('regular');
    expect(b.glassOpacity).toBeGreaterThan(0);
  });

  it('returns defaults for non-object input', () => {
    const a = mergePrefs('string');
    const b = mergePrefs(42);
    expect(a.dockEdge).toBe('bottom');
    expect(b.dockEdge).toBe('bottom');
  });

  it('accepts valid full prefs payload', () => {
    const result = mergePrefs({
      dockEdge: 'left',
      dockPreset: 'compact',
      glassOpacity: 0.7,
      glassTint: '#112233',
      nightShift: true,
      nightShiftIntensity: 0.6,
      lowEndMode: true,
      respectUpdateChoice: false,
      preventTabRefreshOnSleep: false,
      clipboardCloudSync: true,
    });
    expect(result.dockEdge).toBe('left');
    expect(result.dockPreset).toBe('compact');
    expect(result.glassOpacity).toBe(0.7);
    expect(result.glassTint).toBe('#112233');
    expect(result.nightShift).toBe(true);
    expect(result.nightShiftIntensity).toBe(0.6);
    expect(result.lowEndMode).toBe(true);
    expect(result.respectUpdateChoice).toBe(false);
    expect(result.preventTabRefreshOnSleep).toBe(false);
    expect(result.clipboardCloudSync).toBe(true);
  });

  it('rejects invalid hex tint and falls back to default', () => {
    const result = mergePrefs({ glassTint: 'not-a-color' });
    expect(result.glassTint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('rejects 3-digit hex (only 6 supported)', () => {
    const result = mergePrefs({ glassTint: '#abc' });
    expect(result.glassTint).not.toBe('#abc');
  });

  it('clamps glassOpacity to [0.4, 1] range', () => {
    expect(mergePrefs({ glassOpacity: 0 }).glassOpacity).toBe(0.4);
    expect(mergePrefs({ glassOpacity: 5 }).glassOpacity).toBe(1);
    expect(mergePrefs({ glassOpacity: -1 }).glassOpacity).toBe(0.4);
    expect(mergePrefs({ glassOpacity: 'string' }).glassOpacity).toBeGreaterThanOrEqual(0.4);
  });

  it('clamps nightShiftIntensity to [0, 1] range', () => {
    expect(mergePrefs({ nightShiftIntensity: -1 }).nightShiftIntensity).toBe(0);
    expect(mergePrefs({ nightShiftIntensity: 5 }).nightShiftIntensity).toBe(1);
  });

  it('falls back to bottom for invalid dockEdge', () => {
    expect(mergePrefs({ dockEdge: 'middle' }).dockEdge).toBe('bottom');
    expect(mergePrefs({ dockEdge: 99 }).dockEdge).toBe('bottom');
  });

  it('falls back to regular for invalid dockPreset', () => {
    expect(mergePrefs({ dockPreset: 'huge' }).dockPreset).toBe('regular');
  });

  it('accepts floating dockPreset', () => {
    expect(mergePrefs({ dockPreset: 'floating' }).dockPreset).toBe('floating');
  });

  it('treats non-true booleans as false (strict)', () => {
    expect(mergePrefs({ nightShift: 'yes' }).nightShift).toBe(false);
    expect(mergePrefs({ nightShift: 1 }).nightShift).toBe(false);
    expect(mergePrefs({ lowEndMode: 1 }).lowEndMode).toBe(false);
  });

  it('respectUpdateChoice defaults to true unless explicitly false', () => {
    expect(mergePrefs({}).respectUpdateChoice).toBe(true);
    expect(mergePrefs({ respectUpdateChoice: false }).respectUpdateChoice).toBe(false);
    // Anything other than literal `false` keeps default true (safe-by-default)
    expect(mergePrefs({ respectUpdateChoice: 'maybe' }).respectUpdateChoice).toBe(true);
  });
});
