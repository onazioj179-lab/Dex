/**
 * ===========================================================================
 * DEX PLAYWRIGHT E2E CONFIGURATION
 * ===========================================================================
 *
 * Runs the real renderer in Chromium, served by Vite (tests/e2e/web). There is
 * no native bridge in this run. DEX_SPATIAL_EXE runs the spatial suite against
 * packaged WebView2 with an isolated test profile. The specs directly under
 * tests/e2e still use the retired Electron process.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DEX_E2E_PORT ?? 5197);
const packagedSpatial = Boolean(process.env.DEX_SPATIAL_EXE);

export default defineConfig({
  testDir: './tests/e2e/web',
  testMatch: packagedSpatial ? '**/spatial-workspace.e2e.ts' : '**/*.e2e.ts',

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

  webServer: packagedSpatial ? undefined : {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },

  projects: [{
    name: packagedSpatial ? 'webview2' : 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  }],
});
