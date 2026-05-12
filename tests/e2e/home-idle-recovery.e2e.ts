// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Home idle/minimize recovery regression test.
 * Ensures returning from idle-like transitions never leaves wallpaper-only view.
 */

import { test, expect } from '@playwright/test';
import { launchDEX, closeDEX, DEXTestContext, waitForDexShellReady } from './helpers';

let context: DEXTestContext;

test.describe('Home Idle Recovery', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(async () => {
    test.setTimeout(180000);
    context = await launchDEX();
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('keeps home shell visible after idle/resume transitions', async () => {
    test.setTimeout(180000);
    const page = context.mainWindow;

    await waitForDexShellReady(page, 45000);

    // Baseline: home and spotlight are visible before transition.
    await expect(page.locator('[role="region"][aria-label="Home"]').first()).toBeVisible();
    await expect(page.locator('[aria-label="Spotlight Search"]').first()).toBeVisible();

    // Simulate visible system idle. Home must stay rendered without a tap.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dex:idle-pause', { detail: { reason: 'system' } }));
    });

    await page.waitForTimeout(300);
    await expect(page.locator('[role="region"][aria-label="Home"]').first()).toBeVisible();
    await expect(page.locator('[aria-label="Spotlight Search"]').first()).toBeVisible();

    // Simulate blur/focus + resume events apps listen to.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new CustomEvent('dex:idle-resume', { detail: { reason: 'activity' } }));
      window.dispatchEvent(new Event('focus'));
    });

    await page.waitForTimeout(600);

    // Must still have a visible home region and spotlight search after resume.
    await expect(page.locator('[role="region"][aria-label="Home"]').first()).toBeVisible();
    await expect(page.locator('[aria-label="Spotlight Search"]').first()).toBeVisible();

    // Guard: ensure home app container exists and is not hidden.
    await page.waitForFunction(() => {
      const home = document.querySelector('[data-app-id="home"]') as HTMLElement | null;
      if (!home) return false;
      const style = window.getComputedStyle(home);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    }, { timeout: 10000 });

    // Dock node must still be mounted (may auto-hide visually, so use attached).
    await page.waitForSelector('[data-dock-container]', { state: 'attached', timeout: 10000 });
  });
});
