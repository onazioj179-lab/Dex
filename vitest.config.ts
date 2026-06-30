/**
 * ===========================================================================
 * DEX VITEST CONFIGURATION
 * ===========================================================================
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

      // ---------------------------------------------------------------------
      // Legacy Electron main-process tests (pre-Tauri).
      //
      // The Tauri migration (commit df98c9c) removed the entire `src/main/`
      // Electron main process; that logic now lives in the native Rust/Tauri
      // backend. The tests below still import from the deleted `src/main/...`
      // tree, so they fail to resolve their modules and break the whole CI
      // unit-test job. They are excluded here (not deleted) so they can be
      // ported to the Tauri backend later. Remove an entry once its subject
      // has a real home again.
      // ---------------------------------------------------------------------
      'tests/platform.test.ts',
      'tests/unit/auth-controller.test.ts',
      'tests/unit/auth-hardening.test.ts',
      'tests/unit/automation-controller.test.ts',
      'tests/unit/codesign-gate.test.ts',
      'tests/unit/codesign.test.ts',
      'tests/unit/crash-recovery.test.ts',
      'tests/unit/creative-runner.test.ts',
      'tests/unit/data-encryption.test.ts',
      'tests/unit/data-store.test.ts',
      'tests/unit/database-manager.test.ts',
      'tests/unit/defense-orchestrator.test.ts',
      'tests/unit/ipc-crypto.test.ts',
      'tests/unit/ipc-interceptor.test.ts',
      'tests/unit/ipc-rate-limiter.test.ts',
      'tests/unit/path-validator.test.ts',
      'tests/unit/performance-reservation.test.ts',
      'tests/unit/plugin-publisher.test.ts',
      'tests/unit/secure-ipc-router.test.ts',
      'tests/unit/secure-key-manager.test.ts',
      'tests/unit/security-controller.test.ts',
      'tests/unit/security-core.test.ts',
      'tests/unit/self-healing-manager.test.ts',
      'tests/unit/service-host.test.ts',
      'tests/unit/session-hardening.test.ts',
      'tests/unit/softero-signatures.test.ts',
      'tests/unit/startupTimeline.test.ts',
      'tests/unit/storage-manager.test.ts',
      'tests/unit/trust-store.test.ts',
      'tests/unit/uki-blueprint.test.ts',
      'tests/unit/uki-creative-operator.test.ts',
      'tests/unit/uki-rewind-memory.test.ts',
      'tests/unit/update-aliases.test.ts',
      'tests/unit/vault-controller.test.ts',
      'tests/unit/vault-hardening.test.ts',
      'tests/unit/wave0-compute.test.ts',
      'tests/unit/wave0-onnx.test.ts',
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
