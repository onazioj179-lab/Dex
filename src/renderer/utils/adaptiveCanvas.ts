// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { sharedTick } from '../services/SharedTick';

/**
 * ===========================================================================
 * DEX — Adaptive Canvas & GPU Utilities
 * ===========================================================================
 * Automatically scales canvas resolution and frame rate based on the
 * detected performance tier. Heavy apps (Forge, Prism, VINX, Flux)
 * should call these helpers instead of using raw canvas dimensions.
 *
 * @example
 *   const { width, height, dpr } = getAdaptiveCanvasSize(canvas, container);
 *   canvas.width = width;
 *   canvas.height = height;
 *   ctx.scale(dpr, dpr);
 *
 * @example
 *   // Frame-budget-aware RAF loop
 *   const loop = createAdaptiveRAF((dt) => { draw(); }, { targetFps: 60 });
 *   loop.start();
 *   // later: loop.stop();
 */

// ---------------------------------------------------------------------------
// Performance tier helpers
// ---------------------------------------------------------------------------

export type PerfTier = 'low' | 'mid' | 'high' | 'ultra';

export function getPerfTier(): PerfTier {
  return (document.documentElement.getAttribute('data-perf-tier') as PerfTier) || 'high';
}

/** Device pixel ratio capped by tier to save GPU fill rate */
export function getAdaptiveDPR(): number {
  const raw = window.devicePixelRatio || 1;
  switch (getPerfTier()) {
    case 'low':       return 1;
    case 'mid':       return Math.min(raw, 1.5);
    case 'high':      return Math.min(raw, 2);
    case 'ultra':     return raw;
    default:          return Math.min(raw, 2);
  }
}

/** Max target FPS for animation loops */
export function getTargetFPS(): number {
  switch (getPerfTier()) {
    case 'low':       return 20;
    case 'mid':       return 30;
    case 'high':      return 60;
    case 'ultra':     return 120;
    default:          return 60;
  }
}

// ---------------------------------------------------------------------------
// Adaptive Canvas Sizing
// ---------------------------------------------------------------------------

interface AdaptiveCanvasSize {
  width: number;   // Canvas backing pixel width
  height: number;  // Canvas backing pixel height
  cssWidth: number; // CSS display width
  cssHeight: number;
  dpr: number;
}

/**
 * Calculate canvas backing dimensions that respect the perf tier.
 * On low-end: renders at lower resolution then CSS-upscales.
 */
export function getAdaptiveCanvasSize(
  cssWidth: number,
  cssHeight: number,
): AdaptiveCanvasSize {
  const dpr = getAdaptiveDPR();
  return {
    width: Math.round(cssWidth * dpr),
    height: Math.round(cssHeight * dpr),
    cssWidth,
    cssHeight,
    dpr,
  };
}

/**
 * Apply adaptive sizing to a canvas element in-place.
 * Returns the 2D context (or null) with the correct scale applied.
 */
export function applyAdaptiveCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D | null {
  const { width, height, dpr } = getAdaptiveCanvasSize(cssWidth, cssHeight);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
  return ctx;
}

// ---------------------------------------------------------------------------
// Adaptive RAF Loop
// ---------------------------------------------------------------------------

interface AdaptiveRAFOptions {
  targetFps?: number; // Override; if omitted uses tier-based default
}

export interface AdaptiveRAFHandle {
  start: () => void;
  stop: () => void;
  running: boolean;
}

/**
 * Creates a frame-budget-aware requestAnimationFrame loop.
 * Automatically drops frames to stay within the tier's FPS budget.
 * The callback receives delta time in milliseconds.
 */
export function createAdaptiveRAF(
  callback: (dt: number) => void,
  options: AdaptiveRAFOptions = {},
): AdaptiveRAFHandle {
  const fps = options.targetFps ?? getTargetFPS();
  const frameBudget = 1000 / fps;
  let lastTime = 0;
  let rafId = 0;
  let running = false;

  function frame(now: number) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const dt = now - lastTime;
    if (dt < frameBudget * 0.9) return; // skip frame to stay on budget
    lastTime = now;
    callback(dt);
  }

  return {
    get running() { return running; },
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Memory Pressure Detection
// ---------------------------------------------------------------------------

/**
 * Set the memory-pressure data attribute on <html>, which triggers
 * CSS rules that hide heavy decorative elements, hide inactive
 * canvas/video, and degrade image quality.
 */
export function setMemoryPressure(level: 'none' | 'moderate' | 'high'): void {
  if (level === 'none') {
    document.documentElement.removeAttribute('data-memory-pressure');
  } else {
    document.documentElement.setAttribute('data-memory-pressure', level);
  }
}

/**
 * One-shot memory check. Uses the experimental `performance.measureUserAgentSpecificMemory()`
 * if available, otherwise estimates from `performance.memory` (Chrome-only).
 */
export async function checkMemoryPressure(): Promise<'none' | 'moderate' | 'high'> {
  try {
    // Chromium: full measurement
    if (typeof (performance as any).measureUserAgentSpecificMemory === 'function') {
      const info = await (performance as any).measureUserAgentSpecificMemory();
      const mb = info.bytes / (1024 * 1024);
      if (mb > 600) return 'high';
      if (mb > 350) return 'moderate';
      return 'none';
    }
    // Legacy Chromium API
    const mem = (performance as any).memory;
    if (mem) {
      const usedMB = mem.usedJSHeapSize / (1024 * 1024);
      if (usedMB > 400) return 'high';
      if (usedMB > 200) return 'moderate';
    }
  } catch { /* not supported */ }
  return 'none';
}

/**
 * Start a periodic memory pressure monitor that auto-sets the CSS attribute.
 * Returns a cleanup function.
 */
export function startMemoryPressureMonitor(intervalMs = 60_000): () => void {
  const check = async () => {
    const pressure = await checkMemoryPressure();
    setMemoryPressure(pressure);
  };

  // Initial check after a short delay
  const startup = setTimeout(() => {
    check();
    sharedTick.subscribe('adaptive-canvas-mem', check, intervalMs);
  }, 5000);

  return () => {
    clearTimeout(startup);
    sharedTick.unsubscribe('adaptive-canvas-mem');
    setMemoryPressure('none');
  };
}
