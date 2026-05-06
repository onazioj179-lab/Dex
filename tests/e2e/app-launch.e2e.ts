// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Application Launch Tests
 * ===========================================================================
 */

import { test, expect } from '@playwright/test';
import {
  launchDEX,
  closeDEX,
  DEXTestContext,
  getAppVersion,
  getAppName,
  isWindowVisible,
  getWindowTitle,
} from './helpers';

let context: DEXTestContext;

test.describe('DEX Application Launch', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should launch successfully', async () => {
    expect(context.app).toBeDefined();
    expect(context.mainWindow).toBeDefined();
  });

  test('should have correct app name', async () => {
    const name = await getAppName(context);
    expect(name).toMatch(/dex/i);
  });

  test('should have version 3.6.0', async () => {
    const version = await getAppVersion(context);
    expect(version).toBe('3.6.0');
  });

  test('should show main window', async () => {
    const visible = await isWindowVisible(context);
    expect(visible).toBe(true);
  });

  test('should have DEX in title', async () => {
    const title = await getWindowTitle(context);
    expect(title).toContain('Dex');
  });

  test('should render React app', async () => {
    // Check for root React element
    const root = await context.mainWindow.locator('#root');
    await expect(root).toBeVisible();
  });
});
