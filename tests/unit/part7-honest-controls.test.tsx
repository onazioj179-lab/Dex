// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Part 7: controls that pretended to work were removed or wired.
// - Power shows only real data (Battery API, native plan, live processes).
// - The Browser's privacy toggles and Settings > Browser share one store.
// - The Browser's native-webview adapter: occlusion probes + script routing.
//
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import React from 'react';
import { modeFromNative, describeBattery, formatDuration, rankEnergy } from '../../src/renderer/pages/Power';
import { probePoints, isExpression } from '../../src/renderer/components/NativeWebview';
import { useDexSetting, writeDexSetting } from '../../src/renderer/hooks/useDexSetting';
import { ToastProvider } from '../../src/renderer/components/Toast';

describe('Power helpers', () => {
  it('maps native and legacy profile names onto three modes', () => {
    expect(modeFromNative('eco')).toBe('saver');
    expect(modeFromNative('powerSaver')).toBe('saver');
    expect(modeFromNative('boost')).toBe('performance');
    expect(modeFromNative('highPerformance')).toBe('performance');
    expect(modeFromNative('balanced')).toBe('balanced');
    expect(modeFromNative(null)).toBe('balanced');
  });

  it('formats durations and hides unknown ones', () => {
    expect(formatDuration(Infinity)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(90 * 60)).toBe('1 h 30 min');
    expect(formatDuration(25 * 60)).toBe('25 min');
  });

  it('describes battery state without inventing numbers', () => {
    expect(describeBattery({ level: 1, charging: true, chargingTime: 0, dischargingTime: Infinity })).toBe('Plugged in · fully charged');
    expect(describeBattery({ level: 0.5, charging: true, chargingTime: Infinity, dischargingTime: Infinity })).toBe('Charging');
    expect(describeBattery({ level: 0.5, charging: false, chargingTime: Infinity, dischargingTime: 3600 })).toBe('On battery · 1 h 0 min left');
    expect(describeBattery({ level: 0.5, charging: false, chargingTime: Infinity, dischargingTime: Infinity })).toBe('On battery');
  });

  it('ranks energy use from the native process array and ignores junk', () => {
    const rows = [
      { pid: 1, name: 'idle', cpu: 0, memory: 10 },
      { pid: 2, name: 'b', cpu: 5, memory: 100 },
      { pid: 3, name: 'a', cpu: 20, memory: 50 },
      { nope: true },
    ];
    expect(rankEnergy(rows).map(r => r.pid)).toEqual([3, 2]);
    // The old native shape ({ success, processes }) is not an array.
    expect(rankEnergy({ success: true, processes: rows })).toEqual([]);
    // Per-core CPU is shown as a share of the whole CPU.
    expect(rankEnergy([{ pid: 9, name: 'x', cpu: 200, memory: 1 }], 10, 8)[0].cpu).toBe(25);
  });

  it('renders only the three real sections', async () => {
    const { default: Power } = await import('../../src/renderer/pages/Power');
    render(<ToastProvider><Power /></ToastProvider>);
    expect(screen.getByRole('button', { name: /Battery/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Power Mode/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Energy Use/ })).toBeInTheDocument();
    for (const gone of ['Shield', 'Thermal', 'Startup', 'Controls', 'Memory']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${gone}$`) })).toBeNull();
    }
  });
});

describe('writeDexSetting (Browser <-> Settings share one store)', () => {
  beforeEach(() => localStorage.clear());

  it('writes one key without dropping the others and notifies readers', () => {
    localStorage.setItem('dex-settings', JSON.stringify({ blockAds: true, darkMode: false }));
    const { result } = renderHook(() => useDexSetting<boolean>('blockAds', true));
    expect(result.current).toBe(true);
    const seen = vi.fn();
    window.addEventListener('dex-settings-changed', seen);
    act(() => writeDexSetting('blockAds', false));
    window.removeEventListener('dex-settings-changed', seen);
    expect(result.current).toBe(false);
    expect(JSON.parse(localStorage.getItem('dex-settings')!)).toEqual({ blockAds: false, darkMode: false });
    // Tagged with a non-Settings source so an open Settings page reloads it.
    expect((seen.mock.calls[0][0] as CustomEvent).detail.source).toBe('blockAds');
  });

  it('recovers from a corrupt blob', () => {
    localStorage.setItem('dex-settings', '{broken');
    writeDexSetting('forceHttps', false);
    expect(JSON.parse(localStorage.getItem('dex-settings')!)).toEqual({ forceHttps: false });
  });
});

describe('NativeWebview helpers', () => {
  it('probes the centre and inset corners, clipped to the viewport', () => {
    const pts = probePoints({ x: 100, y: 100, w: 400, h: 300 }, 1920, 1080);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual([300, 250]);
    // A window half off the left edge keeps only on-screen probes.
    const partial = probePoints({ x: -300, y: 100, w: 400, h: 300 }, 1920, 1080);
    expect(partial.every(([x]) => x >= 0)).toBe(true);
    expect(partial.length).toBeLessThan(5);
  });

  it('returns values only for expressions; statement scripts run fire-and-forget', () => {
    expect(isExpression('(function(){ return 1 })()')).toBe(true);
    expect(isExpression('\n  (function() { return JSON.stringify({a:1}); })()\n')).toBe(true);
    expect(isExpression('var a = 1; a + 1')).toBe(false);
    expect(isExpression('if (x) { y() }')).toBe(false);
  });
});
