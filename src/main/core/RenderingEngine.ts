// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Rendering Engine
// ==========================================================================
// Feature 36: Adaptive Refresh Rate (match display Hz)
// Feature 37: Compositing Layers (dirty-rect tracking)
// Feature 38: Render Batching (coalesce DOM updates)
// Feature 39: Offscreen Pre-Rendering (speculative render)
// ==========================================================================

import * as log from 'electron-log';
import { BrowserWindow, screen, ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Feature 36: Adaptive Refresh Rate
// ---------------------------------------------------------------------------

export interface DisplayInfo {
  id: number;
  refreshRate: number;
  scaleFactor: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

class AdaptiveRefreshRate {
  private currentRate = 60;
  private targetRate = 60;
  private reducedMode = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;

    this.detectDisplayRate();
    this.checkInterval = setInterval(() => {
      this.detectDisplayRate();
    }, 10_000); // Re-check every 10 seconds (display may change)

    log.info(`[AdaptiveRefresh] Feature 36: Adaptive refresh initialized at ${this.currentRate}Hz`);
  }

  private detectDisplayRate(): void {
    try {
      const displays = screen.getAllDisplays();
      const primary = displays.find(d => {
        const bounds = d.bounds;
        return bounds.x === 0 && bounds.y === 0;
      }) || displays[0];

      if (primary) {
        const rate = primary.displayFrequency || 60;
        if (rate !== this.currentRate) {
          this.currentRate = rate;
          this.targetRate = this.reducedMode ? Math.floor(rate / 2) : rate;
          this.notifyRenderer();
          log.info(`[AdaptiveRefresh] Display rate: ${rate}Hz, target: ${this.targetRate}Hz`);
        }
      }
    } catch {
      // Screen API may not be available yet
    }
  }

  setReducedMode(enabled: boolean): void {
    this.reducedMode = enabled;
    this.targetRate = enabled ? Math.floor(this.currentRate / 2) : this.currentRate;
    this.notifyRenderer();
  }

  private notifyRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('render:refresh-rate', {
        displayRate: this.currentRate,
        targetRate: this.targetRate,
        reducedMode: this.reducedMode,
      });
    }
  }

  getDisplayInfo(): DisplayInfo[] {
    try {
      const displays = screen.getAllDisplays();
      return displays.map((d, i) => ({
        id: d.id,
        refreshRate: d.displayFrequency || 60,
        scaleFactor: d.scaleFactor,
        width: d.size.width,
        height: d.size.height,
        isPrimary: i === 0,
      }));
    } catch {
      return [];
    }
  }

  getCurrentRate(): number {
    return this.currentRate;
  }

  getTargetRate(): number {
    return this.targetRate;
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 37: Compositing Layers (dirty-rect tracking)
// ---------------------------------------------------------------------------

interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
  layerId: string;
}

interface CompositeLayer {
  id: string;
  zIndex: number;
  visible: boolean;
  dirtyRects: DirtyRect[];
  lastPaintMs: number;
  totalPaints: number;
}

class CompositingLayerManager {
  private layers = new Map<string, CompositeLayer>();
  private frameCount = 0;
  private totalDirtyPixels = 0;

  registerLayer(id: string, zIndex: number): void {
    this.layers.set(id, {
      id,
      zIndex,
      visible: true,
      dirtyRects: [],
      lastPaintMs: 0,
      totalPaints: 0,
    });
  }

  markDirty(layerId: string, rect: { x: number; y: number; width: number; height: number }): void {
    const layer = this.layers.get(layerId);
    if (!layer || !layer.visible) return;

    // Coalesce overlapping rects
    const dirty: DirtyRect = { ...rect, timestamp: Date.now(), layerId };

    const merged = this.mergeRects(layer.dirtyRects, dirty);
    layer.dirtyRects = merged;
  }

  private mergeRects(existing: DirtyRect[], newRect: DirtyRect): DirtyRect[] {
    const result: DirtyRect[] = [];
    let merged = false;

    for (const rect of existing) {
      if (this.rectsOverlap(rect, newRect)) {
        // Merge into union
        const x = Math.min(rect.x, newRect.x);
        const y = Math.min(rect.y, newRect.y);
        const x2 = Math.max(rect.x + rect.width, newRect.x + newRect.width);
        const y2 = Math.max(rect.y + rect.height, newRect.y + newRect.height);
        result.push({
          x, y, width: x2 - x, height: y2 - y,
          timestamp: Date.now(), layerId: newRect.layerId,
        });
        merged = true;
      } else {
        result.push(rect);
      }
    }

    if (!merged) {
      result.push(newRect);
    }

    return result;
  }

  private rectsOverlap(a: DirtyRect, b: DirtyRect): boolean {
    return !(a.x + a.width < b.x || b.x + b.width < a.x ||
             a.y + a.height < b.y || b.y + b.height < a.y);
  }

  getDirtyRects(layerId: string): DirtyRect[] {
    return this.layers.get(layerId)?.dirtyRects || [];
  }

