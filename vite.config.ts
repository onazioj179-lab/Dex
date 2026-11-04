/**
 * DEX -- Vite Build Configuration
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

/**
 * Fail the build when two output chunks statically import each other.
 * A chunk cycle means one side evaluates before the other's bindings are
 * initialized, which in the packaged app is a boot-time TDZ ReferenceError
 * ("Cannot access 'X' before initialization") and a blank window. The dev
 * server serves unbundled ESM, so it never shows up there — this has bitten
 * react-vendor, zustand, axl and notes. Catch it at build time instead.
 */
function noChunkCycles(): Plugin {
  return {
    name: 'dex-no-chunk-cycles',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const graph = new Map<string, string[]>();
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type === 'chunk') graph.set(file, out.imports);
      }
      const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
      const stack: string[] = [];
      const visit = (f: string): string[] | null => {
        state.set(f, 1);
        stack.push(f);
        for (const dep of graph.get(f) ?? []) {
          if (state.get(dep) === 1) return [...stack.slice(stack.indexOf(dep)), dep];
          if (!state.has(dep)) {
            const cycle = visit(dep);
            if (cycle) return cycle;
          }
        }
        stack.pop();
        state.set(f, 2);
        return null;
      };
      for (const f of graph.keys()) {
        const cycle = !state.has(f) && visit(f);
        if (cycle) {
          // Name the modules behind each edge, so the fix is obvious.
          const short = (id: string) => id.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
          const edges = cycle.slice(0, -1).map((from, i) => {
            const to = cycle[i + 1];
            const target = bundle[to];
            const source = bundle[from];
            if (!target || target.type !== 'chunk' || !source || source.type !== 'chunk') return `  ${from} -> ${to}`;
            const inTarget = new Set(Object.keys(target.modules));
            const pairs: string[] = [];
            for (const m of Object.keys(source.modules)) {
              for (const dep of this.getModuleInfo(m)?.importedIds ?? []) {
                if (inTarget.has(dep)) pairs.push(`${short(m)} imports ${short(dep)}`);
              }
            }
            return `  ${from} -> ${to}:\n    ${pairs.slice(0, 6).join('\n    ')}`;
          });
          this.error(
            `Static import cycle between chunks: ${cycle.join(' -> ')}\n${edges.join('\n')}\n` +
              'Pin the shared module into one chunk in manualChunks (see the notes there).',
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), noChunkCycles()],
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
          // Rollup's shared CJS-interop helper (getDefaultExportFromCjs). It is a
          // VIRTUAL module (no node_modules path), so without this rule Rollup
          // absorbs it into whichever app chunk bundles a CJS dep first (maps).
          // react-vendor (zustand's CJS interop needs the helper) then imports it
          // FROM that app chunk -> a react-vendor -> app-chunk cycle, which makes
          // the eager app chunks (axl, maps) evaluate React.memo / hooks BEFORE
          // React is initialized -> instant crash -> blank white screen in the
          // packaged build. Pinning it with react-vendor keeps react-vendor a
          // self-contained leaf that loads first.
          if (id.includes('commonjsHelpers')) return 'react-vendor';
          // Vendor chunks
          // NOTE: react, react-dom AND react-dependent libs (zustand) MUST share
          // ONE chunk. Splitting react-dom from react caused a SECRET_INTERNALS
          // undefined error; splitting zustand into its own chunk caused
          // "Cannot read properties of undefined (reading 'useState')" thrown from
          // zustand-vendor in the PACKAGED (file://) build -- the zustand chunk
          // evaluated before React's exports were initialized, leaving a BLANK
          // white screen. The dev server (unbundled ESM) masked it. Co-locating
          // guarantees React is fully initialized before zustand's hooks run.
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler') ||
            id.endsWith('node_modules/react') ||
            id.includes('node_modules/react-is') ||
            id.includes('node_modules/zustand') ||
            // zustand's runtime dep -- MUST ride with it, else Rollup absorbs the
            // shim into whichever app chunk imports it first (maps), creating a
            // react-vendor -> app-chunk cycle that makes eager app chunks (axl,
            // maps) evaluate React.memo before React is initialized -> blank screen.
            id.includes('node_modules/use-sync-external-store')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/dompurify')) return 'sanitize-vendor';
          if (id.includes('node_modules/d3-force')) return 'd3-vendor';
          // These two runtime deps had no vendor rule and were being inlined into
          // whichever (often eager) chunk imported them first. Split them out so
          // they cache once and stay off the eager critical path.
          if (id.includes('node_modules/@tanstack')) return 'virtual-vendor';
          if (id.includes('node_modules/idb-keyval')) return 'idb-vendor';
          // Shared renderer INFRASTRUCTURE (stores, services, components, hooks,
          // contexts, ui) -> ONE eager chunk. Without this, Rollup scattered a
          // widely-used shared module INTO an app chunk (app-axl etc.), so the entry
          // statically imported that app chunk for the shared symbol -> 11 heavy app
          // chunks (axl 520KB, imosion 429KB, flux, forge, rewind, nexus, dexcode,
          // uki, notes) were eagerly modulepreloaded at startup, adding ~8s to
          // renderer load even though the apps are lazy-imported. Pinning shared
          // infra here keeps the app chunks free of shared code -> genuinely lazy.
          // (One chunk, not several, avoids inter-infra chunk cycles.) Pages and
          // DEXAPPLICATIONS are deliberately NOT matched here so they stay lazy.
          if (/[\\/]renderer[\\/](store|services|components|hooks|contexts|providers|ui|uki|styles)[\\/]/.test(id)
              || /[\\/]renderer[\\/]utils([\\/.]|$)/.test(id)) {
            return 'dex-app-core';
          }
          // NotesDocumentModel is a SHARED data model (the notes store + templates
          // import it, not only the Notes app), so keep it in the shared chunk.
          // Otherwise it lands in app-notes and the noteTemplates -> app-notes ->
          // dex-app-core cycle force-eagers the whole Notes app at startup.
          if (id.includes('DEXAPPLICATIONS/notes/NotesDocumentModel')) return 'dex-app-core';
          // Same story for WordSuggestions: the shared AssistedTextarea (in
          // components/) imports it, so leaving it in app-notes made
          // dex-app-core -> app-notes -> dex-app-core a cycle. The packaged build
          // then threw "Cannot access '<x>' before initialization" from
          // app-notes at boot and rendered a blank window.
          if (id.includes('DEXAPPLICATIONS/notes/WordSuggestions')) return 'dex-app-core';
          // shell/input (appKeyScope, touch contacts, haptics) is imported by
          // nearly every app AND by shared code (WordSuggestions). Left unpinned,
          // Rollup put it in app-axl: dex-app-core -> app-axl -> dex-app-core.
          if (/[\\/]renderer[\\/]shell[\\/]input[\\/]/.test(id)) return 'dex-app-core';
          // The shared NativeWebview imports a constant from the ad-block content
          // script; keep that module shared so app-browser (and the ad-block
          // engine) is not pulled into startup.
          if (id.includes('DEXAPPLICATIONS/browser/adblockContentScript')) return 'dex-app-core';
          // Standalone apps (Calculator, Calendar, Nexus, DexCode, …) are each
          // lazy-imported separately by AppManager, but were all collapsed into one
          // ~370K `app-standalone` chunk — so opening any one downloaded all of them.
          // Give each standalone app its own chunk so only what's opened loads.
          if (id.includes('DEXAPPLICATIONS/standalone/')) {
            const m = id.match(/DEXAPPLICATIONS\/standalone\/([^/.]+)/);
            return m ? `app-standalone-${m[1].toLowerCase()}` : 'app-standalone';
          }
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
    host: '0.0.0.0',
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
    // Drop noisy console levels in production builds; KEEP `console.warn`
    // and `console.error` so genuine production failures still surface in
    // the renderer dev tools / electron-log forwarder.
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure: process.env.NODE_ENV === 'production'
      ? ['console.log', 'console.debug', 'console.info', 'console.trace']
      : [],
    // Use modern syntax target
    target: 'es2022',
  },
  // Item 142: CSS processing.
  // NOTE: the lightningcss transformer was REMOVED. Its bundled browser data
  // conservatively decided Chromium needs the `-webkit-` prefix for
  // `backdrop-filter`, so it emitted ONLY `-webkit-backdrop-filter` and DROPPED
  // the standard property. But the Tauri WebView2 / preview Chromium engine
  // ignores the `-webkit-` alias and honors ONLY the unprefixed form (verified),
  // so this silently killed EVERY glass surface app-wide regardless of the CSS.
  // Vite's default pipeline (esbuild) leaves `backdrop-filter` intact, so real
  // liquid glass renders. `cssMinify: 'esbuild'` (above) still minifies builds.
  css: {
    devSourcemap: false,
  },
});
