// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Light-mode release gate: every app opens in light and dark and its visible
// text is measured against the colour actually behind it (translucent layers
// and opacity composited, WCAG 2.x: 4.5:1 normal text, 3:1 large text).
//
// Light mode must be clean. Dark mode is a ratchet: the owner kept the #0A84FF
// accent, which is 3.3-4.4:1 as text on accent tints, so accent-coloured text
// is exempt there; everything else must pass (the baseline reached 0).
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Dark-mode non-accent findings allowed. Was 3 when the gate landed; all fixed. */
const DARK_BASELINE = 0;
/** Decorative text WCAG exempts (creator watermark, separators). */
const DECORATIVE = new Set(['Onazi oJ', '|', '·', '/', '—']);

function appIds(): string[] {
  const src = readFileSync(join(__dirname, '../../../src/renderer/store/runningApps.ts'), 'utf8');
  const a = src.search(/const APP_DEFINITIONS(_RAW)?\b[^=]*= \{/);
  const body = src.slice(a, src.indexOf('\n};', a));
  return [...body.matchAll(/^\s+['"]?([a-z0-9-]+)['"]?:\s*\{/gm)].map((m) => m[1]).filter((id) => id !== 'home');
}

interface Finding { app: string; ratio: number; text: string; color: string; bg: string }

/** Runs in the page: low-contrast visible text under `root`. */
function audit(): Array<Omit<Finding, 'app'>> {
  type C = { r: number; g: number; b: number; a: number };
  const parse = (c: string): C | null => {
    const s = c.match(/color\(srgb ([^)]+)\)/);
    if (s) { const p = s[1].split(/[ /]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t: C, b: C): C => {
    const a = t.a + b.a * (1 - t.a); if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (x: number, y: number) => (x * t.a + y * b.a * (1 - t.a)) / a;
    return { r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a };
  };
  const dark = document.documentElement.dataset.theme === 'dark';
  const bgOf = (el: Element): C => {
    const stack: C[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let col: C = dark ? { r: 17, g: 18, b: 21, a: 1 } : { r: 245, g: 245, b: 247, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) col = over(stack[i], col);
    return col;
  };
  const out: Array<Omit<Finding, 'app'>> = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
    let text = '';
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent;
    text = text.trim(); if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
    let op = 1; for (let e: Element | null = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.05) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    if (el.closest('[disabled],[aria-disabled="true"],[aria-hidden="true"]')) continue;
    const bg = bgOf(el); const fg = over({ ...fg0, a: fg0.a * op }, bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need) out.push({ ratio: Math.round(ratio * 100) / 100, text: text.slice(0, 40), color: cs.color, bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})` });
  }
  return out;
}

async function bootIn(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => {
    localStorage.setItem('darkMode', String(t === 'dark'));
    localStorage.setItem('dex-theme-source', 'user');
    localStorage.setItem('dex-setup-done', 'skipped');
  }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps && (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function sweep(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
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
    await page.waitForTimeout(400);
    for (const f of await page.evaluate(audit)) if (!DECORATIVE.has(f.text)) findings.push({ app: id, ...f });
  }
  return findings;
}

const fmt = (f: Finding[]) => f.map((x) => `${x.app}: ${x.ratio}:1 "${x.text}" ${x.color} on ${x.bg}`).join('\n');

test.describe('Theme contrast gate', () => {
  test('light mode: every app has readable text', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    await bootIn(page, 'light');
    const findings = await sweep(page);
    expect(findings, fmt(findings)).toEqual([]);
  });

  test('dark mode: non-accent contrast failures do not grow', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    await bootIn(page, 'dark');
    const accent = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color; probe.remove(); return c;
    });
    const findings = (await sweep(page)).filter((f) => f.color !== accent);
    expect(findings.length, fmt(findings)).toBeLessThanOrEqual(DARK_BASELINE);
  });
});
