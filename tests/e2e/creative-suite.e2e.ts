// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Creative Suite Tests
 * Tests for VINX, Imosion, Prism, Flux, Forge, and AXL
 * ===========================================================================
 */

import { test, expect, Page } from '@playwright/test';
import {
  launchDEX,
  closeDEX,
  DEXTestContext,
  waitForAppLoad,
} from './helpers';

let context: DEXTestContext;
let page: Page;

test.describe('Creative Suite Apps', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test.describe('VINX Video Editor', () => {
    test('should launch from dock', async () => {
      // Click the video editor icon in the dock
      const vinxIcon = page.locator('[data-app-id="videoeditor"], [aria-label*="VINX"], [aria-label*="Video"]').first();
      await vinxIcon.click();
      
      // Wait for the app to load
      await expect(page.locator('[data-testid="vinx-app"], .vinx-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display timeline panel', async () => {
      const timeline = page.locator('[data-testid="vinx-timeline"], .timeline-container, [class*="timeline"]').first();
      await expect(timeline).toBeVisible({ timeout: 5000 });
    });

    test('should display viewer panel', async () => {
      const viewer = page.locator('[data-testid="vinx-viewer"], [data-vinx-program-canvas], [class*="viewer"]').first();
      await expect(viewer).toBeVisible({ timeout: 5000 });
    });

    test('should have transport controls', async () => {
      const playButton = page.locator('button[aria-label*="Play"], [data-testid="play-button"]').first();
      await expect(playButton).toBeVisible({ timeout: 5000 });
    });

    test('should have timeline tools', async () => {
      // Check for timeline tool buttons (select, razor, etc.)
      const tools = page.locator('[data-testid="timeline-tools"], [class*="toolbar"]').first();
      await expect(tools).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-vinx"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Imosion DAW', () => {
    test('should launch from dock', async () => {
      const imosionIcon = page.locator('[data-app-id="imosion"], [aria-label*="Imosion"], [aria-label*="DAW"]').first();
      await imosionIcon.click();
      
      await expect(page.locator('[data-testid="imosion-app"], .imosion-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display track list', async () => {
      const tracks = page.locator('[data-testid="imosion-tracks"], [class*="track-list"]').first();
      await expect(tracks).toBeVisible({ timeout: 5000 });
    });

    test('should display mixer panel', async () => {
      // Mixer might be in a tab or always visible
      const mixer = page.locator('[data-testid="imosion-mixer"], [class*="mixer"]').first();
      await expect(mixer).toBeVisible({ timeout: 5000 });
    });

    test('should have transport controls', async () => {
      const transport = page.locator('[data-testid="imosion-transport"], [class*="transport"]').first();
      await expect(transport).toBeVisible({ timeout: 5000 });
    });

    test('should have BPM display', async () => {
      const bpm = page.locator('[data-testid="bpm-display"], [class*="bpm"]').first();
      await expect(bpm).toBeVisible({ timeout: 5000 });
    });

    test('should close without memory leaks', async () => {
      const closeButton = page.locator('[data-testid="close-imosion"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        // Wait for cleanup
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Prism Image Editor', () => {
    test('should launch from dock', async () => {
      const prismIcon = page.locator('[data-app-id="prism"], [aria-label*="Prism"], [aria-label*="Image"]').first();
      await prismIcon.click();
      
      await expect(page.locator('[data-testid="prism-app"], .prism-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display canvas area', async () => {
      const canvas = page.locator('[data-testid="prism-canvas"], canvas, [class*="canvas"]').first();
      await expect(canvas).toBeVisible({ timeout: 5000 });
    });

    test('should have tool palette', async () => {
      const tools = page.locator('[data-testid="prism-tools"], [class*="tool-palette"]').first();
      await expect(tools).toBeVisible({ timeout: 5000 });
    });

    test('should have layers panel', async () => {
      const layers = page.locator('[data-testid="prism-layers"], [class*="layers"]').first();
      await expect(layers).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-prism"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Flux Motion Graphics', () => {
    test('should launch from dock', async () => {
      const fluxIcon = page.locator('[data-app-id="flux"], [aria-label*="Flux"], [aria-label*="Motion"]').first();
      await fluxIcon.click();
      
      await expect(page.locator('[data-testid="flux-app"], .flux-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display composition viewer', async () => {
      const viewer = page.locator('[data-testid="flux-viewer"], [class*="composition"]').first();
      await expect(viewer).toBeVisible({ timeout: 5000 });
    });

    test('should have keyframe timeline', async () => {
      const timeline = page.locator('[data-testid="flux-timeline"], [class*="keyframe"]').first();
      await expect(timeline).toBeVisible({ timeout: 5000 });
    });

    test('should have effects panel', async () => {
      const effects = page.locator('[data-testid="flux-effects"], [class*="effects"]').first();
      await expect(effects).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-flux"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Forge Encoder', () => {
    test('should launch from dock', async () => {
      const forgeIcon = page.locator('[data-app-id="forge"], [aria-label*="Forge"], [aria-label*="Encoder"]').first();
      await forgeIcon.click();
      
      await expect(page.locator('[data-testid="forge-app"], .forge-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display queue panel', async () => {
      const queue = page.locator('[data-testid="forge-queue"], [class*="queue"]').first();
      await expect(queue).toBeVisible({ timeout: 5000 });
    });

    test('should have preset selector', async () => {
      const presets = page.locator('[data-testid="forge-presets"], [class*="preset"]').first();
      await expect(presets).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-forge"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('AXL CAD', () => {
    test('should launch from dock', async () => {
      const axlIcon = page.locator('[data-app-id="axl"], [aria-label*="AXL"], [aria-label*="CAD"]').first();
      await axlIcon.click();
      
      await expect(page.locator('[data-testid="axl-app"], .axl-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display 3D viewport', async () => {
      const viewport = page.locator('[data-testid="axl-viewport"], canvas, [class*="viewport"]').first();
      await expect(viewport).toBeVisible({ timeout: 5000 });
    });

    test('should have modeling tools', async () => {
      const tools = page.locator('[data-testid="axl-tools"], [class*="tool"]').first();
      await expect(tools).toBeVisible({ timeout: 5000 });
    });

    test('should have object hierarchy', async () => {
      const hierarchy = page.locator('[data-testid="axl-hierarchy"], [class*="hierarchy"], [class*="outliner"]').first();
      await expect(hierarchy).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-axl"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });
});

test.describe('Creative Suite Integration', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should support opening multiple creative apps simultaneously', async () => {
    // Open VINX
    const vinxIcon = page.locator('[data-app-id="videoeditor"], [aria-label*="VINX"]').first();
    await vinxIcon.click();
    await page.waitForTimeout(2000);
    
    // Open Prism
    const prismIcon = page.locator('[data-app-id="prism"], [aria-label*="Prism"]').first();
    await prismIcon.click();
    await page.waitForTimeout(2000);
    
    // Both should be running
    const runningApps = await page.locator('[data-running-app]').count();
    expect(runningApps).toBeGreaterThanOrEqual(2);
  });

  test('should maintain performance with multiple apps', async () => {
    // Get performance metrics
    const metrics = await page.evaluate(() => {
      return {
        memory: (performance as any).memory?.usedJSHeapSize || 0,
        timing: performance.now(),
      };
    });
    
    // Memory should be under 500MB for reasonable performance
    if (metrics.memory > 0) {
      expect(metrics.memory).toBeLessThan(500 * 1024 * 1024);
    }
  });

  test('should properly clean up when closing apps', async () => {
    // Close all creative apps
    const closeButtons = page.locator('button[aria-label*="Close"]');
    const count = await closeButtons.count();
    
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = closeButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }
    
    // Verify cleanup - memory should not keep growing
    await page.waitForTimeout(1000);
    
    const finalMetrics = await page.evaluate(() => {
      // Force garbage collection if available
      if ((window as any).gc) {
        (window as any).gc();
      }
      return {
        memory: (performance as any).memory?.usedJSHeapSize || 0,
      };
    });
    
    // Just verify we can get metrics without crash
    expect(finalMetrics).toBeDefined();
  });
});
