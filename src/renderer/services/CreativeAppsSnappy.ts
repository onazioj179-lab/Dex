// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Creative Apps Snappy UX
// Phase E: Creative Apps Snappiness (Items 201-300)
// App-specific optimizations for AXL, PRISM, VINX, IMOSION, FLUX
// =============================================================================

import { appPrefetch, saveScrollPosition, restoreScrollPosition } from '../utils/prefetch';
import { progressiveCache, loadWithSWR, loadImageProgressively } from '../utils/progressive-loader';
import { workerPool } from './WorkerPool';
import { inputPriority, createVirtualScroll } from './InputPriority';
import { SPRING_PRESETS, springTransform } from '../utils/spring-animation';
import { Z_HELP_OVERLAY_BASE } from '../../shared/zIndex';

// ---------------------------------------------------------------------------
// 201-210. Common Creative App State Caching
// ---------------------------------------------------------------------------

interface CreativeAppState {
  toolState: Record<string, unknown>;
  panelLayout: Record<string, unknown>;
  viewportState: Record<string, unknown>;
  recentFiles: string[];
  lastModified: number;
}

const appStateCache = new Map<string, CreativeAppState>();

/**
 * Cache creative app state for instant restore
 */
export function cacheCreativeAppState(
  appId: string,
  state: Partial<CreativeAppState>
): void {
  const existing = appStateCache.get(appId) || {
    toolState: {},
    panelLayout: {},
    viewportState: {},
    recentFiles: [],
    lastModified: Date.now(),
  };

  appStateCache.set(appId, {
    ...existing,
    ...state,
    lastModified: Date.now(),
  });

  // Also persist to localStorage for cross-session
  try {
    localStorage.setItem(
      `dex-creative-${appId}`,
      JSON.stringify(appStateCache.get(appId))
    );
  } catch {
    // Storage quota exceeded - clear old data
  }
}

/**
 * Restore cached app state
 */
export function restoreCreativeAppState(appId: string): CreativeAppState | null {
  // Check memory cache first (fastest)
  if (appStateCache.has(appId)) {
    return appStateCache.get(appId)!;
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(`dex-creative-${appId}`);
    if (stored) {
      const state = JSON.parse(stored) as CreativeAppState;
      appStateCache.set(appId, state);
      return state;
    }
  } catch {
    // Storage unavailable
  }

  return null;
}

// ---------------------------------------------------------------------------
// 211-220. Canvas Snappiness
// ---------------------------------------------------------------------------

/**
 * Create an optimized canvas for creative apps
 * Uses offscreen canvas and double buffering
 */
export function createSnappyCanvas(
  container: HTMLElement,
  options: {
    width: number;
    height: number;
    dpr?: number;
    willReadFrequently?: boolean;
  }
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  offscreen: OffscreenCanvas | null;
  offscreenCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
} {
  const { width, height, dpr = window.devicePixelRatio || 1, willReadFrequently = false } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.imageRendering = 'pixelated';

  const ctx = canvas.getContext('2d', {
    willReadFrequently,
    alpha: true,
    desynchronized: true, // Reduces input latency
  })!;

  ctx.scale(dpr, dpr);

  // Create offscreen canvas for double buffering (if supported)
  let offscreen: OffscreenCanvas | null = null;
  let offscreenCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      offscreen = new OffscreenCanvas(width * dpr, height * dpr);
      offscreenCtx = offscreen.getContext('2d', {
        willReadFrequently,
      }) as OffscreenCanvasRenderingContext2D;
      offscreenCtx?.scale(dpr, dpr);
    } catch {
      // Offscreen canvas not supported
    }
  }

  container.appendChild(canvas);

  return { canvas, ctx, offscreen, offscreenCtx };
}

/**
 * Efficient canvas redraw scheduler
 * Prevents multiple redraws per frame
 */
export function createCanvasScheduler(
  draw: () => void
): { requestDraw: () => void; cancelDraw: () => void } {
  let scheduled = false;
  let frameId: number | null = null;

  const requestDraw = () => {
    if (scheduled) return;
    scheduled = true;
    frameId = requestAnimationFrame(() => {
      scheduled = false;
      draw();
    });
  };

  const cancelDraw = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    scheduled = false;
  };

  return { requestDraw, cancelDraw };
}

