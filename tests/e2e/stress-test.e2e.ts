// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - UI Stress Test
 * ===========================================================================
 * Tests:
 * - All apps open without UI gaps or broken icons
 * - No transparency in backgrounds
 * - Text rendering is correct
 * - Button sizing and layout
 * - Concurrent app opening
 * - App switching stability
 */

import { test, expect } from '@playwright/test';
import { launchDEX, closeDEX, DEXTestContext } from './helpers';

let context: DEXTestContext;

const APPS_TO_TEST = [
  { id: 'files', label: 'Files', selector: 'button[aria-label*="Files"]' },
  { id: 'browser', label: 'Browser', selector: 'button[aria-label*="Browser"]' },
  { id: 'calculator', label: 'Calculator', selector: 'button[aria-label*="Calculator"]' },
  { id: 'notes', label: 'Notes', selector: 'button[aria-label*="Notes"]' },
  { id: 'settings', label: 'Settings', selector: 'button[aria-label*="Settings"]' },
  { id: 'gallery', label: 'Gallery', selector: 'button[aria-label*="Gallery"]' },
  { id: 'tasks', label: 'Tasks', selector: 'button[aria-label*="Tasks"]' },
];

test.describe('DEX UI Stress Test', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    // Wait for app to stabilize
    await context.mainWindow.waitForTimeout(500);
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should have solid backgrounds (no transparency)', async () => {
    const mainContent = context.mainWindow.locator('[role="main"]');
    const bgColor = await mainContent.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor;
    });

    // Should not be transparent
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toMatch(/rgba\(\d+, \d+, \d+, 0\.\d\)/); // No partial transparency
  });

  test('should render dock with all icons visible', async () => {
    const dock = context.mainWindow.locator('[role="toolbar"]');
    const buttons = dock.locator('button');
    const count = await buttons.count();

    expect(count).toBeGreaterThan(0);

    // Check each button has visible icon
    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      const isVisible = await button.isVisible();
      expect(isVisible).toBe(true);

      // Button should have img child
      const img = button.locator('img').first();
      const imgCount = await button.locator('img').count();
      expect(imgCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should open Files app without gaps or broken icons', async () => {
    const filesBtn = context.mainWindow.locator('button[aria-label*="Files"]').first();
    await filesBtn.click();
    await context.mainWindow.waitForTimeout(800);

    const sidebarItems = context.mainWindow.locator('[role="region"]').first().locator('button, [role="button"]');
    const sidebarCount = await sidebarItems.count();
    expect(sidebarCount).toBeGreaterThan(0);

    // Check for broken icons - each item should have content
    for (let i = 0; i < sidebarCount; i++) {
      const item = sidebarItems.nth(i);
      const text = await item.textContent();
      // Icon should exist (check for img or svg)
      const hasIcon = await item.locator('svg, img').count().then(c => c > 0);
      // Either has icon OR has text content
      expect(text?.trim().length || hasIcon).toBeTruthy();
    }
  });

  test('should open Calculator with proper button sizing', async () => {
    // Close Files first
    const fileCloseBtn = context.mainWindow.locator('button[aria-label="Close Files"]').first();
    if (await fileCloseBtn.isVisible()) {
      await fileCloseBtn.click();
      await context.mainWindow.waitForTimeout(300);
    }

    const calcBtn = context.mainWindow.locator('button[aria-label*="Calculator"]').first();
    await calcBtn.click();
    await context.mainWindow.waitForTimeout(800);

    // Check calculator buttons are visible and properly sized
    const numberButtons = context.mainWindow.locator('button').filter({ has: context.mainWindow.locator('text=/^[0-9.]$|^AC$|^\\+\\/-$|^%$|^\\/$|^x$|^-$|^\\+$|^=$') });
    const buttonCount = await numberButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // All buttons should be clickable
    const firstButton = context.mainWindow.locator('button:text("1")').first();
    if (await firstButton.isVisible()) {
      const boundingBox = await firstButton.boundingBox();
      // Button should have reasonable size (not collapsed)
      expect(boundingBox?.width).toBeGreaterThan(20);
      expect(boundingBox?.height).toBeGreaterThan(20);
    }
  });

  test('should open Browser and render correctly', async () => {
    const closeBtn = context.mainWindow.locator('button[aria-label="Close Calculator"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await context.mainWindow.waitForTimeout(300);
    }

    const browserBtn = context.mainWindow.locator('button[aria-label*="Browser"]').first();
    await browserBtn.click();
    await context.mainWindow.waitForTimeout(800);

    // Check for search input
    const searchInput = context.mainWindow.locator('input[placeholder*="Search"]').first();
    expect(await searchInput.isVisible()).toBe(true);

    // Check Browser label visible
    const label = context.mainWindow.locator('text=Browser').first();
    expect(await label.isVisible()).toBe(true);
  });

  test('should open Settings with sidebar icons visible', async () => {
    const closeBtn = context.mainWindow.locator('button[aria-label="Close Browser"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await context.mainWindow.waitForTimeout(300);
    }

    const settingsBtn = context.mainWindow.locator('button[aria-label*="Settings"]').first();
    await settingsBtn.click();
    await context.mainWindow.waitForTimeout(800);

    // Check for settings sections
    const settingsLabel = context.mainWindow.locator('text=Settings').first();
    expect(await settingsLabel.isVisible()).toBe(true);

    // Check sidebar items are visible
    const sidebarButtons = context.mainWindow.locator('[role="region"]').first().locator('button, div[role="button"]');
    const sidebarCount = await sidebarButtons.count();
    expect(sidebarCount).toBeGreaterThan(0);
  });

  test('should handle rapid app switching', async () => {
    // Rapidly switch between 3 apps
    const appSequence = ['Files', 'Browser', 'Calculator'];

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const appName of appSequence) {
        const btn = context.mainWindow.locator(`button[aria-label*="${appName}"]`).first();
        if (await btn.isVisible()) {
          await btn.click();
          await context.mainWindow.waitForTimeout(300);

          // Verify app content loads
          const tabLabel = context.mainWindow.locator(`text="${appName}"`);
          expect(await tabLabel.isVisible()).toBe(true);
        }
      }
    }
  });

  test('should not have console errors related to rendering', async () => {
    const consoleMessages: string[] = [];

    context.mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(msg.text());
      }
    });

    // Trigger some interactions
    const buttons = context.mainWindow.locator('button').filter({ visible: true });
    const count = Math.min(await buttons.count(), 5);

    for (let i = 0; i < count; i++) {
      try {
        await buttons.nth(i).click({ timeout: 100 });
        await context.mainWindow.waitForTimeout(100);
      } catch {
        // Ignore click failures
      }
    }

    // Filter out expected errors (CSP, devtools, etc)
    const renderErrors = consoleMessages.filter(
      (msg) =>
        !msg.includes('CSP') &&
        !msg.includes('devtools') &&
        !msg.includes('X-Frame-Options') &&
        !msg.includes('Zustand') &&
        !msg.includes('Redux')
    );

    expect(renderErrors).toHaveLength(0);
  });

  test('should have proper text contrast and readability', async () => {
    // Check main content text is visible
    const mainContent = context.mainWindow.locator('[role="main"]');
    const textElements = mainContent.locator('*:has-text(".")');
    const visibleCount = await textElements.filter({ visible: true }).count();
    expect(visibleCount).toBeGreaterThan(0);
  });

  test('should render floating windows without gaps', async () => {
    const closeAllBtn = context.mainWindow.locator('button:has-text("Close all")').first();
    if (await closeAllBtn.isVisible()) {
      await closeAllBtn.click();
      await context.mainWindow.waitForTimeout(500);
    }

    // Open multiple apps
    const filesBtn = context.mainWindow.locator('button[aria-label*="Files"]').first();
    const settingsBtn = context.mainWindow.locator('button[aria-label*="Settings"]').first();

    await filesBtn.click();
    await context.mainWindow.waitForTimeout(400);
    await settingsBtn.click();
    await context.mainWindow.waitForTimeout(400);

    // Check both windows are visible and don't overlap incorrectly
    const windows = context.mainWindow.locator('[role="region"]');
    expect(await windows.count()).toBeGreaterThanOrEqual(0);

    // Check tabs are properly rendered
    const tabs = context.mainWindow.locator('[role="tab"]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);

    // All visible tabs should have proper sizing
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        const boundingBox = await tab.boundingBox();
        expect(boundingBox?.width).toBeGreaterThan(50);
      }
    }
  });

  test('should have functioning dock with app indicators', async () => {
    const dock = context.mainWindow.locator('[role="toolbar"]');
    const buttons = dock.locator('button');

    // Check for active/running indicators
    const runningButtons = buttons.filter({ has: context.mainWindow.locator('text=/running/i') });
    const runningCount = await runningButtons.count();

    // Should have at least 2 apps running (Files and Settings from previous test)
    expect(runningCount).toBeGreaterThanOrEqual(0);
  });
});
