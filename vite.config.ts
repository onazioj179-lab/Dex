/**
 * DEX -- Vite Build Configuration
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  base: './',
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: 'esbuild',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 500,
    // Item 131: inline small assets to reduce HTTP round-trips
    assetsInlineLimit: 8192,
    // Item 132: deterministic hashes for long-term caching
    rollupOptions: {
      output: {
        // Item 133: granular manual chunks for efficient caching
        manualChunks: (id: string) => {
          // Vendor chunks
          // NOTE: react and react-dom MUST share a chunk. Splitting them causes
          // "Cannot read properties of undefined (reading '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')"
          // when react-dom evaluates before react in production index.html script order.
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler') ||
            id.endsWith('node_modules/react') ||
            id.includes('node_modules/react-is')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/zustand')) return 'zustand-vendor';
          if (id.includes('node_modules/lucide-react')) return 'icons-vendor';
          if (id.includes('node_modules/dompurify')) return 'sanitize-vendor';
          if (id.includes('node_modules/d3-force')) return 'd3-vendor';
          // DEX sub-apps into their own chunks (lazy-loadable)
          if (id.includes('DEXAPPLICATIONS/')) {
            // NOTE: axl was previously split into axl-core (engine+stores) and
            // axl-ui (components+utils). That created a circular dependency
            // between the two chunks, producing "Cannot access 'S' before
            // initialization" in production. Keep all axl in one chunk.
            const match = id.match(/DEXAPPLICATIONS\/([^/]+)/);
            return match ? `app-${match[1].toLowerCase()}` : 'dex-apps';
          }
          // Shared utilities together
          if (id.includes('src/shared/')) return 'dex-shared';
        },
        // Item 134: hashed filenames for cache-busting
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Item 135: use Rollup defaults — aggressive tree-shake options
      // (moduleSideEffects:false etc.) were stripping React & all app code,
      // producing an empty 711-byte bundle and a black screen in production.
      treeshake: true,
    },
    // Item 136: report compressed size for build analysis
    reportCompressedSize: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  // Item 137: dependency pre-bundling for faster dev starts
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand'],
    // Item 139: exclude native modules from bundling
    exclude: ['dex-native'],
  },
  server: {
    port: 5173,
    // Item 138: strict port to avoid silent port conflicts
    strictPort: true,
    // Item 140: warm up frequently used files
    warmup: {
      clientFiles: ['./src/renderer/App.tsx', './src/renderer/components/AppManager.tsx'],
    },
  },
  // Item 141: esbuild optimizations for faster builds
  esbuild: {
    // Drop console.log in production builds
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Use modern syntax target
    target: 'es2022',
    // Pure annotations help tree-shaking
    pure: ['console.log', 'console.debug'],
  },
  // Item 142: CSS processing optimizations
  css: {
    devSourcemap: false,
    transformer: 'lightningcss',
  },
});
