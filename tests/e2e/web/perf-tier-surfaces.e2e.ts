// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Surfaces must look the same on every performance tier: a tier may drop an
// expensive effect, never add one. On mid-tier machines a forced shadow once
// turned every App Menu tile and Settings row into a heavy floating card.
import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    localStorage.setItem('dex-setup-done', 'skipped');
    localStorage.setItem('darkMode', String(t === 'dark'));
    localStorage.setItem('dex-theme-source', 'user');
  }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps && (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 120_000 });
}

async function shadows(page: Page, tier: string) {
  return page.evaluate(async (t) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    document.documentElement.setAttribute('data-perf-tier', t);
    const s = window.__dexRunningApps!.getState();
    s.closeAllApps();
    s.launchApp({ id: 'settings', name: 'Settings', icon: 'settings', color: '#888888' });
    // Settings is lazy-loaded: wait for its rows rather than a fixed delay.
    for (let i = 0; i < 150 && !document.querySelector('.settings-nav'); i++) await wait(100);
    await wait(200);
    const rows = [...document.querySelectorAll<HTMLElement>('.settings-nav')].slice(0, 6);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true }));
    await wait(800);
    const panel = document.querySelector('[data-dex-app-menu-panel]');
    const tiles = panel ? [...panel.querySelectorAll<HTMLElement>('button')].filter((b) => b.querySelector('span')).slice(0, 8) : [];
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const shadowOf = (el: HTMLElement) => getComputedStyle(el).boxShadow;
    return { rows: rows.map(shadowOf), tiles: tiles.map(shadowOf), found: { rows: rows.length, tiles: tiles.length } };
  }, tier);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: App Menu tiles and Settings rows stay flat on every tier`, async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await boot(page, theme);
    for (const tier of ['low', 'mid', 'high']) {
      const r = await shadows(page, tier);
      expect(r.found.rows, `${tier}: settings rows found`).toBeGreaterThan(0);
      expect(r.found.tiles, `${tier}: app menu tiles found`).toBeGreaterThan(0);
      expect(new Set(r.rows), `${tier}: settings rows`).toEqual(new Set(['none']));
      expect(new Set(r.tiles), `${tier}: app menu tiles`).toEqual(new Set(['none']));
    }
  });
}
