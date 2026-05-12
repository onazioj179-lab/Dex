// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Electron Test Helpers
 * ===========================================================================
 */

import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

export interface DEXTestContext {
  app: ElectronApplication;
  mainWindow: Page;
}

/**
 * Launch DEX application for testing
 */
export async function launchDEX(): Promise<DEXTestContext> {
  const appPath = path.join(__dirname, '../..');

  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DEX_E2E_TEST: 'true',
      // Point to the running Vite dev server so the renderer loads the full
      // React app. If the dev server is not running, main.ts falls back to
      // the built dist/renderer/index.html (which global-setup ensures exists).
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
    timeout: 60000,
  });

  // Wait for main window
  const mainWindow = await app.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');

  // Wait for shell landmarks instead of fixed sleep to reduce startup race flakiness.
  // Allow 45s for cold Electron start against a Vite dev server.
  await waitForDexShellReady(mainWindow, 45000);
  
  return { app, mainWindow };
}

/**
 * Close DEX application
 */
export async function closeDEX(context?: DEXTestContext): Promise<void> {
  if (context?.app) {
    await context.app.close();
  }
}

/**
 * Wait for DEX shell to be ready for interaction.
 */
export async function waitForDexShellReady(page: Page, timeout = 15000): Promise<void> {
  // App root no longer exposes role="application". Wait on stable shell anchors.
  await page.waitForSelector('#dex-main-content', { timeout });
  await page.waitForSelector('[role="main"]', { timeout });
  // Use 'attached' — the dock container may be visually hidden by auto-hide CSS
  // but the DOM node must exist for tests to interact with it.
  await page.waitForSelector('[data-dock-container]', { state: 'attached', timeout });
  await page.waitForFunction(
    () => {
      const dock = document.querySelector('[data-dock-container]');
      if (!dock) return false;
      // Default pins: browser, files, notes, gallery, calendar, calculator, settings, rewind (8 total)
      return dock.querySelectorAll('[data-dock-app-id]').length >= 2;
    },
    { timeout }
  );
}

/**
 * Launch an app from dock and wait for foreground app container.
 * Tries the dock first (with hover to reveal auto-hidden dock), then falls
 * back to the launchpad for apps that are not pinned by default.
 */
export async function launchAppFromDock(
  page: Page,
  appId: string,
  timeout = 15000
): Promise<void> {
  // Check if app has a dock button (only pinned apps do).
  const dockButton = page.locator(`[data-dock-app-id="${appId}"]`).first();
  const inDock = await dockButton.count().then(n => n > 0).catch(() => false);

  if (inDock) {
    // Hover the dock container to reveal it if auto-hidden, then click.
    const dockContainer = page.locator('[data-dock-container]').first();
    await dockContainer.hover({ timeout: 5000 }).catch(() => undefined);
    await dockButton.waitFor({ state: 'visible', timeout });
    await dockButton.click();
  } else {
    // App is not pinned — open via launchpad.
    const launchpadButton = page.locator('[data-dex-launchpad]').first();
    // Hover dock to reveal the launchpad button if it's inside the dock area.
    const dockContainer = page.locator('[data-dock-container]').first();
    await dockContainer.hover({ timeout: 5000 }).catch(() => undefined);
    await launchpadButton.waitFor({ state: 'visible', timeout });

    // Launchpad toggle is bound to onMouseDown in AppManager, so a plain
    // DOM click fallback is insufficient. Ensure grid becomes visible.
    const launchpadOpen = async () => {
      const grid = page.locator('[data-launchpad-grid]').first();
      return await grid.isVisible().catch(() => false);
    };

    if (!(await launchpadOpen())) {
      try {
        await launchpadButton.click({ force: true, timeout: 3000 });
      } catch {
        await launchpadButton.dispatchEvent('mousedown');
      }
    }

    if (!(await launchpadOpen())) {
      await launchpadButton.dispatchEvent('mousedown');
    }

    await page.waitForSelector('[data-dex-app-menu-panel]', { state: 'visible', timeout });
    const launchpadAppButton = page.locator(`[data-launchpad-app-id="${appId}"]:visible`).first();

    // If app menu opened in search-results mode, clear search to restore the full app grid.
    if (!(await launchpadAppButton.isVisible().catch(() => false))) {
      await page.evaluate(() => {
        const input = document.querySelector('[aria-label="Search apps and settings"]') as HTMLInputElement | null;
        if (!input) return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // Escape clears app-menu search in AppManager when it has text.
      await page.keyboard.press('Escape').catch(() => undefined);

      // If escape closed the menu, reopen it and continue.
      const panelOpen = await page.locator('[data-dex-app-menu-panel]').first().isVisible().catch(() => false);
      if (!panelOpen) {
        await launchpadButton.dispatchEvent('mousedown');
        await page.waitForSelector('[data-dex-app-menu-panel]', { state: 'visible', timeout });
      }
    }

    await launchpadAppButton.waitFor({ state: 'visible', timeout });
    try {
      await launchpadAppButton.click({ force: true, timeout: 3000 });
    } catch {
      await page.evaluate((id) => {
        const btn = document.querySelector(`[data-launchpad-app-id="${id}"]`) as HTMLElement | null;
        btn?.click();
      }, appId);
    }
  }

  await page.waitForSelector(`[data-testid="app-instance-${appId}"][data-app-state="foreground"]`, { timeout });

  // Wait for the lazy-loaded React component to finish loading (Suspense fallback gone).
  // The Loading skeleton renders with [data-app-loading] — wait for it to be detached
  // from this app's instance, indicating the actual app content has rendered.
  await page.waitForFunction(
    (id) => {
      const instance = document.querySelector(`[data-testid="app-instance-${id}"]`);
      if (!instance) return false;
      return !instance.querySelector('[data-app-loading]');
    },
    appId,
    { timeout }
  );
}

/**
 * Get app version via IPC
 */
export async function getAppVersion(context: DEXTestContext): Promise<string> {
  return await context.app.evaluate(async ({ app }) => {
    return app.getVersion();
  });
}

/**
 * Get app name
 */
export async function getAppName(context: DEXTestContext): Promise<string> {
  return await context.app.evaluate(async ({ app }) => {
    return app.getName();
  });
}

/**
 * Check if window is visible
 */
export async function isWindowVisible(context: DEXTestContext): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const visible = await context.app.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return false;
      const main = windows[0];
      return !main.isDestroyed() && (!main.isMinimized() || main.isVisible());
    });
    if (visible) return true;
    await context.mainWindow.waitForTimeout(300);
  }
  return false;
}

/**
 * Get window title
 */
export async function getWindowTitle(context: DEXTestContext): Promise<string> {
  return await context.mainWindow.title();
}

/**
 * Navigate to a page in the app
 */
export async function navigateTo(context: DEXTestContext, path: string): Promise<void> {
  // Click on sidebar navigation
  const navItem = context.mainWindow.locator(`[data-nav="${path}"]`);
  if (await navItem.isVisible()) {
    await navItem.click();
    await context.mainWindow.waitForTimeout(500);
  }
}

/**
 * Wait for element with retry
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 10000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take screenshot with timestamp
 */
export async function takeScreenshot(
  context: DEXTestContext,
  name: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await context.mainWindow.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Execute JavaScript in renderer
 */
export async function executeInRenderer<T>(
  context: DEXTestContext,
  fn: () => T
): Promise<T> {
  return await context.mainWindow.evaluate(fn);
}

/**
 * Get console logs from app
 */
export function setupConsoleLogger(context: DEXTestContext): string[] {
  const logs: string[] = [];
  context.mainWindow.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  return logs;
}