// ---------------------------------------------------------------------------
// 221-230. AXL 3D CAD Snappiness
// ---------------------------------------------------------------------------

/**
 * Optimize AXL viewport interactions
 */
export function setupAxlSnappiness(): {
  onToolSelect: (tool: string) => void;
  onViewRotate: (delta: { x: number; y: number }) => void;
  onPan: (delta: { x: number; y: number }) => void;
  onZoom: (delta: number) => void;
  cleanup: () => void;
} {
  let currentTool = 'select';
  let viewTransform = { rotX: 0, rotY: 0, panX: 0, panY: 0, zoom: 1 };
  let rafId: number | null = null;

  // Instant tool feedback
  const onToolSelect = (tool: string) => {
    currentTool = tool;
    // Pre-load tool cursors
    document.body.style.cursor = getToolCursor(tool);
  };

  // Smooth viewport rotation (60fps)
  const onViewRotate = (delta: { x: number; y: number }) => {
    viewTransform.rotX += delta.x;
    viewTransform.rotY += delta.y;
    scheduleRender();
  };

  // Smooth panning
  const onPan = (delta: { x: number; y: number }) => {
    viewTransform.panX += delta.x;
    viewTransform.panY += delta.y;
    scheduleRender();
  };

  // Smooth zoom
  const onZoom = (delta: number) => {
    viewTransform.zoom = Math.max(0.1, Math.min(10, viewTransform.zoom * (1 + delta)));
    scheduleRender();
  };

  const scheduleRender = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      // Actual render will be handled by AXL's render loop
      document.dispatchEvent(new CustomEvent('axl-viewport-update', {
        detail: viewTransform,
      }));
    });
  };

  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
  };

  return { onToolSelect, onViewRotate, onPan, onZoom, cleanup };
}

function getToolCursor(tool: string): string {
  const cursors: Record<string, string> = {
    select: 'default',
    move: 'move',
    rotate: 'grab',
    zoom: 'zoom-in',
    measure: 'crosshair',
    sketch: 'crosshair',
  };
  return cursors[tool] || 'default';
}

// ---------------------------------------------------------------------------
// 231-250. PRISM Image Editor Snappiness
// ---------------------------------------------------------------------------

/**
 * Load image with blur-up placeholder
 */
export async function loadPrismImage(
  url: string,
  onProgress?: (loaded: boolean, img: HTMLImageElement | null) => void
): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    loadImageProgressively(url, {
      onUpdate: (state) => {
        if (state.error) {
          onProgress?.(false, null);
          reject(new Error('Failed to load image'));
        } else if (!state.isLoading) {
          img.src = state.src;
          onProgress?.(true, img);
          resolve();
        }
      }
    });
  });
  return img;
}

/**
 * Create snappy layer thumbnails
 */
export function createLayerThumbnailCache(): {
  get: (layerId: string) => string | null;
  set: (layerId: string, dataUrl: string) => void;
  generateAsync: (layerId: string, imageData: ImageData) => Promise<string>;
} {
  const cache = new Map<string, string>();

  return {
    get: (layerId: string) => cache.get(layerId) || null,
    set: (layerId: string, dataUrl: string) => {
      cache.set(layerId, dataUrl);
    },
    generateAsync: async (layerId: string, imageData: ImageData) => {
      // Generate thumbnail in worker
      const thumbnailSize = 48;
      const scale = Math.min(thumbnailSize / imageData.width, thumbnailSize / imageData.height);
      const width = Math.round(imageData.width * scale);
      const height = Math.round(imageData.height * scale);

      // Create thumbnail canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Draw scaled
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/png');
      cache.set(layerId, dataUrl);
      return dataUrl;
    },
  };
}

/**
 * Snappy brush stroke rendering
 */
export function createSnappyBrushRenderer(): {
  startStroke: () => void;
  addPoint: (x: number, y: number, pressure: number) => void;
  endStroke: () => void;
  getPendingPoints: () => Array<{ x: number; y: number; pressure: number }>;
} {
  const pendingPoints: Array<{ x: number; y: number; pressure: number }> = [];
  let isStroking = false;

  return {
    startStroke: () => {
      isStroking = true;
      pendingPoints.length = 0;
    },
    addPoint: (x: number, y: number, pressure: number) => {
      if (!isStroking) return;
      pendingPoints.push({ x, y, pressure });
    },
    endStroke: () => {
      isStroking = false;
    },
    getPendingPoints: () => {
      const points = [...pendingPoints];
      pendingPoints.length = 0;
      return points;
    },
  };
}

