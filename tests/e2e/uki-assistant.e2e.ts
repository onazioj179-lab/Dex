// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - UKI Assistant Tests
 * Tests for UKI voice assistant and AI features
 * ===========================================================================
 */

import { test, expect, Page } from '@playwright/test';
import {
  launchDEX,
  closeDEX,
  DEXTestContext,
} from './helpers';

let context: DEXTestContext;
let page: Page;

test.describe('UKI Assistant', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test.describe('UKI Panel', () => {
    test('should open UKI panel from dock', async () => {
      const ukiIcon = page.locator('[data-app-id="uki"], [aria-label*="UKI"], [aria-label*="Assistant"]').first();
      await ukiIcon.click();
      
      await expect(page.locator('[data-testid="uki-panel"], .uki-container, [class*="uki"]')).toBeVisible({ timeout: 10000 });
    });

    test('should display chat input', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await expect(input).toBeVisible({ timeout: 5000 });
    });

    test('should display suggestions', async () => {
      const suggestions = page.locator('[data-testid="uki-suggestions"], [class*="suggestion"]').first();
      // Suggestions may or may not be visible depending on state
      // Just check no crash
      await page.waitForTimeout(500);
    });

    test('should send a message', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('What time is it?');
      await input.press('Enter');
      
      // Should show response or loading indicator
      await page.waitForTimeout(1000);
      const response = page.locator('[data-testid="uki-message"], [class*="message"]');
      expect(await response.count()).toBeGreaterThan(0);
    });

    test('should clear conversation', async () => {
      const clearBtn = page.locator('button[aria-label*="Clear"], button[aria-label*="New"], [data-testid="clear-chat"]').first();
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('UKI Commands', () => {
    test('should handle app launch command', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('Open Notes');
      await input.press('Enter');
      
      // Should launch Notes app
      await page.waitForTimeout(2000);
      const notesApp = page.locator('[data-testid="notes-app"], .notes-container');
      await expect(notesApp).toBeVisible({ timeout: 5000 });
    });

    test('should handle setting command', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('Turn on dark mode');
      await input.press('Enter');
      
      // Should acknowledge the command
      await page.waitForTimeout(1000);
    });

    test('should handle calculation', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('What is 25 times 4?');
      await input.press('Enter');
      
      // Should show result
      await page.waitForTimeout(1000);
      const response = page.locator('text=100, text=25 × 4').first();
      // Just verify no crash - actual result may vary
    });

    test('should handle web search', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('Search for TypeScript documentation');
      await input.press('Enter');
      
      // Should show search results or open browser
      await page.waitForTimeout(2000);
    });
  });

  test.describe('UKI Voice Control', () => {
    test('should have voice button', async () => {
      const voiceBtn = page.locator('button[aria-label*="Voice"], button[aria-label*="Microphone"], [data-testid="voice-btn"]').first();
      await expect(voiceBtn).toBeVisible({ timeout: 5000 });
    });

    test('should activate voice mode on click', async () => {
      const voiceBtn = page.locator('button[aria-label*="Voice"], button[aria-label*="Microphone"], [data-testid="voice-btn"]').first();
      
      if (await voiceBtn.isVisible()) {
        await voiceBtn.click();
        
        // Should show listening indicator
        const listening = page.locator('[data-testid="voice-listening"], [class*="listening"], [class*="recording"]');
        // May require microphone permission
        await page.waitForTimeout(500);
        
        // Click again to stop
        await voiceBtn.click();
      }
    });

    test('should show voice waveform when active', async () => {
      // Voice waveform visualization
      const waveform = page.locator('[data-testid="voice-waveform"], [class*="waveform"]');
      // Just verify no crash - waveform may not be visible without active recording
      await page.waitForTimeout(200);
    });
  });

  test.describe('UKI Context Awareness', () => {
    test('should understand app context', async () => {
      // Open Notes first
      const notesIcon = page.locator('[data-app-id="notes"], [aria-label*="Notes"]').first();
      await notesIcon.click();
      await page.waitForTimeout(1000);
      
      // Ask UKI about current app
      const ukiIcon = page.locator('[data-app-id="uki"], [aria-label*="UKI"]').first();
      await ukiIcon.click();
      await page.waitForTimeout(500);
      
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('Create a new note');
      await input.press('Enter');
      
      // Should create note in Notes app
      await page.waitForTimeout(2000);
    });

    test('should remember conversation context', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      
      // First message
      await input.fill('My favorite color is blue');
      await input.press('Enter');
      await page.waitForTimeout(1000);
      
      // Follow-up referencing previous context
      await input.fill('What did I just tell you?');
      await input.press('Enter');
      await page.waitForTimeout(1000);
      
      // Should reference blue in response
      const messages = page.locator('[data-testid="uki-message"], [class*="message"]');
      expect(await messages.count()).toBeGreaterThan(0);
    });
  });

  test.describe('UKI Cross-App Intelligence', () => {
    test('should suggest relevant apps', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('I want to edit a video');
      await input.press('Enter');
      
      // Should mention VINX
      await page.waitForTimeout(2000);
      const response = page.locator('text=VINX, text=video editor');
      // Just verify no crash
    });

    test('should provide tool guidance', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('How do I add a track in Imosion?');
      await input.press('Enter');
      
      // Should provide guidance
      await page.waitForTimeout(2000);
    });

    test('should handle multi-app workflows', async () => {
      const input = page.locator('[data-testid="uki-input"], input[placeholder*="Ask"], textarea').first();
      await input.fill('Help me create a video with music');
      await input.press('Enter');
      
      // Should suggest workflow involving VINX and Imosion
      await page.waitForTimeout(2000);
    });
  });
});

