// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Part 8: the integrity monitor's results are visible (System Health panel in
// Task Manager), it wakes on one shared timer, and installs left on a retired
// coloured theme preset return to DEX Blue Modern.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useIntegrityMonitor, INTEGRITY_CHECKS } from '../../src/renderer/services/IntegrityMonitor';
import { usePerformanceMonitor } from '../../src/renderer/services/PerformanceMonitor';
import SystemIntegrityPanel from '../../src/renderer/components/SystemIntegrityPanel';
import { initializeTheme, THEME_PRESETS } from '../../src/renderer/components/ThemeManager';

describe('IntegrityMonitor scheduling', () => {
  afterEach(() => {
    useIntegrityMonitor.getState().stopMonitoring();
    useIntegrityMonitor.getState().clearResults();
    vi.useRealTimers();
  });

  it('runs every check at start and uses a single timer', () => {
    vi.useFakeTimers();
    useIntegrityMonitor.getState().startMonitoring();
    const s = useIntegrityMonitor.getState();
    expect(s.checkIntervals.size).toBe(1);
    expect(s.lastResults.size).toBe(INTEGRITY_CHECKS.length);
  });

  it('keeps each check on its own cadence', () => {
    vi.useFakeTimers();
    useIntegrityMonitor.getState().startMonitoring();
    const ranAt = () => new Map(Array.from(useIntegrityMonitor.getState().lastResults).map(([k, r]) => [k, r.timestamp]));
    const t0 = ranAt();
    vi.advanceTimersByTime(30000);
    const t1 = ranAt();
    // 30 s checks re-ran; the 2-minute zombie check did not.
    expect(t1.get('service_health')).toBeGreaterThan(t0.get('service_health')!);
    expect(t1.get('zombie_process')).toBe(t0.get('zombie_process'));
    vi.advanceTimersByTime(90000);
    expect(ranAt().get('zombie_process')).toBeGreaterThan(t0.get('zombie_process')!);
  });

  it('stopMonitoring clears the timer', () => {
    vi.useFakeTimers();
    useIntegrityMonitor.getState().startMonitoring();
    useIntegrityMonitor.getState().stopMonitoring();
    expect(useIntegrityMonitor.getState().checkIntervals.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SystemIntegrityPanel', () => {
  beforeEach(() => {
    localStorage.setItem('dex-nexus-integrity-collapsed', '0');
    useIntegrityMonitor.getState().clearResults();
    usePerformanceMonitor.getState().clearAlerts();
  });

  it('lists every check and runs them on demand', () => {
    render(<SystemIntegrityPanel />);
    for (const c of INTEGRITY_CHECKS) expect(screen.getByText(c.name)).toBeTruthy();
    expect(screen.getAllByText('Pending').length).toBe(INTEGRITY_CHECKS.length);
    fireEvent.click(screen.getByRole('button', { name: 'Run checks' }));
    expect(screen.queryAllByText('Pending').length).toBe(0);
    expect(useIntegrityMonitor.getState().lastFullCheckAt).not.toBeNull();
  });

  it('shows performance alerts and dismisses them', () => {
    usePerformanceMonitor.setState({
      alerts: [{
        id: 'a1', type: 'memory', severity: 'warning', message: 'Memory above 80%',
        value: 85, threshold: 80, timestamp: Date.now(), acknowledged: false,
      }],
      unacknowledgedCount: 1,
    });
    render(<SystemIntegrityPanel />);
    expect(screen.getByText('Memory above 80%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert: Memory above 80%' }));
    expect(screen.queryByText('Memory above 80%')).toBeNull();
  });
});

describe('PerformanceMonitor alerts', () => {
  const realMemory = (performance as any).memory;
  beforeEach(() => usePerformanceMonitor.getState().clearAlerts());
  afterEach(() => {
    Object.defineProperty(performance, 'memory', { value: realMemory, configurable: true });
    usePerformanceMonitor.getState().clearAlerts();
  });

  it('measures heap against its limit, not the allocated heap', () => {
    // 34 MB used of 35 MB allocated used to read "System memory at 97%".
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 34 * 2 ** 20, totalJSHeapSize: 35 * 2 ** 20, jsHeapSizeLimit: 4096 * 2 ** 20 },
      configurable: true,
    });
    const s = usePerformanceMonitor.getState();
    s.collectMetrics();
    expect(usePerformanceMonitor.getState().currentMetrics!.memoryPercent).toBe(1);
    s.checkThresholds();
    expect(usePerformanceMonitor.getState().alerts.filter(a => a.type === 'memory')).toHaveLength(0);
  });

  it('raises no FPS alert when no frames were sampled (hidden window)', () => {
    const s = usePerformanceMonitor.getState();
    s.collectMetrics();
    const m = usePerformanceMonitor.getState().currentMetrics!;
    expect(m.fpsSampled).toBe(false);
    s.checkThresholds();
    expect(usePerformanceMonitor.getState().alerts.filter(a => a.type === 'fps')).toHaveLength(0);
  });

  it('keeps one open alert per condition instead of re-raising it every sample', () => {
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 95, totalJSHeapSize: 100, jsHeapSizeLimit: 100 },
      configurable: true,
    });
    const s = usePerformanceMonitor.getState();
    for (let i = 0; i < 5; i++) { s.collectMetrics(); s.checkThresholds(); }
    expect(usePerformanceMonitor.getState().alerts.filter(a => a.type === 'memory')).toHaveLength(1);
  });
});

describe('Theme presets', () => {
  beforeEach(() => localStorage.clear());

  it('ships only the DEX Blue Modern light and dark presets', () => {
    expect(THEME_PRESETS.map(p => p.id)).toEqual(['dark-default', 'light-default']);
    const dark = THEME_PRESETS[0];
    const light = THEME_PRESETS[1];
    expect(dark.textPrimary).toBe('#F5F5F7');
    expect(light.textPrimary).toBe('#1D1D1F');
    expect(light.border).toBe('#D1D1D6');
    expect(dark.border).toBe('#38383A');
  });

  it('moves an install off a retired coloured preset and drops the accent it set', () => {
    localStorage.setItem('dex-theme-preset', 'dark-green');
    localStorage.setItem('dex-accent-color', '#10b981');
    localStorage.setItem('dex-dark-mode', 'true');
    initializeTheme();
    expect(localStorage.getItem('dex-theme-preset')).toBe('dark-default');
    expect(localStorage.getItem('dex-accent-color')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--color-text-primary')).toBe('#F5F5F7');
  });

  it('keeps an accent the user chose after picking a retired preset', () => {
    localStorage.setItem('dex-theme-preset', 'light-warm');
    localStorage.setItem('dex-accent-color', '#0a84ff');
    localStorage.setItem('dex-dark-mode', 'false');
    initializeTheme();
    expect(localStorage.getItem('dex-theme-preset')).toBe('light-default');
    expect(localStorage.getItem('dex-accent-color')).toBe('#0a84ff');
  });
});
