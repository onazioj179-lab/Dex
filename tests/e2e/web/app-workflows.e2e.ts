// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Workflow checks ported from the Electron-era specs: the flows that run in the
// web renderer without the native bridge. A fresh browser profile per test, so
// nothing here touches real DEX data.
import { test, expect, type Page } from '@playwright/test';

const CRASH = /stopped unexpectedly|DEX hit a problem|Something went wrong in this view/;

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  // Mounted = its container exists, the lazy-load placeholder is gone and it drew something.
  await page.waitForFunction((appId) => {
    // Inline apps sit in [data-app-id]; windowed ones in [data-floating-window].
    const el = document.querySelector(`[data-app-id="${appId}"], [data-floating-window="${appId}"]`);
    return !!el && !el.querySelector('[data-app-loading]') && (el.textContent ?? '').trim().length > 0;
  }, id, { timeout: 90_000 });
}

test.describe('App workflows (web renderer)', () => {

  for (const theme of ['light', 'dark'] as const) {
    test(`Settings, Notes and Inbox share flat controls in ${theme} mode`, async ({ page }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('darkMode', String(dark));
        localStorage.setItem('dex-theme-source', 'user');
      }, theme === 'dark');
      await boot(page);
      await open(page, 'settings');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const settings = page.locator('.settings-shell');
      const nav = settings.getByRole('button', { name: 'Navigate to General settings' });
      await expect(nav).toHaveCSS('box-shadow', 'none');
      const field = settings.getByRole('searchbox', { name: 'Search all settings' });
      await expect(field.locator('..')).toHaveCSS('border-radius', '9999px');
      const reopen = settings.locator('[data-setting-row="Reopen apps and windows"]');
      const label = await reopen.getByText('Reopen apps and windows', { exact: true }).boundingBox();
      const toggle = await reopen.getByRole('switch').boundingBox();
      expect(toggle!.x).toBeGreaterThan(label!.x + label!.width);
      await field.fill('contrast');
      await expect(settings.getByRole('listbox', { name: 'Settings search results' })).toBeVisible();
      await field.press('Escape');
      await expect(field).toHaveValue('');

      await open(page, 'notes');
      const notes = page.locator('.dexnotes-app');
      await notes.getByRole('button', { name: 'Create new note', exact: true }).first().click();
      const title = notes.getByRole('textbox', { name: 'Note title' });
      await title.fill('Project log');
      await expect(title).toHaveCSS('outline-style', 'none');
      const format = notes.getByRole('toolbar', { name: 'Formatting' });
      await expect(format).toHaveCSS('box-shadow', 'none');
      await expect(format).toHaveCSS('position', 'static');

      await open(page, 'inbox');
      const inbox = page.locator('.smart-inbox');
      await expect(inbox.getByRole('searchbox', { name: 'Search inbox' }).locator('..')).toHaveCSS('border-radius', '9999px');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('dex-notification', {
        detail: { title: 'Design review', body: 'Read the notes from this morning', source: 'Notes' },
      })));
      const row = inbox.getByRole('option', { name: /Design review/ });
      await expect(row).toBeVisible();
      const headline = await row.getByText('Design review').boundingBox();
      const body = await row.getByText('Read the notes from this morning').boundingBox();
      expect(body!.y).toBeGreaterThan(headline!.y);
    });
  }

  test('Calculator: 12 + 30 = 42 with the keypad, and with the keyboard', async ({ page }) => {
    await boot(page);
    await open(page, 'calculator');
    const display = page.locator('[aria-label^="Display "]').first();
    for (const k of ['1', '2', 'Add', '3', '0', 'Equals']) {
      await page.getByRole('button', { name: k, exact: true }).first().click();
    }
    await expect(display).toHaveText('42');
    await page.keyboard.press('Escape'); // clear all
    await expect(display).toHaveText('0');
    await page.keyboard.type('7*6');
    await page.keyboard.press('Enter');
    await expect(display).toHaveText('42');
  });

  test('Tasks: add a task with the input, then complete it', async ({ page }) => {
    await boot(page);
    await open(page, 'tasks');
    const title = `e2e task ${Date.now()}`;
    const input = page.getByLabel('Add a task', { exact: true });
    await input.fill(title);
    await input.press('Enter');
    const done = page.getByRole('button', { name: `Complete "${title}"` });
    await expect(done).toBeVisible();
    await done.click();
    await expect(page.getByRole('button', { name: `Mark "${title}" incomplete` })).toBeVisible();
    await page.getByRole('button', { name: 'Select Completed Today list' }).click();
    await expect(page.getByRole('button', { name: `Mark "${title}" incomplete` })).toBeVisible();
  });

  test('Tasks: start a focus session and see its title in Pomodoro', async ({ page }) => {
    await boot(page);
    await open(page, 'tasks');
    const input = page.getByLabel('Add a task', { exact: true });
    await input.fill('Draft project outline');
    await input.press('Enter');
    await page.getByText('Draft project outline', { exact: true }).click();
    await page.getByRole('button', { name: 'Start Pomodoro', exact: true }).click();
    await expect(page.getByText('Task · Draft project outline', { exact: true })).toBeVisible();
  });

  test('Calendar: next and previous month move the title and come back', async ({ page }) => {
    await boot(page);
    await open(page, 'calendar');
    const heading = page.getByRole('heading', { level: 1 }).filter({ hasText: /\b(19|20)\d{2}\b/ }).first();
    const start = (await heading.textContent())?.trim();
    expect(start).toBeTruthy();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(heading).not.toHaveText(start!);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(heading).toHaveText(start!);
  });

  test('app bars share one height: 57 px with a subtitle, 44 px without', async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await boot(page);
    const heights: Record<string, number[]> = {};
    for (const id of ['collabhub', 'extensions', 'kanban', 'tasks', 'workflows', 'store', 'inbox']) {
      await open(page, id);
      // The first app opened (CollabHub) can still be settling 300 ms after it
      // mounts on a cold CI runner; wait until its bar is laid out and on top.
      await page.waitForFunction((appId) =>
        [...document.querySelectorAll<HTMLElement>(`[data-app-id="${appId}"] [style*="app-header-height"]`)].some((e) => {
          const r = e.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.width > 300 && !!top && (e === top || e.contains(top));
        }), id, { timeout: 15_000 }).catch(() => { /* measured below; the assertion reports it */ });
      heights[id] = await page.evaluate((appId) =>
        [...document.querySelectorAll<HTMLElement>(`[data-app-id="${appId}"] [style*="app-header-height"]`)]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return r.width > 300 && !!top && (e === top || e.contains(top));
          })
          .map((e) => Math.round(e.getBoundingClientRect().height)), id);
    }
    expect(heights).toEqual({
      collabhub: [57], extensions: [57], kanban: [57], tasks: [57], workflows: [57], store: [57], inbox: [44],
    });
  });

  test('rapid app switching leaves no error boundary and no page error', async ({ page }) => {
    test.setTimeout(5 * 60_000);
    const errors = await boot(page);
    const ids = ['notes', 'calculator', 'tasks', 'files', 'settings', 'calendar', 'weather', 'kanban'];
    for (const id of ids) await open(page, id);
    // Switch between already-open apps as fast as the store accepts it.
    await page.evaluate((list) => {
      const s = window.__dexRunningApps!.getState() as unknown as { setCurrentApp: (id: string) => void };
      for (let round = 0; round < 5; round++) for (const id of list) s.setCurrentApp(id);
    }, ids);
    await page.waitForTimeout(1500);
    expect(await page.locator('body').innerText()).not.toMatch(CRASH);
    expect(errors).toEqual([]);
  });
});
