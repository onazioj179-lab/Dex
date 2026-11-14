/**
 * ===========================================================================
 * DEX PLAYWRIGHT E2E CONFIGURATION
 * ===========================================================================
 *
 * Runs the real renderer in Chromium, served by Vite (tests/e2e/web). There is
 * no native bridge in this run; native behaviour is checked in the packaged
 * app. The specs directly under tests/e2e are from the Electron era: they
 * launch an Electron main process that no longer exists, so they are not
 * matched here.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DEX_E2E_PORT ?? 5197);

export default defineConfig({
  testDir: './tests/e2e/web',
  testMatch: '**/*.e2e.ts',

  timeout: 120_000,
  expect: { timeout: 10_000 },

  // One page drives one shell; the specs open many apps, so keep them serial.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e-report', open: 'never' }],
  ],
  outputDir: 'test-results/e2e-artifacts',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
