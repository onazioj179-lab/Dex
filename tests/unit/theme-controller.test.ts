// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// One theme controller (utils/theme). Regressions covered:
//  - App.tsx re-resolved the theme on mount and forced dark after the OS-follow
//    had chosen light; an unused store forced dark at import.
//  - Settings' "Auto" only snapshotted the OS once and was never shown selected.
//  - ThemeManager wrote the palette inline on <html>, overriding the
//    stylesheet's light secondary text (#484C55 -> #636366, 3.0-4.4:1 on grey
//    fills) and both high-contrast palettes.
//
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyTheme, currentTheme, getThemePreference, initTheme, resolveThemePreference,
  setThemePreference, toggleTheme, THEME_CHANGED_EVENT,
} from '../../src/renderer/utils/theme';
import {
  applyTheme as applyPreset, initializeTheme, THEME_PRESETS,
} from '../../src/renderer/components/ThemeManager';

const root = () => document.documentElement;
let osDark = true;
const mqListeners: Array<(e: { matches: boolean }) => void> = [];

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('style');
  osDark = true;
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('dark') ? osDark : false,
    media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mqListeners.push(cb),
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  applyTheme('dark');
});

describe('theme preference', () => {
  it('defaults to dark with nothing stored', () => {
    expect(getThemePreference()).toBe('dark');
    osDark = false;
    expect(resolveThemePreference()).toBe('dark');
  });

  it('keeps a legacy darkMode value without a source as an explicit choice', () => {
    localStorage.setItem('darkMode', 'false');
    expect(getThemePreference()).toBe('light');
  });

  it('system follows the OS scheme', () => {
    osDark = false;
    setThemePreference('system', { animate: false });
    expect(getThemePreference()).toBe('system');
    expect(localStorage.getItem('darkMode')).toBeNull();
    expect(currentTheme()).toBe('light');
  });

  it('an explicit choice persists and wins over the OS', () => {
    osDark = true;
    setThemePreference('light', { animate: false });
    expect(localStorage.getItem('darkMode')).toBe('false');
    expect(localStorage.getItem('dex-theme-source')).toBe('user');
    expect(currentTheme()).toBe('light');
    toggleTheme();
    expect(currentTheme()).toBe('dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('announces changes once, and not for a no-op', () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail.theme);
    window.addEventListener(THEME_CHANGED_EVENT, on);
    applyTheme('light');
    applyTheme('light');
    applyTheme('dark');
    window.removeEventListener(THEME_CHANGED_EVENT, on);
    expect(seen).toEqual(['light', 'dark']);
  });
});

describe('initTheme live sync', () => {
  it('follows OS changes while on system and ignores them on an explicit choice', () => {
    localStorage.setItem('dex-theme-source', 'system');
    initTheme();
    expect(currentTheme()).toBe('dark');
    osDark = false;
    mqListeners.forEach((cb) => cb({ matches: false }));
    expect(currentTheme()).toBe('light');
    setThemePreference('dark', { animate: false });
    mqListeners.forEach((cb) => cb({ matches: false }));
    expect(currentTheme()).toBe('dark');
  });

  it('picks up a preference changed in another DEX window', () => {
    initTheme();
    localStorage.setItem('darkMode', 'false');
    localStorage.setItem('dex-theme-source', 'user');
    window.dispatchEvent(new StorageEvent('storage', { key: 'darkMode' }));
    expect(currentTheme()).toBe('light');
  });
});

describe('ThemeManager no longer owns the scheme or the palette', () => {
  it('applying a preset touches neither data-theme nor inline palette colours', () => {
    applyTheme('light');
    applyPreset(THEME_PRESETS[0]);
    expect(currentTheme()).toBe('light');
    expect(root().style.getPropertyValue('--color-text-secondary')).toBe('');
    expect(root().style.getPropertyValue('--color-text-primary')).toBe('');
  });

  it('initializeTheme clears a palette a previous build left inline and drops stale keys', () => {
    root().style.setProperty('--color-text-secondary', '#636366');
    localStorage.setItem('dex-theme-preset', 'dark-default');
    localStorage.setItem('dex-dark-mode', 'true');
    applyTheme('light');
    initializeTheme();
    expect(root().style.getPropertyValue('--color-text-secondary')).toBe('');
    expect(localStorage.getItem('dex-theme-preset')).toBeNull();
    expect(localStorage.getItem('dex-dark-mode')).toBeNull();
    expect(currentTheme()).toBe('light');
  });

  it('no renderer source writes palette colours inline on <html>', () => {
    const base = path.resolve(__dirname, '../../src/renderer');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (/documentElement\.style\.setProperty\(\s*['"]--color-(bg-primary|bg-secondary|bg-tertiary|text-primary|text-secondary)['"]/.test(src)
          || /root\.style\.setProperty\(\s*['"]--color-(bg-primary|bg-secondary|bg-tertiary|text-primary|text-secondary)['"]/.test(src)) {
          offenders.push(path.relative(base, p).split(path.sep).join('/'));
        }
      }
    };
    walk(base);
    expect(offenders).toEqual([]);
  });
});

describe('the pre-paint script mirrors the controller', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
  const script = html.match(/<script>\s*\/\/ Apply theme before first paint[\s\S]*?<\/script>/)![0]
    .replace(/^<script>/, '').replace(/<\/script>$/, '');

  const run = () => {
    root().removeAttribute('data-theme');
    root().classList.remove('dark-mode', 'light-mode');
    new Function(script)();
    return root().getAttribute('data-theme');
  };

  it.each([
    [{}, true, 'dark'],
    [{}, false, 'dark'],
    [{ darkMode: 'false', 'dex-theme-source': 'user' }, true, 'light'],
    [{ darkMode: 'false' }, true, 'light'],
    [{ 'dex-theme-source': 'system' }, false, 'light'],
    [{ 'dex-theme-source': 'system' }, true, 'dark'],
  ] as const)('%o with OS dark=%s -> %s', (stored, os, expected) => {
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    osDark = os;
    expect(run()).toBe(expected);
    expect(resolveThemePreference()).toBe(expected);
  });
});

describe('native window background sync', () => {
  it('tells the native shell the applied theme on every change', () => {
    const invoke = vi.fn(() => Promise.resolve({ success: true }));
    (window as unknown as { dex?: unknown }).dex = { invoke };
    applyTheme('light');
    applyTheme('light');
    applyTheme('dark');
    delete (window as unknown as { dex?: unknown }).dex;
    expect(invoke.mock.calls).toEqual([
      ['capability:storage:set', 'dex-window-theme', 'light'],
      ['capability:storage:set', 'dex-window-theme', 'dark'],
    ]);
  });
});