// ---------------------------------------------------------------------------
// 251-275. VINX Video Editor Snappiness
// ---------------------------------------------------------------------------

/**
 * Generate video thumbnails lazily
 */
export function createVideoThumbnailGenerator(): {
  generate: (video: HTMLVideoElement, time: number, width: number, height: number) => Promise<string>;
  pregenerate: (video: HTMLVideoElement, count: number) => Promise<string[]>;
} {
  const cache = new Map<string, string>();

  const generate = async (
    video: HTMLVideoElement,
    time: number,
    width: number,
    height: number
  ): Promise<string> => {
    const key = `${video.src}-${time}-${width}`;
    if (cache.has(key)) return cache.get(key)!;

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      const seekHandler = () => {
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        cache.set(key, dataUrl);
        video.removeEventListener('seeked', seekHandler);
        resolve(dataUrl);
      };

      video.addEventListener('seeked', seekHandler);
      video.currentTime = time;
    });
  };

  const pregenerate = async (video: HTMLVideoElement, count: number): Promise<string[]> => {
    const duration = video.duration || 0;
    const interval = duration / (count + 1);
    const thumbnails: string[] = [];

    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const thumb = await generate(video, time, 160, 90);
      thumbnails.push(thumb);
    }

    return thumbnails;
  };

  return { generate, pregenerate };
}

/**
 * Snappy timeline scrubbing
 */
export function createSnappyTimeline(): {
  onScrubStart: () => void;
  onScrub: (time: number) => void;
  onScrubEnd: () => void;
} {
  let isScrubbing = false;
  let targetTime = 0;
  let currentTime = 0;
  let rafId: number | null = null;

  const onScrubStart = () => {
    isScrubbing = true;
    inputPriority.pause(); // Pause background tasks
  };

  const onScrub = (time: number) => {
    targetTime = time;
    if (!rafId) {
      rafId = requestAnimationFrame(updateScrub);
    }
  };

  const updateScrub = () => {
    rafId = null;
    if (!isScrubbing) return;

    // Smooth interpolation to target time
    const diff = targetTime - currentTime;
    if (Math.abs(diff) < 0.001) {
      currentTime = targetTime;
    } else {
      currentTime += diff * 0.3; // Smooth factor
    }

    document.dispatchEvent(new CustomEvent('vinx-scrub', {
      detail: { time: currentTime },
    }));

    if (Math.abs(targetTime - currentTime) > 0.001) {
      rafId = requestAnimationFrame(updateScrub);
    }
  };

  const onScrubEnd = () => {
    isScrubbing = false;
    inputPriority.resume();
    currentTime = targetTime;
    document.dispatchEvent(new CustomEvent('vinx-scrub-end', {
      detail: { time: targetTime },
    }));
  };

  return { onScrubStart, onScrub, onScrubEnd };
}

/**
 * Waveform caching for audio clips
 */
export function createWaveformCache(): {
  get: (clipId: string) => number[] | null;
  generate: (clipId: string, audioBuffer: AudioBuffer, samples: number) => Promise<number[]>;
} {
  const cache = new Map<string, number[]>();

  return {
    get: (clipId: string) => cache.get(clipId) || null,
    generate: async (clipId: string, audioBuffer: AudioBuffer, samples: number) => {
      if (cache.has(clipId)) return cache.get(clipId)!;

      // Generate waveform in worker
      const channelData = audioBuffer.getChannelData(0);
      const blockSize = Math.floor(channelData.length / samples);
      const peaks: number[] = [];

      for (let i = 0; i < samples; i++) {
        let max = 0;
        const start = i * blockSize;
        const end = start + blockSize;
        for (let j = start; j < end && j < channelData.length; j++) {
          const val = Math.abs(channelData[j]);
          if (val > max) max = val;
        }
        peaks.push(max);
      }

      cache.set(clipId, peaks);
      return peaks;
    },
  };
}

// ---------------------------------------------------------------------------
// 276-290. IMOSION Audio Snappiness
// ---------------------------------------------------------------------------

/**
 * Snappy meter updates
 */
