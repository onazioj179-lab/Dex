// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX -- Renderer Health Responder
 * Listens for health pings from the main process and responds
 * with current renderer metrics. Initialized once at renderer startup.
 */

import { getManagedContextCount } from './WebGLContextManager';

let errorCountSinceLastCheck = 0;
let lastFrameTime = 0;
let frameRafId = 0;
let initialized = false;

function measureFrameTime(): void {
  // Measure a single frame on demand, not continuously
  const measure = () => {
    const start = performance.now();
    frameRafId = requestAnimationFrame(() => {
      lastFrameTime = performance.now() - start;
    });
  };
  // Measure once now, then only on health pings
  measure();
  (window as any).__dexMeasureFrame = measure;
}

function countErrors(): void {
  window.addEventListener('error', () => { errorCountSinceLastCheck++; });
  window.addEventListener('unhandledrejection', () => { errorCountSinceLastCheck++; });
}

/**
 * Initialize the renderer health responder.
 * Call once in the renderer entry point.
 */
export function initHealthResponder(): void {
  if (initialized) return;
  initialized = true;

  measureFrameTime();
  countErrors();

  const dex = (window as any).dex;
  // Listen for health pings if the IPC bridge exists
  if (typeof window !== 'undefined') {
    // Use the electron IPC event listener pattern
    const ipcRenderer = (window as any).__dexIpcRenderer;
    if (ipcRenderer?.on) {
      ipcRenderer.on('renderer-health:ping', (_event: unknown, data: { windowId: number }) => {
        const perf = (performance as any);
        const report = {
          windowId: data.windowId,
          heapUsedMB: perf?.memory ? perf.memory.usedJSHeapSize / (1024 * 1024) : 0,
          heapLimitMB: perf?.memory ? perf.memory.jsHeapSizeLimit / (1024 * 1024) : 0,
          heapUtilization: perf?.memory ? perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit : 0,
          lastFrameTimeMs: lastFrameTime,
          errorCountSinceLastCheck,
          webglContextLost: false, // Would need WebGLContextManager integration
          timestamp: Date.now(),
        };
        errorCountSinceLastCheck = 0;
        if (ipcRenderer?.send) {
          ipcRenderer.send('renderer-health:pong', report);
        }
      });

      ipcRenderer.on('renderer-health:gc-request', () => {
        // Attempt to free memory
        if ((window as any).gc) {
          (window as any).gc();
        }
      });
    }
  }
}

/**
 * Cleanup frame measurement on unmount.
 */
export function destroyHealthResponder(): void {
  if (frameRafId) {
    cancelAnimationFrame(frameRafId);
  }
}
