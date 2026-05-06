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
    },
    timeout: 30000,
  });

  // Wait for main window
  const mainWindow = await app.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');
  
  // Wait a bit for React to hydrate
  await mainWindow.waitForTimeout(1000);
  
  return { app, mainWindow };
}

/**
 * Close DEX application
 */
export async function closeDEX(context: DEXTestContext): Promise<void> {
  if (context.app) {
    await context.app.close();
  }
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
