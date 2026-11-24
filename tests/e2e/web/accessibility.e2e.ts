// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Accessibility gate (axe-core, WCAG 2.x A/AA): the shell and every app are
// scanned with the app in front. Colour contrast is excluded here because
// theme-contrast.e2e.ts measures it on composited colours, which axe cannot.
//
// A ratchet: the count per rule may not grow past BASELINE (what existed when
// the gate landed). Fix violations, then lower the numbers.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Violating nodes per axe rule when the gate was added. Only ever lower these. */
const BASELINE: Record<string, number> = {
  'label-content-name-mismatch': 107,
  'nested-interactive': 95,
  'aria-required-children': 9,
  'select-name': 9,
  label: 7,
  'aria-required-parent': 2,
  'scrollable-region-focusable': 2,
  'aria-prohibited-attr': 1,
};

const RECORD = !!process.env.DEX_A11Y_RECORD;

function appIds(): string[] {
  const src = readFileSync(join(__dirname, '../../../src/renderer/store/runningApps.ts'), 'utf8');
  const a = src.search(/const APP_DEFINITIONS(_RAW)?\b[^=]*= \{/);
  const body = src.slice(a, src.indexOf('\n};', a));
  return [...body.matchAll(/^\s+['"]?([a-z0-9-]+)['"]?:\s*\{/gm)].map((m) => m[1]).filter((id) => id !== 'home');
}

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('dex-setup-done', 'skipped'); });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps && (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 120_000 });
}

async function scan(page: Page): Promise<Array<{ id: string; nodes: string[] }>> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['color-contrast'])
    .analyze();
  return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

test('accessibility: shell and apps do not add WCAG A/AA violations', async ({ page }) => {
  test.setTimeout(25 * 60_000);
  await boot(page);
  const counts: Record<string, number> = {};
  const where: Record<string, string[]> = {};
  const add = (scope: string, vs: Array<{ id: string; nodes: string[] }>) => {
    for (const v of vs) {
      counts[v.id] = (counts[v.id] ?? 0) + v.nodes.length;
      (where[v.id] ??= []).push(...v.nodes.slice(0, 3).map((n) => `${scope}: ${n}`));
    }
  };
  add('home', await scan(page));
  for (const id of appIds()) {
    await page.evaluate((appId) => {
      const s = window.__dexRunningApps!.getState();
      s.closeAllApps();
      s.launchApp({ id: appId, name: appId, icon: 'settings', color: '#888888' });
    }, id);
    await page.waitForFunction((appId) => {
      const el = document.querySelector(`[data-app-id="${appId}"], [data-floating-window="${appId}"]`);
      return !!el && !el.querySelector('[data-app-loading]') && (el.textContent ?? '').trim().length > 0;
    }, id, { timeout: 90_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    add(id, await scan(page));
  }
  if (RECORD) {
    console.log('A11Y_COUNTS ' + JSON.stringify(counts));
    for (const [rule, nodes] of Object.entries(where)) console.log(`A11Y_WHERE ${rule}: ${nodes.slice(0, 12).join(' | ')}`);
    return;
  }
  const grew = Object.entries(counts)
    .filter(([rule, n]) => n > (BASELINE[rule] ?? 0))
    .map(([rule, n]) => `${rule}: ${n} (baseline ${BASELINE[rule] ?? 0})\n  ${(where[rule] ?? []).slice(0, 8).join('\n  ')}`);
  expect(grew, grew.join('\n')).toEqual([]);
});
