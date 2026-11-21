// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test as base, expect, type Browser, type Page } from '@playwright/test';

type DexSession = { page: Page; reopen(): Promise<Page> };

// DEX_SPATIAL_EXE allows the same checks in packaged WebView2. Each run gets
// its own DEX and WebView2 profiles, including a separate single-instance lock.
const test = base.extend<{ dexSession: DexSession; dexPage: Page }>({
  dexPage: async ({ dexSession }, use) => use(dexSession.page),
  dexSession: async ({ page, playwright }, use, testInfo) => {
    const exe = process.env.DEX_SPATIAL_EXE;
    if (!exe) {
      await page.goto('/');
      await use({ page, reopen: async () => { await page.reload(); return page; } });
      return;
    }

    const profile = mkdtempSync(join(tmpdir(), 'dex-spatial-'));
    let port = 9400 + Math.floor(Math.random() * 399);
    let child: ChildProcess | undefined;
    let browser: Browser | undefined;
    let app: Page | undefined;
    const start = async () => {
      const debugPort = port++;
      const endpoint = `http://127.0.0.1:${debugPort}`;
      child = spawn(exe, [], {
        env: {
          ...process.env,
          DEX_DATA_DIR: join(profile, 'data'),
          WEBVIEW2_USER_DATA_FOLDER: join(profile, 'webview'),
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
        },
        stdio: 'ignore',
      });
      await expect.poll(async () => {
        try { return (await fetch(`${endpoint}/json/list`)).ok; }
        catch { return false; }
      }, { timeout: 30_000 }).toBe(true);
      browser = await playwright.chromium.connectOverCDP(endpoint);
      const [desktop] = browser.contexts();
      // WebView2 can publish the shell target before its first navigation.
      app = desktop.pages()[0] ?? await desktop.waitForEvent('page', { timeout: 15_000 });
      return app;
    };
    const requestClose = async () => {
      if (app && !app.isClosed()) {
        // Closing WebView2 can tear down CDP before the IPC response arrives.
        await Promise.race([
          app.evaluate(() => window.dex?.invoke('window:close')).catch(() => undefined),
          delay(1500),
        ]);
      }
    };

    try {
      const firstPage = await start();
      const setup = firstPage.getByRole('dialog', { name: 'Set up DEX' });
      await setup.getByRole('button', { name: 'Get started' }).click({ timeout: 30_000 });
      await setup.getByRole('button', { name: 'Agree', exact: true }).click();
      await setup.getByRole('button', { name: 'Skip setup' }).click();
      await expect(setup).toBeHidden();
      const environment = await firstPage.evaluate(async () => ({
        build: await window.dex?.invoke('corepc:getBuild'),
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        renderer: navigator.userAgent,
      }));
      await testInfo.attach('WebView2 environment', {
        body: JSON.stringify(environment),
        contentType: 'application/json',
      });
      await use({
        page: firstPage,
        reopen: async () => {
          await requestClose();
          await expect.poll(() => child?.exitCode, { timeout: 10_000 }).toBe(0);
          await browser?.close();
          return start();
        },
      });
    } finally {
      await requestClose();
      await browser?.close();
      if (child?.pid && child.exitCode === null) {
        try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
        catch { /* the test process already closed */ }
      }
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
      } catch (error) {
        // Crashpad can hold files after DEX exits. Preserve test assertions and
        // report the isolated directory so it can be removed later.
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw error;
        console.warn(`WebView2 still holds files in test profile ${profile}`);
      }
    }
  },
});

const world = '[data-spatial-world]';
const instance = (id: string) => `[data-testid="app-instance-${id}"]`;
const floating = (id: string) => `[data-floating-window="${id}"]`;

async function openApp(page: Page, id: string) {
  await page.waitForFunction(() => !!window.__dexRunningApps && !!document.querySelector('[aria-label="Dock"]'));
  await page.evaluate((appId) => {
    window.__dexRunningApps!.getState().launchApp({ id: appId, name: appId, icon: appId, color: '#888888' });
  }, id);
  const app = page.locator(instance(id));
  await expect(app).toBeAttached();
  await expect(app.locator('[data-app-loading]')).toHaveCount(0, { timeout: 30_000 });
}

