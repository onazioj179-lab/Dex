/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX VITEST CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Modern test framework configuration for:
 * - Unit tests (main process & renderer)
 * - Integration tests
 * - Coverage reporting
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Global test settings
    globals: true,
    environment: 'jsdom',
    
    // Setup files
    setupFiles: ['./tests/setup.ts'],
    
    // Include patterns
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
    ],
    
    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'release',
      'tests/e2e/**', // E2E tests use Playwright
      'tests/e2e-integration.test.ts', // Legacy test file
      'tests/component.test.ts', // Legacy test file  
      'tests/ui-integration.test.ts', // Legacy test file
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/main/**/*.ts',
        'src/renderer/**/*.tsx',
        'src/renderer/**/*.ts',
        'src/shared/**/*.ts',
      ],
      exclude: [
        'src/main/main.ts', // Entry point
        'src/main/preload.ts', // Preload
        '**/*.d.ts',
        '**/types.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
    
    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Reporter
    reporters: ['verbose'],
    
    // Threading: use default worker configuration (Vitest 4 removed poolOptions)
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
