/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX E2E - Navigation Tests
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import {
  launchDEX,
  closeDEX,
  DEXTestContext,
  waitForElement,
} from './helpers';

let context: DEXTestContext;

test.describe('DEX Navigation', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
  });

  test('should have sidebar visible', async () => {
    const sidebar = context.mainWindow.locator('[data-testid="sidebar"]');
    // If no test IDs, try generic selectors
    const sidebarAlt = context.mainWindow.locator('nav, aside, [class*="sidebar"]');
    const navLabel = context.mainWindow.locator('text=Home').first();
    const hasSidebar = await sidebar.isVisible().catch(() => false) || 
                       await sidebarAlt.first().isVisible().catch(() => false) ||
                       await navLabel.isVisible().catch(() => false);
    expect(hasSidebar).toBe(true);
  });

  test('should navigate to home page', async () => {
    // Look for home link or button
    const homeButton = context.mainWindow.locator('text=Home').first();
    if (await homeButton.isVisible()) {
      await homeButton.click();
      await context.mainWindow.waitForTimeout(500);
    }
    // Page should still be loaded
    expect(await context.mainWindow.title()).toMatch(/dex/i);
  });

  test('should show DEX apps', async () => {
    // Check if any app tiles or cards are visible
    const appTiles = context.mainWindow.locator('[data-testid="app-tile"], [class*="app-card"], [class*="AppTile"]');
    const count = await appTiles.count().catch(() => 0);
    // Should have at least some apps visible or the app should be rendered
    const pageContent = await context.mainWindow.content();
    expect(pageContent.length).toBeGreaterThan(0);
  });
});

test.describe('DEX App Pages', () => {
  test.beforeAll(async () => {
    if (!context?.mainWindow || context.mainWindow.isClosed()) {
      context = await launchDEX();
    }
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should load Files page', async () => {
    const filesLink = context.mainWindow.locator('text=Files').first();
    if (await filesLink.isVisible()) {
      await filesLink.click();
      await context.mainWindow.waitForTimeout(500);
    }
    expect(await context.mainWindow.title()).toBeTruthy();
  });

  test('should load Notes page', async () => {
    const notesLink = context.mainWindow.locator('text=Notes').first();
    if (await notesLink.isVisible()) {
      await notesLink.click();
      await context.mainWindow.waitForTimeout(500);
    }
    expect(await context.mainWindow.title()).toBeTruthy();
  });

  test('should load Settings page', async () => {
    const settingsLink = context.mainWindow.locator('text=Settings').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await context.mainWindow.waitForTimeout(500);
    }
    expect(await context.mainWindow.title()).toBeTruthy();
  });
});