async function spatial(page: Page, enabled: boolean) {
  await page.evaluate((on) => {
    window.dispatchEvent(new CustomEvent('dex-spatial-toggle', { detail: { enabled: on } }));
  }, enabled);
  await expect(page.locator(world)).toHaveAttribute('data-spatial-world', enabled ? 'on' : 'off');
}

async function groupNotesAndBrowser(page: Page) {
  await page.keyboard.press('Control+Alt+w');
  const panel = page.getByRole('dialog', { name: 'Spatial desktop panel' });
  await panel.getByRole('checkbox', { name: 'Select Browser' }).check();
  await panel.getByRole('checkbox', { name: 'Select Notes' }).check();
  await panel.getByRole('textbox', { name: 'New group name' }).fill('Research');
  await panel.getByRole('button', { name: 'Group', exact: true }).click();
  return panel;
}

test('keeps the live Notes editor and keyboard focus across spatial transitions', async ({ dexPage: page }) => {
  await openApp(page, 'notes');
  const notes = page.locator(instance('notes'));
  await expect(notes).toHaveAttribute('data-app-id', 'notes');
  await notes.getByRole('button', { name: /^(create )?new note$/i }).first().click({ timeout: 10_000 });
  const editor = notes.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type('Spatial draft');
  await editor.evaluate((el) => el.setAttribute('data-test-editor-instance', 'original'));

  for (let round = 0; round < 3; round++) {
    await spatial(page, true);
    await expect(page.locator(floating('notes'))).toBeAttached();
    await expect(editor).toHaveAttribute('data-test-editor-instance', 'original');
    await expect(editor).toBeFocused();
    await page.keyboard.type(' live');
    await spatial(page, false);
    await expect(notes).toHaveAttribute('data-app-id', 'notes');
    await expect(editor).toHaveAttribute('data-test-editor-instance', 'original');
    await expect(editor).toBeFocused();
  }
  await expect(editor).toHaveText('Spatial draft live live live');
});

test('keeps minimized apps hidden until restored across both spatial transitions', async ({ dexPage: page }) => {
  await openApp(page, 'notes');
  await openApp(page, 'browser');
  const running = () => page.evaluate(() => {
    const { runningApps, currentAppId } = window.__dexRunningApps!.getState();
    return {
      currentAppId,
      notesMinimized: runningApps.find((app) => app.id === 'notes')?.isMinimized,
      browserMinimized: runningApps.find((app) => app.id === 'browser')?.isMinimized,
    };
  });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dex-app-command', { detail: { appId: 'notes', command: 'minimize' } }));
  });
  await expect.poll(running).toMatchObject({ currentAppId: 'browser', notesMinimized: true });

  await spatial(page, true);
  const notes = page.locator(floating('notes'));
  const browser = page.locator(floating('browser'));
  await expect(notes).toBeAttached();
  await expect(notes).toBeHidden();
  await expect(browser).toBeVisible();

  await page.keyboard.press('Control+Alt+w');
  await page.getByRole('button', { name: 'Go to Notes (minimized)', exact: true }).click();
  await expect(notes).toBeVisible();
  await page.keyboard.press('Control+Alt+w');
  await page.getByRole('button', { name: 'Go to Browser', exact: true }).click();
  await browser.getByRole('button', { name: 'Minimize Browser', exact: true }).click();
  await expect(browser).toBeHidden();
  await spatial(page, false);
  await expect.poll(running).toEqual({ currentAppId: 'notes', notesMinimized: false, browserMinimized: true });

  await spatial(page, true);
  await notes.getByRole('button', { name: 'Minimize Notes', exact: true }).click();
  await expect(notes).toBeHidden();
  await spatial(page, false);
  await expect.poll(running).toEqual({ currentAppId: 'home', notesMinimized: true, browserMinimized: true });
});

test('collapses, expands and keeps a group across workspace mode changes', async ({ dexPage: page }) => {
  await openApp(page, 'notes');
  await openApp(page, 'browser');
  await spatial(page, true);
  const panel = await groupNotesAndBrowser(page);
  const notes = page.locator(floating('notes'));
  const browser = page.locator(floating('browser'));
  await panel.getByRole('button', { name: 'Collapse Research', exact: true }).click();
  await expect(notes).toBeHidden();
  await expect(browser).toBeHidden();
  await panel.getByRole('button', { name: 'Expand Research', exact: true }).click();
  await expect(notes).toBeVisible();
  await expect(browser).toBeVisible();

  await spatial(page, false);
  await spatial(page, true);
  await page.keyboard.press('Control+Alt+w');
  await expect(panel.getByRole('button', { name: 'Go to group Research, 2 windows' })).toBeVisible();
});

