// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Many open apps: the top-bar tabs fold to icons, the first tab stays reachable
// (no centring that pushes it off-screen), and a count opens Stage Manager.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function appIds(): string[] {
  const src = readFileSync(join(__dirname, '../../../src/renderer/store/runningApps.ts'), 'utf8');
  const a = src.search(/const APP_DEFINITIONS(_RAW)?\b[^=]*= \{/);
  const body = src.slice(a, src.indexOf('\n};', a));
  return [...body.matchAll(/^\s+['"]?([a-z0-9-]+)['"]?:\s*\{/gm)].map((m) => m[1]).filter((id) => id !== 'home');
}

test('top bar stays navigable with every app open', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => { localStorage.setItem('dex-setup-done', 'skipped'); });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps, null, { timeout: 120_000 });
  const ids = appIds();
  await page.evaluate((list) => {
    const s = window.__dexRunningApps!.getState();
    for (const id of list) s.launchApp({ id, name: id, icon: id, color: '#888888' });
  }, ids);
  const bar = page.getByRole('tablist', { name: 'Open apps' });
  await expect(bar).toHaveAttribute('data-compact', 'true');
  const count = page.getByRole('button', { name: /^Show all \d+ open apps$/ });
  await expect(count).toBeVisible();

  // Scrolled to the start, the first tab sits inside the bar (not cut off).
  const firstVisible = await bar.evaluate((el) => {
    el.scrollLeft = 0;
    const first = el.querySelector('[role="presentation"]') as HTMLElement;
    const b = el.getBoundingClientRect(); const f = first.getBoundingClientRect();
    return f.left >= b.left - 1 && f.right <= b.right + 1;
  });
  expect(firstVisible).toBe(true);

  await count.click();
  await expect(page.getByRole('dialog', { name: 'Stage Manager' })).toBeVisible();
});
