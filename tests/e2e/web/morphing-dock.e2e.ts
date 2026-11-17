// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Morphing Dock + Desktop Work Area Manager, measured in a real layout:
// the morph keeps the trigger in place, nothing leaves the screen, apps and
// windows stay clear of the top bar and the Dock, on every edge, small
// displays, 150% scaling, many open apps and after a display resize.
import { test, expect, type Page, type BrowserContextOptions } from '@playwright/test';

type Box = { x: number; y: number; w: number; h: number };
const PREFS = 'dex-dock-prefs-v1';

async function boot(page: Page, prefs?: Record<string, unknown>): Promise<void> {
  // The shipped default is folded + auto-collapse (owner 2026-11-17); these
  // geometry tests start from an open Dock that stays open, marked as a
  // deliberate choice (acV2) so the one-time migration leaves it alone.
  const seeded = { expanded: true, autoCollapse: false, ...prefs, acV2: true };
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, [PREFS, JSON.stringify(seeded)] as const);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps && !!document.querySelector('.dex-mdock'), null, { timeout: 120_000 });
  await page.waitForTimeout(500);
  // Headless Chromium has no GPU and is rated the low tier, which turns every
  // transition off; pin a normal tier so the morph really animates.
  await page.evaluate(() => { document.documentElement.dataset.perfTier = 'high'; });
}

async function open(page: Page, id: string): Promise<void> {
  await page.evaluate((appId) => window.__dexRunningApps!.getState().launchApp({ id: appId, name: appId, icon: appId, color: '#888888' }), id);
  await page.waitForFunction((appId) => {
    const el = document.querySelector(`[data-app-id="${appId}"], [data-floating-window="${appId}"]`);
    return !!el && !el.querySelector('[data-app-loading]') && (el.textContent ?? '').trim().length > 0;
  }, id, { timeout: 90_000 });
  await page.waitForTimeout(400);
}

const box = (page: Page, sel: string) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}, sel) as Promise<Box | null>;

const topBar = (page: Page) => page.evaluate(() => Math.round(document.querySelector('[data-dex-content-surface]')!.getBoundingClientRect().top));
const vp = (page: Page) => page.evaluate(() => ({ w: innerWidth, h: innerHeight }));

async function settled(page: Page) { await page.waitForTimeout(450); }

function inside(b: Box, v: { w: number; h: number }) {
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.w).toBeLessThanOrEqual(v.w);
  expect(b.y + b.h).toBeLessThanOrEqual(v.h);
}

