// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dex-first-launch-splash-seen', '1'));
  await page.goto('/');
  await expect(page.getByRole('application', { name: 'DEX Desktop' })).toBeVisible();
});

test('Activity records a new task and opens its details after Tasks closes', async ({ page }) => {
  await page.evaluate(() => {
    const original = window.dex;
    const feed: Record<string, unknown>[] = [];
    Object.assign(window, { dex: {
      ...original,
      async invoke(channel: string, ...args: unknown[]) {
        if (channel === 'activity-feed:record') {
          feed.unshift({ id: feed.length + 1, event_type: args[0], source: args[1],
            app: args[2], title: args[3], details: JSON.stringify(args[4]), created_at: new Date().toISOString() });
          return { success: true };
        }
        if (channel === 'activity-feed:get') return [...feed];
        return original?.invoke?.(channel, ...args);
      },
    } });
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'tasks' } }));
  });
  const tasks = page.locator('[data-floating-window="tasks"]');
  const input = tasks.getByRole('textbox', { name: 'Add a task' });
  await input.fill('Review activity handoff');
  await input.press('Enter');
  await expect(tasks.getByText('Review activity handoff', { exact: true })).toBeVisible();
  await tasks.getByRole('button', { name: 'Close Tasks', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'activity' } })));
  const activity = page.locator('[data-floating-window="activity"]');
  await activity.getByRole('radio', { name: 'Live', exact: true }).click();
  await activity.getByText('Created Review activity handoff', { exact: true }).click();
  await expect(tasks.getByPlaceholder('Add a description...')).toBeVisible();
  await expect(tasks.getByText('Review activity handoff', { exact: true })).toBeVisible();
});

test('App Menu opens an indexed file in its containing folder', async ({ page }) => {
  const directory = 'C:\\Work\\Field notes';
  const file = {
    name: 'Seasonal field log.txt', path: `${directory}\\Seasonal field log.txt`,
    isDirectory: false, size: 1024, extension: 'txt', modified: '2026-11-26T18:00:00.000Z',
  };
  await page.evaluate(({ directory, file }) => {
    const original = window.dex;
    Object.assign(window, { dex: {
      ...original,
      async invoke(channel: string, ...args: unknown[]) {
        if (channel === 'files:search') return { success: true, files: [file] };
        if (channel === 'files:list') return { success: true, path: args[0], files: args[0] === directory ? [file] : [] };
        return original?.invoke?.(channel, ...args);
      },
    } });
    window.dispatchEvent(new CustomEvent('dex-command', { detail: { action: 'appMenu' } }));
  }, { directory, file });

  const menu = page.getByRole('dialog', { name: 'App menu' });
  const search = menu.getByRole('combobox');
  await expect(search).toHaveAttribute('placeholder', 'Search');
  await search.fill('Seasonal field log');
  await expect(menu.getByRole('option').first()).toContainText(file.name);
  await search.press('Enter');
  await expect(menu).toBeHidden();
  const files = page.locator('[data-floating-window="files"]');
  await expect(files.getByText(file.name, { exact: true }).first()).toBeVisible();
  await expect(files.getByRole('button', { name: 'Field notes', exact: true })).toBeVisible();
});

test('Screen Recorder releases cancelled streams and finalizes a synthetic capture', async ({ page }) => {
  await page.evaluate(() => {
    const controls = { resolvePicker: () => {}, track: null as MediaStreamTrack | null };
    Object.assign(window, { recorderTest: controls });
    navigator.mediaDevices.getDisplayMedia = () => new Promise<MediaStream>((resolve) => {
      controls.resolvePicker = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        controls.track = track;
        let frame = 0;
        const timer = window.setInterval(() => {
          if (track.readyState === 'ended') { window.clearInterval(timer); return; }
          ctx.fillStyle = ++frame % 2 ? '#864' : '#468';
          ctx.fillRect(0, 0, 32, 32);
        }, 32);
        resolve(stream);
      };
    });
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'screenrecorder' } }));
  });

  const recorder = page.locator('[data-floating-window="screenrecorder"]');
  const start = recorder.getByRole('button', { name: 'Start recording' });
  const cancel = recorder.getByRole('button', { name: 'Cancel' });
  const status = recorder.getByRole('status');
  const resolvePicker = () => page.evaluate(() => (window as any).recorderTest.resolvePicker());
  const trackState = () => page.evaluate(() => (window as any).recorderTest.track?.readyState);

  await start.click();
  await expect(status).toContainText('Choose a source');
  await cancel.click();
  await resolvePicker();
  await expect.poll(trackState).toBe('ended');
  await expect(status).toContainText('Ready');

  await start.click();
  await resolvePicker();
  await expect(status).toContainText('Starting');
  await cancel.click();
  await expect.poll(trackState).toBe('ended');

  await recorder.getByRole('combobox', { name: 'Countdown' }).selectOption('0');
  await start.click();
  await resolvePicker();
  await expect(status).toContainText('Recording');
  await expect(recorder.locator('video')).toHaveJSProperty('readyState', 4);
  await recorder.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(status).toContainText('Paused');
  await recorder.getByRole('button', { name: 'Resume' }).click();
  await recorder.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(recorder.getByRole('button', { name: /^Download dex-screen-/ })).toBeVisible();
  await expect.poll(trackState).toBe('ended');
  await expect(status).toContainText('Ready');
});

test('QR Code uses the current DEX Browser page without a clipboard read', async ({ page }) => {
  const url = 'https://example.invalid/project';
  await page.route('https://example.invalid/**', route => route.fulfill({ body: '<title>Project</title>' }));
  await page.evaluate(target => {
    window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: 'browser', contextId: target } }));
  }, url);
  await expect(page.getByPlaceholder('Search or enter address')).toHaveValue(url);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'qrcode' } })));
  const qr = page.locator('[data-floating-window="qrcode"]');
  await qr.getByRole('button', { name: 'Encode current URL' }).click();
  await expect(qr.getByRole('textbox', { name: 'URL to encode' })).toHaveValue(url);
});