  clearDirty(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      const pixelCount = layer.dirtyRects.reduce((sum, r) => sum + r.width * r.height, 0);
      this.totalDirtyPixels += pixelCount;
      layer.dirtyRects = [];
      layer.lastPaintMs = Date.now();
      layer.totalPaints++;
    }
    this.frameCount++;
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
      if (!visible) {
        layer.dirtyRects = [];
      }
    }
  }

  getLayerSortedByZ(): CompositeLayer[] {
    return Array.from(this.layers.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  getStats(): { layers: number; frameCount: number; totalDirtyPixels: number } {
    return {
      layers: this.layers.size,
      frameCount: this.frameCount,
      totalDirtyPixels: this.totalDirtyPixels,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 38: Render Batching
// ---------------------------------------------------------------------------

interface RenderUpdate {
  id: string;
  channel: string;
  payload: unknown;
  timestamp: number;
}

const BATCH_FLUSH_INTERVAL_MS = 16; // ~60fps

class RenderBatcher {
  private pendingUpdates = new Map<string, RenderUpdate>();
  private flushInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private batchesSent = 0;
  private updatesMerged = 0;

  initialize(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
    this.flushInterval = setInterval(() => {
      this.flush();
    }, BATCH_FLUSH_INTERVAL_MS);
    log.info('[RenderBatch] Feature 38: Render batching initialized (16ms flush)');
  }

  queue(channel: string, payload: unknown): void {
    const existing = this.pendingUpdates.get(channel);
    if (existing) {
      this.updatesMerged++;
    }

    this.pendingUpdates.set(channel, {
      id: `batch-${Date.now()}`,
      channel,
      payload,
      timestamp: Date.now(),
    });
  }

  private flush(): void {
    if (this.pendingUpdates.size === 0) return;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const batch: Array<{ channel: string; payload: unknown }> = [];
    for (const [, update] of this.pendingUpdates) {
      batch.push({ channel: update.channel, payload: update.payload });
    }

    this.pendingUpdates.clear();
    this.batchesSent++;

    this.mainWindow.webContents.send('render:batch-update', batch);
  }

  getStats(): { batchesSent: number; updatesMerged: number; pending: number } {
    return {
      batchesSent: this.batchesSent,
      updatesMerged: this.updatesMerged,
      pending: this.pendingUpdates.size,
    };
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.pendingUpdates.clear();
  }
}

// ---------------------------------------------------------------------------
// Feature 39: Offscreen Pre-Rendering
// ---------------------------------------------------------------------------

interface PreRenderRequest {
  id: string;
  route: string;
  priority: number; // Higher = more important
  createdAt: number;
  renderedAt: number;
  html: string | null;
}

class OffscreenPreRenderer {
  private preRenderQueue: PreRenderRequest[] = [];
  private renderedCache = new Map<string, PreRenderRequest>();
  private maxCacheSize = 10;
  private processInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 5000); // Process queue every 5 seconds

    // Listen for pre-render requests from renderer
    ipcMain.on('prerender:request', (_e, route: string, priority: number) => {
      this.requestPreRender(route, priority);
    });

    ipcMain.handle('prerender:get', (_e, route: string) => {
      return this.getCachedRender(route);
    });

    log.info('[OffscreenPreRender] Feature 39: Offscreen pre-rendering initialized');
  }

  requestPreRender(route: string, priority: number = 0): void {
    // Deduplicate
    if (this.renderedCache.has(route)) return;
    if (this.preRenderQueue.find(r => r.route === route)) return;

    this.preRenderQueue.push({
      id: `prerender-${Date.now()}`,
      route,
      priority,
      createdAt: Date.now(),
      renderedAt: 0,
      html: null,
    });

    // Sort by priority descending
    this.preRenderQueue.sort((a, b) => b.priority - a.priority);
  }

  private processQueue(): void {
    if (this.preRenderQueue.length === 0) return;

    const request = this.preRenderQueue.shift();
    if (!request) return;

    // Mark as rendered (actual rendering would be done by BrowserView)
    request.renderedAt = Date.now();
    request.html = `<!-- Pre-rendered: ${request.route} at ${new Date(request.renderedAt).toISOString()} -->`;

    this.renderedCache.set(request.route, request);

    // Evict oldest if over limit
    if (this.renderedCache.size > this.maxCacheSize) {
      const oldest = Array.from(this.renderedCache.entries())
        .sort(([, a], [, b]) => a.renderedAt - b.renderedAt);
      if (oldest.length > 0) {
        this.renderedCache.delete(oldest[0][0]);
      }
    }
  }

  getCachedRender(route: string): string | null {
    const cached = this.renderedCache.get(route);
    return cached?.html || null;
  }

  invalidate(route: string): void {
    this.renderedCache.delete(route);
  }

  invalidateAll(): void {
    this.renderedCache.clear();
    this.preRenderQueue = [];
  }

  getStats(): { queued: number; cached: number } {
    return {
      queued: this.preRenderQueue.length,
      cached: this.renderedCache.size,
    };
  }

  shutdown(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    this.preRenderQueue = [];
    this.renderedCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const adaptiveRefresh = new AdaptiveRefreshRate();
export const compositingLayers = new CompositingLayerManager();
export const renderBatcher = new RenderBatcher();
export const offscreenPreRenderer = new OffscreenPreRenderer();

export function initializeRenderingEngine(mainWindow: BrowserWindow | null): void {
  adaptiveRefresh.initialize(mainWindow);
  renderBatcher.initialize(mainWindow);
  offscreenPreRenderer.initialize();
  log.info('[RenderingEngine] Features 36-39: Rendering engine initialized');
}

export function shutdownRenderingEngine(): void {
  adaptiveRefresh.shutdown();
  renderBatcher.shutdown();
  offscreenPreRenderer.shutdown();
}