test.describe('Morphing Dock', () => {
  test('stays centred open and collapsed, collapse is faster, nothing leaves the screen', async ({ page }) => {
    await boot(page);
    const v = await vp(page);
    const dockOpen = (await box(page, '.dex-mdock'))!;
    const trigOpen = (await box(page, '[data-dock-item="__trigger"]'))!;
    inside(dockOpen, v);
    expect(dockOpen.y + dockOpen.h).toBe(v.h - 8);
    // Absolute centre of the bottom edge (owner, 2026-11-17).
    expect(Math.abs(dockOpen.x + dockOpen.w / 2 - v.w / 2)).toBeLessThanOrEqual(1);
    void trigOpen;

    await page.locator('[data-dock-item="__trigger"]').focus();
    await page.keyboard.press('Escape');
    await settled(page);
    expect(await page.locator('.dex-mdock').getAttribute('data-state')).toBe('collapsed');
    const dockClosed = (await box(page, '.dex-mdock'))!;
    const trigClosed = (await box(page, '[data-dock-item="__trigger"]'))!;
    expect(dockClosed.w).toBe(52);
    expect(dockClosed.h).toBe(52);
    // Collapsed, the search button is centred too.
    expect(Math.abs(dockClosed.x + dockClosed.w / 2 - v.w / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(trigClosed.y - trigOpen.y)).toBeLessThanOrEqual(1);

    await page.locator('[data-dock-item="__trigger"]').click();
    await settled(page);
    expect(await page.locator('.dex-mdock').getAttribute('data-state')).toBe('expanded');

    const durations = await page.evaluate(() => {
      const d = document.querySelector('.dex-mdock') as HTMLElement;
      return getComputedStyle(d).transitionDuration;
    });
    expect(durations.split(',')[0].trim()).toBe('0.26s');
    await page.keyboard.press('Escape');
    const closing = await page.evaluate(() => getComputedStyle(document.querySelector('.dex-mdock')!).transitionDuration);
    expect(closing.split(',')[0].trim()).toBe('0.19s');
    const easing = await page.evaluate(() => getComputedStyle(document.querySelector('.dex-mdock')!).transitionTimingFunction);
    expect(easing).toContain('cubic-bezier(0.2, 0.8, 0.2, 1)'); // ease-out, no overshoot
  });

  test('reduced motion: no geometry animation', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await boot(page);
    const d = await page.evaluate(() => getComputedStyle(document.querySelector('.dex-mdock')!).transitionDuration);
    // 0s, or the shell's global 0.01 ms reduced-motion rule: no visible movement.
    expect(d.split(',').map((x) => parseFloat(x)).every((x) => x <= 0.001)).toBe(true);
    await ctx.close();
  });

  // Owner spec (2026-11-17): the Dock is a floating overlay. A full-size app
  // starts below the top bar and fills to the bottom edge; the Dock floats
  // over it (no reserved strip, no black band).
  test('a full-size app starts below the top bar and fills to the bottom edge; the Dock floats over it', async ({ page }) => {
    await boot(page);
    await open(page, 'notes');
    const v = await vp(page);
    const app = (await box(page, '[data-app-id="notes"]'))!;
    const dock = (await box(page, '.dex-mdock'))!;
    expect(app.y).toBeGreaterThanOrEqual(await topBar(page));
    expect(Math.abs(app.y + app.h - v.h)).toBeLessThanOrEqual(1);
    const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.dex-mdock'), [dock.x + dock.w / 2, dock.y + dock.h / 2]);
    expect(onTop).toBe(true);
  });

  test('keyboard: Tab reaches the Dock once, arrows move, Escape collapses and keeps focus', async ({ page }) => {
    await boot(page);
    await page.locator('[data-dock-item="__trigger"]').focus();
    await page.keyboard.press('ArrowLeft');
    const focused = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.dockItem);
    expect(focused).not.toBe('__trigger');
    expect(await page.locator('.dex-mdock [tabindex="0"]').count()).toBe(1);
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    await settled(page);
    expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.dockItem)).toBe('__trigger');
    await page.keyboard.press('Enter');
    await settled(page);
    expect(await page.locator('.dex-mdock').getAttribute('data-state')).toBe('expanded');
  });

  test('pointer drag reorders pinned apps and the order persists', async ({ page }) => {
    await boot(page);
    const before = await page.$$eval('.dex-mdock [data-group="pinned"]', (els) => els.map((e) => (e as HTMLElement).dataset.dockItem));
    expect(before.length).toBeGreaterThanOrEqual(3);
    const a = (await box(page, `[data-dock-item="${before[0]}"]`))!;
    const c = (await box(page, `[data-dock-item="${before[2]}"]`))!;
    await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + a.w / 2 + ((c.x + c.w - a.x) * i) / 8, a.y + a.h / 2); await page.waitForTimeout(16); }
    await page.mouse.up();
    // Wait for the reorder to land (a fixed 200 ms sleep flaked under load).
    const order = () => page.$$eval('.dex-mdock [data-group="pinned"]', (els) => els.map((e) => (e as HTMLElement).dataset.dockItem));
    await expect.poll(async () => (await order())[0], { timeout: 4000 }).toBe(before[1]);
    const after = await order();
    expect(after.indexOf(before[0]!)).toBeGreaterThan(0);
    await page.reload();
    await page.waitForFunction(() => !!document.querySelector('.dex-mdock [data-group="pinned"]'));
    const reloaded = await page.$$eval('.dex-mdock [data-group="pinned"]', (els) => els.map((e) => (e as HTMLElement).dataset.dockItem));
    expect(reloaded).toEqual(after);
  });

  for (const edge of ['left', 'right'] as const) {
    test(`${edge} Dock: below the top bar, on screen, floating over full-width apps`, async ({ page }) => {
      await boot(page, { edge, expanded: true });
      await open(page, 'notes');
      const v = await vp(page);
      const dock = (await box(page, '.dex-mdock'))!;
      inside(dock, v);
      expect(dock.y).toBeGreaterThanOrEqual(await topBar(page));
      const app = (await box(page, '[data-app-id="notes"]'))!;
      expect(app.x).toBeLessThanOrEqual(1);
      expect(Math.abs(app.x + app.w - v.w)).toBeLessThanOrEqual(1);
    });
  }

  test('many open apps on a small display: the Dock never grows past the screen', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 520 } });
    const page = await ctx.newPage();
    await boot(page);
    for (const id of ['notes', 'tasks', 'calendar', 'weather', 'kanban', 'calculator', 'files', 'settings', 'gallery', 'audio', 'worldclock', 'timer']) await open(page, id);
    await settled(page);
    const v = await vp(page);
    const dock = (await box(page, '.dex-mdock'))!;
    inside(dock, v);
    expect(dock.w).toBeLessThanOrEqual(v.w - 16);
    // The trigger stays reachable.
    inside((await box(page, '[data-dock-item="__trigger"]'))!, v);
    await ctx.close();
  });

  test('150% display scaling: the Dock and the work area stay on whole pixels and on screen', async ({ browser }) => {
    const opts: BrowserContextOptions = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 };
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await boot(page);
    await open(page, 'notes');
    const v = await vp(page);
    inside((await box(page, '.dex-mdock'))!, v);
    const workH = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-dex-content-surface]')!).getPropertyValue('--dex-work-h')));
    expect(Number.isInteger(Math.round(workH * 1.5 * 1000) / 1000)).toBe(true);
    await ctx.close();
  });

  test('a display resize brings every window back into view', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await boot(page);
    await open(page, 'calculator');
    const sel = '[data-floating-window="calculator"]';
    const has = await page.locator(sel).count();
    test.skip(!has, 'Calculator opened as a tab in this build');
    // Move it near the bottom-right, then shrink the display.
    await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement; el.style.left = '1300px'; el.style.top = '700px'; }, sel);
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(600);
    const w = (await box(page, sel))!;
    const v = await vp(page);
    const dock = (await box(page, '.dex-mdock'))!;
    expect(w.y).toBeGreaterThanOrEqual(await topBar(page));
    expect(w.x).toBeLessThan(v.w);
    expect(w.y).toBeLessThan(dock.y); // title bar above the Dock
  });
});