test('expanding a group preserves separately minimized windows', async ({ dexPage: page }) => {
  await openApp(page, 'notes');
  await openApp(page, 'browser');
  await spatial(page, true);
  const notes = page.locator(floating('notes'));
  const browser = page.locator(floating('browser'));
  await page.keyboard.press('Control+Alt+w');
  await page.getByRole('button', { name: 'Go to Browser', exact: true }).click();
  await browser.getByRole('button', { name: 'Minimize Browser', exact: true }).click();
  await expect(browser).toBeHidden();

  const panel = await groupNotesAndBrowser(page);
  const collapse = panel.getByRole('button', { name: 'Collapse Research' });
  await collapse.click();
  await expect(notes).toBeHidden();
  await panel.getByRole('button', { name: 'Expand Research' }).click();
  await expect(notes).toBeVisible();
  await expect(browser).toBeHidden();

  await collapse.click();
  await spatial(page, false);
  await expect(page.locator(instance('notes'))).toBeVisible();
  await spatial(page, true);
  await expect(notes).toBeHidden();
  await page.keyboard.press('Control+Alt+w');
  await panel.getByRole('button', { name: /^Go to Notes .*in group Research/ }).click();
  await expect(notes).toBeVisible();
  await expect(browser).toBeHidden();
});

test('reopens the spatial workspace when session restore is enabled', async ({ dexSession }) => {
  const { page } = dexSession;
  test.slow();
  await openApp(page, 'notes');
  await openApp(page, 'browser');
  await page.evaluate(async () => {
    const settings = JSON.parse(localStorage.getItem('dex-settings') || '{}');
    settings['session.reopenApps'] = true;
    localStorage.setItem('dex-settings', JSON.stringify(settings));
    await window.dex?.invoke('capability:storage:set', 'dex-settings', settings);
  });
  await spatial(page, true);
  const panel = await groupNotesAndBrowser(page);
  await panel.getByRole('button', { name: 'Collapse Research' }).click();

  const reopened = await dexSession.reopen();
  await reopened.waitForFunction(() => {
    const apps = window.__dexRunningApps?.getState().runningApps;
    return apps?.some(app => app.id === 'browser') && apps.some(app => app.id === 'notes');
  }, undefined, { timeout: 30_000 });
  await expect(reopened.locator(world)).toHaveAttribute('data-spatial-world', 'on');
  for (const id of ['notes', 'browser']) {
    const win = reopened.locator(floating(id));
    await expect(win).toBeAttached();
    await expect(win).toBeHidden();
  }
  await reopened.keyboard.press('Control+Alt+w');
  await reopened.getByRole('button', { name: 'Expand Research' }).click();
  for (const id of ['notes', 'browser']) {
    const win = reopened.locator(floating(id));
    await expect(win).toBeVisible();
    await expect(win.locator('[data-app-loading]')).toHaveCount(0);
  }
});

test('paints every fitted app surface even when the windows are small', async ({ dexPage: page }) => {
  const apps = ['notes', 'browser', 'terminal', 'dexcode', 'files', 'gallery',
    'canvas', 'taskmanager', 'nexus', 'bio', 'videoeditor', 'axl'];
  for (const id of apps) await openApp(page, id);
  await spatial(page, true);
  await expect(page.locator(`${world} [data-floating-window]`)).toHaveCount(apps.length);
  await page.keyboard.press('Control+Alt+w');
  const panel = page.getByRole('dialog', { name: 'Spatial desktop panel' });
  await panel.getByRole('tab', { name: 'Layout' }).click();
  await panel.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  // Validate actual paint/hit-testing. Running apps retain their textContent
  // even when CSS skips their entire body and displays only the title.
  for (const id of apps) {
    await test.step(id, async () => {
      const body = page.locator(`${floating(id)} [data-window-body]`);
      await expect(body).not.toBeEmpty();
      await expect(body.locator('[data-app-loading]')).toHaveCount(0);
      await expect.poll(() => body.evaluate((el) => getComputedStyle(el).contentVisibility)).toBe('visible');
      await expect.poll(() => body.evaluate((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return [0.25, 0.5, 0.75].some((p) => {
          const hit = document.elementFromPoint(x + width * p, y + height * p);
          return !!hit && hit !== el && el.contains(hit);
        });
      })).toBe(true);
    });
  }
});

