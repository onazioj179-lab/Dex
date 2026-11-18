// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Web smoke run: the real renderer in Chromium, served by Vite. No native
// bridge, so this checks what the UI does on its own: it boots, every app
// opens without tripping an error boundary, and apps do not restyle each
// other. Native behaviour is covered by the packaged-app checks.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CRASH = /stopped unexpectedly|DEX hit a problem|Something went wrong in this view/;

/** App ids, read from the store source so a new app is covered without editing this file. */
function appIds(): string[] {
  const src = readFileSync(join(__dirname, '../../../src/renderer/store/runningApps.ts'), 'utf8');
  // The literal app table (APP_DEFINITIONS wraps it to resolve window ids like 'notes~2').
  const a = src.search(/const APP_DEFINITIONS(_RAW)?\b[^=]*= \{/);
  expect(a).toBeGreaterThan(-1);
  const body = src.slice(a, src.indexOf('\n};', a));
  return [...body.matchAll(/^\s+['"]?([a-z0-9-]+)['"]?:\s*\{/gm)].map((m) => m[1]);
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Console errors count too, and the browser's warning for a form control
  // given a value it rejects (e.g. a theme token in <input type="color">).
  page.on('console', (m) => {
    if (m.type() === 'error' || /does not conform to the required format/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/');
  await page.waitForFunction(
    () => !!window.__dexRunningApps && (document.getElementById('root')?.childElementCount ?? 0) > 0,
    null, { timeout: 120_000 },
  );
  return errors;
}

async function open(page: Page, id: string): Promise<void> {
  await page.evaluate((appId) => {
    window.__dexRunningApps!.getState().launchApp({ id: appId, name: appId, icon: appId, color: '#888888' });
  }, id);
  // The lazy chunk shows a loading placeholder until the app has mounted.
  // Mounted = its container exists, the lazy-load placeholder is gone and it drew something.
  await page.waitForFunction((appId) => {
    // Inline apps sit in [data-app-id]; windowed ones in [data-floating-window].
    const el = document.querySelector(`[data-app-id="${appId}"], [data-floating-window="${appId}"]`);
    return !!el && !el.querySelector('[data-app-loading]') && (el.textContent ?? '').trim().length > 0;
  }, id, { timeout: 90_000 });
  await page.waitForTimeout(150);
}

test.describe('DEX shell (web renderer)', () => {
  test('boots to Home with no page error and no error boundary', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(await page.locator('body').innerText()).not.toMatch(CRASH);
    expect(errors).toEqual([]);
  });

  test('every app opens without an error boundary, a page error or a console error', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const ids = appIds().filter((id) => id !== 'home');
    expect(ids.length).toBeGreaterThan(40);
    const errors = await boot(page);
    const crashed: string[] = [];
    for (const id of ids) {
      const before = errors.length;
      await open(page, id);
      const text = await page.locator('body').innerText();
      if (CRASH.test(text)) crashed.push(`${id}: error boundary`);
      if (errors.length > before) crashed.push(`${id}: ${errors.slice(before).join(' | ').slice(0, 200)}`);
      await page.evaluate((appId) => {
        (window.__dexRunningApps!.getState() as unknown as { closeApp: (id: string) => void }).closeApp(appId);
      }, id);
    }
    expect(crashed).toEqual([]);
  });

  test('a retired app is refused, not opened', async ({ page }) => {
    await boot(page);
    const running = await page.evaluate(() => {
      const s = window.__dexRunningApps!.getState();
      s.launchApp({ id: 'rewind', name: 'Rewind', icon: 'rewind', color: '#888888' });
      return window.__dexRunningApps!.getState().runningApps.map((a) => a.id);
    });
    expect(running).not.toContain('rewind');
  });

  test('open apps do not restyle each other (no bare element rules in app styles)', async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await boot(page);
    const withOwnStyles = [
      'imosion', 'forge', 'prism', 'flux', 'axl', 'files', 'gallery', 'audio', 'tasks', 'transfers', 'workflows',
      'ledger', 'calculator', 'maps', 'pomodoro', 'projectdash', 'qrcode', 'inbox', 'notes', 'settings',
    ];
    for (const id of withOwnStyles) {
      await open(page, id);
    }
    // <style> elements inside #root are component blocks. The shell's own
    // global block (html, body, *) is marked and skipped.
    const leaks = await page.evaluate(() => {
      const out: string[] = [];
      const visit = (rules: CSSRuleList) => {
        for (const r of Array.from(rules)) {
          if (r instanceof CSSMediaRule) { if (!/print/.test(r.conditionText)) visit(r.cssRules); continue; }
          if (!(r instanceof CSSStyleRule)) continue;
          for (const part of r.selectorText.split(/,(?![^(]*\))/)) {
            const p = part.trim();
            if (!/[.#]|\[data-|\[class|\[aria-|\[role|:root|:host|:where\(\./.test(p)) out.push(p);
          }
        }
      };
      for (const el of Array.from(document.querySelectorAll('#root style:not([data-dex-shell-style])'))) {
        const sheet = (el as HTMLStyleElement).sheet;
        if (sheet) visit(sheet.cssRules);
      }
      return [...new Set(out)];
    });
    expect(leaks).toEqual([]);
  });
});
