// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { test, expect, type Page } from '@playwright/test';

async function openNow(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox').fill('right now');
  await palette.getByText('Now — Current Context', { exact: true }).click();
  const now = page.getByRole('dialog', { name: 'Now', exact: true });
  await expect(now).toBeVisible();
  return now;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dex-first-launch-splash-seen', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__dexRunningApps && !!document.querySelector('.dex-now'));
});

test('Now opens from the command palette, tracks work live, and fits narrow screens', async ({ page }) => {
  const now = await openNow(page);
  const close = now.getByRole('button', { name: 'Close Now' });
  await expect(close).toBeFocused();
  const sidebar = now.getByRole('region', { name: 'Current context' });
  const activity = now.getByRole('region', { name: 'Recent activity' });
  await expect(sidebar.getByText('Workspace', { exact: true })).toHaveCount(2);
  const sidebarBox = (await sidebar.boundingBox())!;
  const activityBox = (await activity.boundingBox())!;
  expect(activityBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width);

  await page.evaluate(() => {
    const apps = window.__dexRunningApps!.getState();
    for (const id of ['tasks', 'calculator']) apps.launchApp({ id, name: id, icon: id, color: '#888888' });
  });
  await expect(activity.getByText('Tasks', { exact: true })).toBeVisible();
  await expect(activity.getByText('Calculator', { exact: true })).toBeVisible();
  await expect(page.getByRole('application', { name: 'DEX Desktop', includeHidden: true })).toBeAttached();
  await now.getByRole('button', { name: 'Switch to Tasks' }).click();
  await expect(now).toBeHidden();

  const addTask = page.getByRole('textbox', { name: 'Add a task' });
  await expect(addTask).toBeVisible();
  await addTask.fill('Review Now panel');
  await addTask.press('Enter');
  await page.getByRole('button', { name: 'Complete "Review Now panel"' }).click();

  await page.setViewportSize({ width: 390, height: 580 });
  await openNow(page);
  const region = now.getByRole('region', { name: 'Recent activity' });
  await expect(region.getByText('Created task')).toHaveCount(1);
  await expect(region.getByText('Completed task')).toHaveCount(1);
  await expect(region.getByText('Review Now panel')).toHaveCount(2);
  expect((await region.boundingBox())!.y).toBeGreaterThan((await sidebar.boundingBox())!.y);
  const dialogBox = (await now.boundingBox())!;
  expect(dialogBox.x).toBeGreaterThan(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThan(390);
  expect(dialogBox.y + dialogBox.height).toBeLessThan(580);
  await page.keyboard.press('Escape');
  await expect(now).toBeHidden();
});

test('Now shows the active DexCode file and keeps its history when the tab closes', async ({ page }) => {
  await expect(page.getByRole('application', { name: 'DEX Desktop' })).toBeVisible();
  const filePath = 'C:/Projects/DEX/source.dex';
  await page.evaluate((path) => {
    const original = window.dex;
    Object.assign(window, { dex: {
      ...original,
      async invoke(channel: string, ...args: unknown[]) {
        if (channel === 'dialog:showOpenDialog') return { filePaths: [path] };
        if (channel === 'fs:readText') return { ok: true, content: 'print(1)' };
        if (channel === 'fs:writeText') return new Promise(resolve => {
          Object.assign(window, { finishSave: () => resolve({ ok: true }) });
        });
        return original?.invoke?.(channel, ...args);
      },
    } });
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'dexcode' } }));
  }, filePath);

  const editor = page.locator('[data-floating-window="dexcode"]');
  await editor.getByRole('button', { name: /^Open File/ }).click();
  await expect(editor.getByRole('textbox', { name: 'File name' })).toHaveValue('source.dex');
  await editor.getByRole('button', { name: /^New File/ }).click();
  const closeTab = editor.getByRole('button', { name: 'Close source.dex' });
  await expect(closeTab).toBeVisible();
  await editor.getByRole('tab', { name: /^source\.dex/ }).click();
  await editor.getByRole('button', { name: /^Save Ctrl/ }).click();
  await editor.getByRole('tab', { name: /^untitled\.dex/ }).click();
  await page.evaluate(() => (window as Window & { finishSave?: () => void }).finishSave?.());
  const fileName = editor.getByRole('textbox', { name: 'File name' });
  await expect(fileName).toHaveValue('untitled.dex');
  await editor.getByRole('tab', { name: /^source\.dex/ }).click();

  const now = await openNow(page);
  const context = now.getByRole('region', { name: 'Current context' });
  const recent = now.getByRole('region', { name: 'Recent activity' });
  await expect(context.getByText(filePath, { exact: true })).toBeVisible();
  await expect(recent.getByText('Opened file')).toBeVisible();
  await expect(recent.getByText('Saved file')).toBeVisible();

  await now.getByRole('button', { name: 'Close Now' }).click();
  await closeTab.click();
  await openNow(page);
  await expect(context.getByText('Active file')).toHaveCount(0);
  await expect(recent.getByText('source.dex', { exact: true })).toHaveCount(2);
});