export function createSnappyMeter(): {
  update: (level: number) => number;
  reset: () => void;
} {
  let displayLevel = 0;
  const attackTime = 0.005; // 5ms attack
  const releaseTime = 0.1; // 100ms release

  return {
    update: (level: number) => {
      if (level > displayLevel) {
        // Attack - instant
        displayLevel = level;
      } else {
        // Release - smooth decay
        displayLevel = displayLevel * (1 - 1 / (releaseTime * 60)) + level * (1 / (releaseTime * 60));
      }
      return displayLevel;
    },
    reset: () => {
      displayLevel = 0;
    },
  };
}

/**
 * Pre-buffer audio for instant playback
 */
export function createAudioPreBuffer(): {
  preload: (url: string) => Promise<AudioBuffer>;
  get: (url: string) => AudioBuffer | null;
  clear: () => void;
} {
  const cache = new Map<string, AudioBuffer>();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  return {
    preload: async (url: string) => {
      if (cache.has(url)) return cache.get(url)!;

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      cache.set(url, audioBuffer);
      return audioBuffer;
    },
    get: (url: string) => cache.get(url) || null,
    clear: () => {
      cache.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// 291-300. FLUX Motion Graphics Snappiness
// ---------------------------------------------------------------------------

/**
 * Keyframe preview caching
 */
export function createKeyframePreviewCache(): {
  set: (keyId: string, frame: ImageData) => void;
  get: (keyId: string) => ImageData | null;
  pregenerate: (keyframes: Array<{ id: string; time: number }>, render: (time: number) => ImageData) => Promise<void>;
} {
  const cache = new Map<string, ImageData>();

  return {
    set: (keyId: string, frame: ImageData) => {
      cache.set(keyId, frame);
    },
    get: (keyId: string) => cache.get(keyId) || null,
    pregenerate: async (keyframes, render) => {
      // Generate previews during idle time
      for (const kf of keyframes) {
        await new Promise(resolve => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
              cache.set(kf.id, render(kf.time));
              resolve(undefined);
            });
          } else {
            setTimeout(() => {
              cache.set(kf.id, render(kf.time));
              resolve(undefined);
            }, 0);
          }
        });
      }
    },
  };
}

/**
 * Snappy layer drag-and-drop
 */
export function createSnappyLayerDrag(): {
  startDrag: (element: HTMLElement, layerId: string) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
} {
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let startPos = { x: 0, y: 0 };
  let currentLayerId = '';

  const startDrag = (element: HTMLElement, layerId: string) => {
    dragging = true;
    currentLayerId = layerId;
    
    // Create ghost element
    ghost = element.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.8';
    ghost.style.zIndex = String(Z_HELP_OVERLAY_BASE);
    ghost.style.transform = 'scale(0.95)';
    ghost.style.transition = 'transform 100ms ease-out';
    document.body.appendChild(ghost);

    const rect = element.getBoundingClientRect();
    startPos = { x: rect.left, y: rect.top };
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;

    inputPriority.pause();
  };

  const updateDrag = (x: number, y: number) => {
    if (!dragging || !ghost) return;
    ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${y - ghost.offsetHeight / 2}px`;
  };

  const endDrag = () => {
    dragging = false;
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    inputPriority.resume();
  };

  return { startDrag, updateDrag, endDrag };
}

/**
 * Effect preview with throttling
 */
export function createEffectPreview(): {
  requestPreview: (effectId: string, params: Record<string, number>) => void;
  onPreviewReady: (callback: (effectId: string, preview: ImageData) => void) => void;
} {
  let pending: { effectId: string; params: Record<string, number> } | null = null;
  let callback: ((effectId: string, preview: ImageData) => void) | null = null;
  let rafId: number | null = null;

  const processPreview = () => {
    rafId = null;
    if (!pending || !callback) return;

    // In real implementation, this would render the effect
    // For now, dispatch event for the app to handle
    document.dispatchEvent(new CustomEvent('flux-preview-request', {
      detail: pending,
    }));

    pending = null;
  };

  return {
    requestPreview: (effectId: string, params: Record<string, number>) => {
      pending = { effectId, params };
      if (!rafId) {
        rafId = requestAnimationFrame(processPreview);
      }
    },
    onPreviewReady: (cb) => {
      callback = cb;
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// All exports are at declaration
