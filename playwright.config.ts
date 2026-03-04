/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX PLAYWRIGHT E2E CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * End-to-end testing for Electron application
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Test file patterns
  testMatch: '**/*.e2e.ts',
  
  // Timeout per test
  timeout: 60000,
  
  // Timeout for expect assertions
  expect: {
    timeout: 10000,
  },
  
  // Run tests in parallel
  fullyParallel: false, // Electron tests should run sequentially
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Limit workers for Electron
  workers: 1,
  
  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e-report' }],
  ],
  
  // Output folder for test artifacts
  outputDir: 'test-results/e2e-artifacts',
  
  // Global setup/teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  
  // Use custom project for Electron
  projects: [
    {
      name: 'electron',
      use: {
        // Custom Electron launch options handled in tests
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
      },
    },
  ],
});
