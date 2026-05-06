// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// HiDPI Canvas Utility - shared canvas initialization for all DEX inner apps
// Every canvas in DEX must use this utility for correct DPI scaling

interface HiDPICanvasOptions {
  logicalWidth: number;
  logicalHeight: number;
  canvas?: HTMLCanvasElement;
  contextType?: '2d' | 'webgl' | 'webgl2';
  contextAttributes?: CanvasRenderingContext2DSettings | WebGLContextAttributes;
  pixelArt?: boolean;
}

interface HiDPICanvasResult {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext;
  logicalWidth: number;
  logicalHeight: number;
  physicalWidth: number;
  physicalHeight: number;
  dpr: number;
  resize: (logicalWidth: number, logicalHeight: number) => void;
  destroy: () => void;
}

let globalDPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
let dprChangeListeners: Set<(dpr: number) => void> = new Set();
let dprMediaQuery: MediaQueryList | null = null;
let dprWatcherSetup = false;

function setupDPRWatcher(): void {
  if (dprWatcherSetup || typeof window === 'undefined') return;
  dprWatcherSetup = true;

  const checkDPR = () => {
    const newDPR = window.devicePixelRatio || 1;
    if (Math.abs(newDPR - globalDPR) > 0.001) {
      globalDPR = newDPR;
      for (const listener of dprChangeListeners) {
        try { listener(newDPR); } catch (_e) { /* ignore */ }
      }
    }
    if (dprMediaQuery) {
      dprMediaQuery.removeEventListener('change', checkDPR);
    }
    dprMediaQuery = window.matchMedia(`(resolution: ${newDPR}dppx)`);
    dprMediaQuery.addEventListener('change', checkDPR);
  };

  checkDPR();
}

export function onDPRChange(callback: (dpr: number) => void): () => void {
  setupDPRWatcher();
  dprChangeListeners.add(callback);
  return () => { dprChangeListeners.delete(callback); };
}

export function getCurrentDPR(): number {
  if (typeof window !== 'undefined') {
    return window.devicePixelRatio || 1;
  }
  return 1;
}

export function initHiDPICanvas(options: HiDPICanvasOptions): HiDPICanvasResult {
  setupDPRWatcher();

  const {
    logicalWidth,
    logicalHeight,
    contextType = '2d',
    contextAttributes,
    pixelArt = false
  } = options;

  const canvas = options.canvas || document.createElement('canvas');
  const dpr = getCurrentDPR();

  const physicalWidth = Math.round(logicalWidth * dpr);
  const physicalHeight = Math.round(logicalHeight * dpr);

  canvas.width = physicalWidth;
  canvas.height = physicalHeight;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  if (pixelArt) {
    canvas.style.imageRendering = 'crisp-edges';
    (canvas.style as any).imageRendering = 'pixelated';
  } else {
    canvas.style.imageRendering = 'auto';
  }

  let context: CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext;

  if (contextType === '2d') {
    const ctx2d = canvas.getContext('2d', contextAttributes as CanvasRenderingContext2DSettings);
    if (!ctx2d) throw new Error('Failed to get 2D canvas context');
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    context = ctx2d;
  } else if (contextType === 'webgl') {
    const gl = canvas.getContext('webgl', contextAttributes as WebGLContextAttributes);
    if (!gl) throw new Error('Failed to get WebGL context');
    gl.viewport(0, 0, physicalWidth, physicalHeight);
    context = gl;
  } else {
    const gl2 = canvas.getContext('webgl2', contextAttributes as WebGLContextAttributes);
    if (!gl2) throw new Error('Failed to get WebGL2 context');
    gl2.viewport(0, 0, physicalWidth, physicalHeight);
    context = gl2;
  }

  let currentLogicalWidth = logicalWidth;
  let currentLogicalHeight = logicalHeight;
  let currentDPR = dpr;
  let destroyed = false;

  const applyDimensions = (lw: number, lh: number, ratio: number) => {
    if (destroyed) return;
    const pw = Math.round(lw * ratio);
    const ph = Math.round(lh * ratio);

    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = `${lw}px`;
    canvas.style.height = `${lh}px`;

    if (contextType === '2d') {
      (context as CanvasRenderingContext2D).setTransform(ratio, 0, 0, ratio, 0, 0);
    } else {
      const gl = context as WebGLRenderingContext;
      gl.viewport(0, 0, pw, ph);
    }

    currentLogicalWidth = lw;
    currentLogicalHeight = lh;
    currentDPR = ratio;

    result.logicalWidth = lw;
    result.logicalHeight = lh;
    result.physicalWidth = pw;
    result.physicalHeight = ph;
    result.dpr = ratio;
  };

  const onDprChanged = (newDpr: number) => {
    if (destroyed) return;
    applyDimensions(currentLogicalWidth, currentLogicalHeight, newDpr);
  };

  const unsubDPR = onDPRChange(onDprChanged);

  const resize = (lw: number, lh: number) => {
    applyDimensions(lw, lh, getCurrentDPR());
  };

  const destroy = () => {
    destroyed = true;
    unsubDPR();
  };

  const result: HiDPICanvasResult = {
    canvas,
    context,
    logicalWidth,
    logicalHeight,
    physicalWidth,
    physicalHeight,
    dpr,
    resize,
    destroy
  };

  return result;
}

export function initOffscreenHiDPICanvas(
  logicalWidth: number,
  logicalHeight: number,
  dpr: number
): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D; physicalWidth: number; physicalHeight: number } {
  const physicalWidth = Math.round(logicalWidth * dpr);
  const physicalHeight = Math.round(logicalHeight * dpr);
  const canvas = new OffscreenCanvas(physicalWidth, physicalHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get OffscreenCanvas 2D context');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, context, physicalWidth, physicalHeight };
}

export function regenerateThumbnail(
  sourceImage: HTMLImageElement | ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  dpr?: number
): ImageData {
  const ratio = dpr || getCurrentDPR();
  const pw = Math.round(targetWidth * ratio);
  const ph = Math.round(targetHeight * ratio);
  const offscreen = new OffscreenCanvas(pw, ph);
  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Failed to get thumbnail canvas context');
  ctx.drawImage(sourceImage, 0, 0, pw, ph);
  return ctx.getImageData(0, 0, pw, ph);
}

export function getImageRenderingStyle(isPixelArt: boolean): string {
  return isPixelArt ? 'crisp-edges' : 'auto';
}

export function getSystemFontStack(): string {
  return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
}

export function getMonospaceFontStack(): string {
  return '"JetBrains Mono Variable", "Fira Code Variable", "Cascadia Code", "SF Mono", "Consolas", "Liberation Mono", "Menlo", monospace';
}

export function getFontSmoothingCSS(): Record<string, string> {
  const _p = typeof navigator !== 'undefined' ? ((navigator as any).userAgentData?.platform || navigator.platform || '') : '';
  const isMac = /Mac|macOS/i.test(_p);
  if (isMac) {
    return {
      '-webkit-font-smoothing': 'antialiased',
      '-moz-osx-font-smoothing': 'grayscale'
    };
  }
  return {
    '-webkit-font-smoothing': 'auto',
    '-moz-osx-font-smoothing': 'auto'
  };
}

export const HiDPICanvas = {
  init: initHiDPICanvas,
  initOffscreen: initOffscreenHiDPICanvas,
  onDPRChange,
  getCurrentDPR,
  regenerateThumbnail,
  getImageRenderingStyle,
  getSystemFontStack,
  getMonospaceFontStack,
  getFontSmoothingCSS
};

export default HiDPICanvas;