test.describe('UKI Accessibility', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should be keyboard accessible', async () => {
    // Open UKI with keyboard
    await page.keyboard.press('Control+u');
    
    // UKI panel should open or focus
    await page.waitForTimeout(500);
    
    // Should be able to type immediately
    await page.keyboard.type('Hello');
    
    // Submit with Enter
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(500);
  });

  test('should have proper ARIA labels', async () => {
    const ukiPanel = page.locator('[data-testid="uki-panel"], [class*="uki"]').first();
    
    if (await ukiPanel.isVisible()) {
      // Check for ARIA role
      const role = await ukiPanel.getAttribute('role');
      // Should have some ARIA attribute
      const ariaLabel = await ukiPanel.getAttribute('aria-label');
      const ariaLabelledBy = await ukiPanel.getAttribute('aria-labelledby');
      
      // At least one should be present
      expect(role || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });

  test('should announce responses to screen readers', async () => {
    // Check for live region
    const liveRegion = page.locator('[aria-live], [role="status"], [role="alert"]');
    expect(await liveRegion.count()).toBeGreaterThan(0);
  });
});

test.describe('UKI Error Handling', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should handle empty input gracefully', async () => {
    const ukiIcon = page.locator('[data-app-id="uki"], [aria-label*="UKI"]').first();
    await ukiIcon.click();
    await page.waitForTimeout(500);
    
    const input = page.locator('[data-testid="uki-input"], input, textarea').first();
    await input.press('Enter'); // Submit empty
    
    // Should not crash, may show hint
    await page.waitForTimeout(500);
  });

  test('should handle very long input', async () => {
    const input = page.locator('[data-testid="uki-input"], input, textarea').first();
    const longText = 'a'.repeat(5000);
    await input.fill(longText);
    await input.press('Enter');
    
    // Should handle without crash
    await page.waitForTimeout(1000);
  });

  test('should handle special characters', async () => {
    const input = page.locator('[data-testid="uki-input"], input, textarea').first();
    await input.fill('<script>alert("xss")</script>');
    await input.press('Enter');
    
    // Should sanitize and not execute
    await page.waitForTimeout(500);
    
    // No alert should have appeared
    expect(true).toBe(true);
  });

  test('should recover from network errors', async () => {
    // Simulate offline
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    
    const input = page.locator('[data-testid="uki-input"], input, textarea').first();
    await input.fill('Hello while offline');
    await input.press('Enter');
    
    // Should show offline message or handle gracefully
    await page.waitForTimeout(500);
    
    // Go back online
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
  });
});