test('moves, resizes, pans and refocuses live windows of the same app', async ({ dexPage: page }) => {
  await openApp(page, 'notes');
  const otherId = await page.evaluate(() => window.__dexRunningApps!.getState().openNewWindow('notes'));
  expect(otherId).toBe('notes~2');
  await spatial(page, true);
  const first = page.locator(floating('notes'));
  const second = page.locator(floating(otherId!));
  await expect(second).toBeVisible();

  const header = first.locator('[data-window-header]');
  await header.click({ trial: true });
  const start = (await header.boundingBox())!;
  await page.mouse.move(start.x + start.width * 0.25, start.y + start.height / 2);
  await page.mouse.down();
  await expect(first).toHaveAttribute('data-dragging', 'true');
  await page.mouse.move(start.x + start.width * 0.25 + 32, start.y + start.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await header.boundingBox())!.y).toBeGreaterThan(start.y + 10);
  const zOrder = () => Promise.all([first, second].map(win => win.evaluate(el => Number(getComputedStyle(el).zIndex))));
  await expect.poll(async () => {
    const [firstZ, secondZ] = await zOrder();
    return firstZ > secondZ;
  }).toBe(true);

  const resize = first.locator('[data-resize-handle="right"]');
  const edge = (await resize.boundingBox())!;
  const initialWidth = (await first.boundingBox())!.width;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 28, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(initialWidth + 10);

  const transform = () => page.locator(world).evaluate((el) => getComputedStyle(el).transform);
  const beforeZoom = await transform();
  await page.keyboard.press('Control+Alt+Equal');
  await expect.poll(transform).not.toBe(beforeZoom);
  const beforePan = await transform();
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect.poll(transform).not.toBe(beforePan);

  await page.keyboard.press('Control+Alt+w');
  const panel = page.getByRole('dialog', { name: 'Spatial desktop panel' });
  await panel.getByRole('button', { name: 'Go to Notes 2' }).click();
  await expect(panel).toBeHidden();
  const z = await zOrder();
  expect(z[1]).toBeGreaterThan(z[0]);
  await spatial(page, false);
  await expect(page.locator(instance('notes'))).toBeAttached();
  await expect(page.locator(instance(otherId!))).toBeAttached();
});

test.describe('native Browser surface', () => {
  test.skip(!process.env.DEX_SPATIAL_EXE, 'Requires the Windows WebView2 executable');

  test('keeps a live Browser page and its form across spatial transitions', async ({ dexPage: page }) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Spatial fixture</title><h1>Spatial fixture</h1><label>Draft <input></label>');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture server has no TCP address');
      const url = `http://127.0.0.1:${address.port}/spatial`;
      await openApp(page, 'browser');
      const addressBar = page.getByPlaceholder('Search or enter address');
      await addressBar.fill(url);
      await addressBar.press('Enter');

      const matchingPage = () => page.context().pages().find(tab => tab.url() === url);
      await expect.poll(() => !!matchingPage(), { timeout: 25_000 }).toBe(true);
      const site = matchingPage()!;
      const draft = site.getByRole('textbox', { name: 'Draft' });
      await draft.fill('Browser session');
      const surface = page.locator('[data-native-webview]').first();
      await expect(surface).toBeVisible();
      const originalWidth = (await surface.boundingBox())!.width;

      await spatial(page, true);
      await expect(page.locator(floating('browser')).locator('[data-native-webview]')).toBeVisible();
      await expect.poll(async () => (await surface.boundingBox())!.width).not.toBe(originalWidth);
      expect(matchingPage()).toBe(site);
      await expect(draft).toHaveValue('Browser session');
      await draft.fill('Browser session in spatial mode');

      await spatial(page, false);
      expect(matchingPage()).toBe(site);
      await expect(draft).toHaveValue('Browser session in spatial mode');
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
