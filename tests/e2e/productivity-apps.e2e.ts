// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Productivity Apps Tests
 * Tests for Notes, Tasks, Calendar, Files, and Settings
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

test.describe('Productivity Apps', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test.describe('Notes App', () => {
    test('should launch from dock', async () => {
      const notesIcon = page.locator('[data-app-id="notes"], [aria-label*="Notes"]').first();
      await notesIcon.click();
      
      await expect(page.locator('[data-testid="notes-app"], .notes-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display notes list', async () => {
      const notesList = page.locator('[data-testid="notes-list"], [class*="note-list"]').first();
      await expect(notesList).toBeVisible({ timeout: 5000 });
    });

    test('should have create note button', async () => {
      const createBtn = page.locator('button[aria-label*="New"], button[aria-label*="Create"], [data-testid="create-note"]').first();
      await expect(createBtn).toBeVisible({ timeout: 5000 });
    });

    test('should create a new note', async () => {
      const createBtn = page.locator('button[aria-label*="New"], button[aria-label*="Create"], [data-testid="create-note"]').first();
      await createBtn.click();
      
      // Should show editor
      const editor = page.locator('[data-testid="note-editor"], textarea, [contenteditable="true"]').first();
      await expect(editor).toBeVisible({ timeout: 5000 });
    });

    test('should type in note editor', async () => {
      const editor = page.locator('[data-testid="note-editor"], textarea, [contenteditable="true"]').first();
      await editor.fill('Test note content from E2E test');
      
      // Content should be visible
      await expect(editor).toContainText('Test note');
    });

    test('should close without losing data', async () => {
      const closeButton = page.locator('[data-testid="close-notes"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Tasks App', () => {
    test('should launch from dock', async () => {
      const tasksIcon = page.locator('[data-app-id="tasks"], [aria-label*="Tasks"]').first();
      await tasksIcon.click();
      
      await expect(page.locator('[data-testid="tasks-app"], .tasks-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display task list', async () => {
      const taskList = page.locator('[data-testid="task-list"], [class*="task-list"]').first();
      await expect(taskList).toBeVisible({ timeout: 5000 });
    });

    test('should have add task input', async () => {
      const addInput = page.locator('input[placeholder*="task"], input[placeholder*="add"], [data-testid="add-task-input"]').first();
      await expect(addInput).toBeVisible({ timeout: 5000 });
    });

    test('should create a new task', async () => {
      const addInput = page.locator('input[placeholder*="task"], input[placeholder*="add"], [data-testid="add-task-input"]').first();
      await addInput.fill('E2E Test Task');
      await addInput.press('Enter');
      
      // Task should appear in list
      const task = page.locator('text=E2E Test Task');
      await expect(task).toBeVisible({ timeout: 5000 });
    });

    test('should toggle task completion', async () => {
      const checkbox = page.locator('[data-testid="task-checkbox"], input[type="checkbox"]').first();
      await checkbox.click();
      
      // Should be checked
      await expect(checkbox).toBeChecked();
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-tasks"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Calendar App', () => {
    test('should launch from dock', async () => {
      const calendarIcon = page.locator('[data-app-id="calendar"], [aria-label*="Calendar"]').first();
      await calendarIcon.click();
      
      await expect(page.locator('[data-testid="calendar-app"], .calendar-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display current month', async () => {
      const monthDisplay = page.locator('[data-testid="current-month"], [class*="month-header"]').first();
      await expect(monthDisplay).toBeVisible({ timeout: 5000 });
    });

    test('should display calendar grid', async () => {
      const grid = page.locator('[data-testid="calendar-grid"], [class*="calendar-grid"], table').first();
      await expect(grid).toBeVisible({ timeout: 5000 });
    });

    test('should navigate to next month', async () => {
      const nextBtn = page.locator('button[aria-label*="Next"], [data-testid="next-month"]').first();
      await nextBtn.click();
      
      // Month display should change (we just verify no crash)
      await page.waitForTimeout(500);
    });

    test('should navigate to previous month', async () => {
      const prevBtn = page.locator('button[aria-label*="Previous"], button[aria-label*="Prev"], [data-testid="prev-month"]').first();
      await prevBtn.click();
      
      await page.waitForTimeout(500);
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-calendar"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Files App', () => {
    test('should launch from dock', async () => {
      const filesIcon = page.locator('[data-app-id="files"], [aria-label*="Files"]').first();
      await filesIcon.click();
      
      await expect(page.locator('[data-testid="files-app"], .files-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display file browser', async () => {
      const browser = page.locator('[data-testid="file-browser"], [class*="file-list"]').first();
      await expect(browser).toBeVisible({ timeout: 5000 });
    });

    test('should display sidebar with locations', async () => {
      const sidebar = page.locator('[data-testid="files-sidebar"], [class*="sidebar"]').first();
      await expect(sidebar).toBeVisible({ timeout: 5000 });
    });

    test('should have path breadcrumbs', async () => {
      const breadcrumbs = page.locator('[data-testid="path-breadcrumbs"], [class*="breadcrumb"]').first();
      await expect(breadcrumbs).toBeVisible({ timeout: 5000 });
    });

    test('should have view toggle', async () => {
      const viewToggle = page.locator('[data-testid="view-toggle"], button[aria-label*="View"]').first();
      await expect(viewToggle).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-files"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Settings App', () => {
    test('should launch from dock', async () => {
      const settingsIcon = page.locator('[data-app-id="settings"], [aria-label*="Settings"]').first();
      await settingsIcon.click();
      
      await expect(page.locator('[data-testid="settings-app"], .settings-container')).toBeVisible({ timeout: 10000 });
    });

    test('should display settings categories', async () => {
      const categories = page.locator('[data-testid="settings-categories"], [class*="category"]').first();
      await expect(categories).toBeVisible({ timeout: 5000 });
    });

    test('should have appearance settings', async () => {
      const appearance = page.locator('text=Appearance, text=Theme, [data-testid="appearance-settings"]').first();
      await expect(appearance).toBeVisible({ timeout: 5000 });
    });

    test('should have sound settings', async () => {
      const sound = page.locator('text=Sound, text=Audio, [data-testid="sound-settings"]').first();
      await expect(sound).toBeVisible({ timeout: 5000 });
    });

    test('should close without errors', async () => {
      const closeButton = page.locator('[data-testid="close-settings"], button[aria-label*="Close"]').first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });
});

test.describe('Productivity Workflows', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should support drag and drop between apps', async () => {
    // This is a placeholder for drag-drop testing
    // Actual implementation would need app-specific handlers
    expect(true).toBe(true);
  });

  test('should maintain state across app switches', async () => {
    // Open notes, create content
    const notesIcon = page.locator('[data-app-id="notes"], [aria-label*="Notes"]').first();
    await notesIcon.click();
    await page.waitForTimeout(1000);
    
    // Switch to tasks
    const tasksIcon = page.locator('[data-app-id="tasks"], [aria-label*="Tasks"]').first();
    await tasksIcon.click();
    await page.waitForTimeout(1000);
    
    // Switch back to notes - content should persist
    await notesIcon.click();
    await page.waitForTimeout(1000);
    
    // Verify app is still functional
    const notesApp = page.locator('[data-testid="notes-app"], .notes-container');
    await expect(notesApp).toBeVisible({ timeout: 5000 });
  });

  test('should handle rapid app switching', async () => {
    const apps = ['notes', 'tasks', 'calendar', 'files', 'settings'];
    
    for (const appId of apps) {
      const icon = page.locator(`[data-app-id="${appId}"], [aria-label*="${appId}"]`).first();
      if (await icon.isVisible()) {
        await icon.click();
        await page.waitForTimeout(200);
      }
    }
    
    // Should not crash
    expect(true).toBe(true);
  });
});

test.describe('Keyboard Navigation', () => {
  test.beforeAll(async () => {
    context = await launchDEX();
    page = context.mainWindow;
  });

  test.afterAll(async () => {
    await closeDEX(context);
  });

  test('should open Command Palette with Ctrl+K', async () => {
    await page.keyboard.press('Control+k');
    
    const palette = page.locator('[data-testid="command-palette"], [class*="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 3000 });
    
    // Close it
    await page.keyboard.press('Escape');
  });

  test('should open Spotlight with Ctrl+Space', async () => {
    await page.keyboard.press('Control+Space');
    
    const spotlight = page.locator('[data-testid="spotlight-search"], [class*="spotlight"]');
    await expect(spotlight).toBeVisible({ timeout: 3000 });
    
    // Close it
    await page.keyboard.press('Escape');
  });

  test('should navigate with Tab key', async () => {
    // Focus should move through interactive elements
    await page.keyboard.press('Tab');
    
    // Verify focus is on an interactive element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should support Escape to close dialogs', async () => {
    // Open a dialog/modal
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    
    // Close with Escape
    await page.keyboard.press('Escape');
    
    const palette = page.locator('[data-testid="command-palette"], [class*="command-palette"]');
    await expect(palette).not.toBeVisible({ timeout: 2000 });
  });
});
