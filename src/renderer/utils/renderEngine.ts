// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Rendering Engine (Phase J: Items 751-775)
// Canvas optimizations, text rendering, and GPU acceleration
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderLayer {
  id: string;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  dirty: boolean;
  zIndex: number;
  opacity: number;
  visible: boolean;
  bounds: Rect;
}

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  dirty: boolean;
  lod: number;
}

export interface RenderBudget {
  targetFPS: number;
  frameBudgetMs: number;
  usedMs: number;
  remaining: number;
}

export interface TextRenderOptions {
  font: string;
  fontSize: number;
  color: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  letterSpacing?: number;
  lineHeight?: number;
  subpixel?: boolean;
  ligatures?: boolean;
  stroke?: { color: string; width: number };
  gradient?: { colors: string[]; direction: 'horizontal' | 'vertical' };
}

export interface GPUFeatures {
  webgl: boolean;
  webgl2: boolean;
  webgpu: boolean;
  offscreenCanvas: boolean;
  imageDecoding: boolean;
  sharedArrayBuffer: boolean;
}

// ---------------------------------------------------------------------------
// 751. Dirty Rectangle Tracking
// ---------------------------------------------------------------------------

export class DirtyRectTracker {
  private dirtyRects: Rect[] = [];
  private fullDirty = false;
  private bounds: Rect;

  constructor(width: number, height: number) {
    this.bounds = { x: 0, y: 0, width, height };
  }

  markDirty(rect: Rect): void {
    if (this.fullDirty) return;
    
    // Merge with existing rects if overlapping
    for (let i = 0; i < this.dirtyRects.length; i++) {
      if (this.rectsOverlap(rect, this.dirtyRects[i])) {
        this.dirtyRects[i] = this.mergeRects(rect, this.dirtyRects[i]);
        this.consolidateRects();
        return;
      }
    }
    
    this.dirtyRects.push(rect);
    
    // If too many rects, mark full dirty
    if (this.dirtyRects.length > 20) {
      this.markFullDirty();
    }
  }

  markFullDirty(): void {
    this.fullDirty = true;
    this.dirtyRects = [{ ...this.bounds }];
  }

  getDirtyRects(): Rect[] {
    return this.fullDirty ? [{ ...this.bounds }] : [...this.dirtyRects];
  }

  clear(): void {
    this.dirtyRects = [];
    this.fullDirty = false;
  }

  hasDirty(): boolean {
    return this.fullDirty || this.dirtyRects.length > 0;
  }

  isFullDirty(): boolean {
    return this.fullDirty;
  }

  setBounds(width: number, height: number): void {
    this.bounds = { x: 0, y: 0, width, height };
    this.markFullDirty();
  }

  private rectsOverlap(a: Rect, b: Rect): boolean {
    return !(a.x + a.width < b.x || b.x + b.width < a.x ||
             a.y + a.height < b.y || b.y + b.height < a.y);
  }

  private mergeRects(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  }

  private consolidateRects(): void {
    let merged = true;
    while (merged && this.dirtyRects.length > 1) {
      merged = false;
      for (let i = 0; i < this.dirtyRects.length && !merged; i++) {
        for (let j = i + 1; j < this.dirtyRects.length && !merged; j++) {
          if (this.rectsOverlap(this.dirtyRects[i], this.dirtyRects[j])) {
            this.dirtyRects[i] = this.mergeRects(this.dirtyRects[i], this.dirtyRects[j]);
            this.dirtyRects.splice(j, 1);
            merged = true;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 752. Off-screen Canvas Compositing
// ---------------------------------------------------------------------------

export class OffscreenCompositor {
  private layers: Map<string, RenderLayer> = new Map();
  private outputCanvas: HTMLCanvasElement;
  private outputCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.outputCanvas = canvas;
    this.outputCtx = canvas.getContext('2d')!;
  }

  createLayer(id: string, width: number, height: number, zIndex = 0): RenderLayer {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = width;
      canvas.height = height;
    }

    const layer: RenderLayer = {
      id,
      canvas,
      dirty: true,
      zIndex,
      opacity: 1,
      visible: true,
      bounds: { x: 0, y: 0, width, height },
    };

    this.layers.set(id, layer);
    return layer;
  }

  getLayer(id: string): RenderLayer | undefined {
    return this.layers.get(id);
  }

  getLayerContext(id: string): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    const layer = this.layers.get(id);
    if (!layer) return null;
    return layer.canvas.getContext('2d');
  }

  removeLayer(id: string): boolean {
    return this.layers.delete(id);
  }

  setLayerVisibility(id: string, visible: boolean): void {
    const layer = this.layers.get(id);
    if (layer) layer.visible = visible;
  }

  setLayerOpacity(id: string, opacity: number): void {
    const layer = this.layers.get(id);
    if (layer) layer.opacity = Math.max(0, Math.min(1, opacity));
  }

  setLayerZIndex(id: string, zIndex: number): void {
    const layer = this.layers.get(id);
    if (layer) layer.zIndex = zIndex;
  }

  markLayerDirty(id: string): void {
    const layer = this.layers.get(id);
    if (layer) layer.dirty = true;
  }

  composite(): void {
    const sortedLayers = Array.from(this.layers.values())
      .filter(l => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    this.outputCtx.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);

    for (const layer of sortedLayers) {
      this.outputCtx.globalAlpha = layer.opacity;
      this.outputCtx.drawImage(
        layer.canvas as CanvasImageSource,
        layer.bounds.x,
        layer.bounds.y
      );
      layer.dirty = false;
    }

    this.outputCtx.globalAlpha = 1;
  }

  compositeRegion(region: Rect): void {
    const sortedLayers = Array.from(this.layers.values())
      .filter(l => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    this.outputCtx.clearRect(region.x, region.y, region.width, region.height);

    for (const layer of sortedLayers) {
      this.outputCtx.globalAlpha = layer.opacity;
      this.outputCtx.drawImage(
        layer.canvas as CanvasImageSource,
        region.x, region.y, region.width, region.height,
        region.x, region.y, region.width, region.height
      );
    }

    this.outputCtx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// 753. Layer Caching for Static Content
// ---------------------------------------------------------------------------

export class LayerCache {
  private cache: Map<string, { canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number }> = new Map();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize = 50, maxAge = 60000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  get(key: string): HTMLCanvasElement | OffscreenCanvas | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    entry.timestamp = Date.now();
    return entry.canvas;
  }

  set(key: string, canvas: HTMLCanvasElement | OffscreenCanvas): void {
    this.evictIfNeeded();
    this.cache.set(key, { canvas, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.maxSize) return;

    // Remove oldest entries
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(this.cache.size * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}

// ---------------------------------------------------------------------------
// 754. WebGL 2.0 Rendering Path
// ---------------------------------------------------------------------------

export class WebGLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private programs: Map<string, WebGLProgram> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): void {
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
  }

  isSupported(): boolean {
    return this.gl !== null;
  }

  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  createProgram(name: string, vertexSource: string, fragmentSource: string): boolean {
    if (!this.gl) return false;

    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);
    
    if (!vertexShader || !fragmentShader) return false;

    const program = this.gl.createProgram();
    if (!program) return false;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      return false;
    }

    this.programs.set(name, program);
    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  useProgram(name: string): boolean {
    const program = this.programs.get(name);
    if (!program || !this.gl) return false;
    this.gl.useProgram(program);
    return true;
  }

  createTexture(name: string, image: TexImageSource): boolean {
    if (!this.gl) return false;

    const texture = this.gl.createTexture();
    if (!texture) return false;

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.textures.set(name, texture);
    return true;
  }

  bindTexture(name: string, unit = 0): boolean {
    const texture = this.textures.get(name);
    if (!texture || !this.gl) return false;
    
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    return true;
  }

  clear(r = 0, g = 0, b = 0, a = 1): void {
    if (!this.gl) return;
    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.gl?.viewport(x, y, width, height);
  }

  destroy(): void {
    if (!this.gl) return;
    
    this.programs.forEach(program => this.gl!.deleteProgram(program));
    this.textures.forEach(texture => this.gl!.deleteTexture(texture));
    this.programs.clear();
    this.textures.clear();
  }
}

// ---------------------------------------------------------------------------
// 755. Instanced Rendering
// ---------------------------------------------------------------------------

export class InstancedRenderer {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private maxInstances: number;

  constructor(gl: WebGL2RenderingContext, maxInstances = 10000) {
    this.gl = gl;
    this.maxInstances = maxInstances;
    this.init();
  }

  private init(): void {
    this.vao = this.gl.createVertexArray();
    this.instanceBuffer = this.gl.createBuffer();
  }

  updateInstances(data: Float32Array): void {
    if (!this.instanceBuffer) return;
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
  }

  draw(program: WebGLProgram, instanceCount: number, mode = this.gl.TRIANGLES, vertexCount = 6): void {
    if (!this.vao) return;
    
    this.gl.useProgram(program);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArraysInstanced(mode, 0, vertexCount, Math.min(instanceCount, this.maxInstances));
  }

  destroy(): void {
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.instanceBuffer) this.gl.deleteBuffer(this.instanceBuffer);
  }
}

// ---------------------------------------------------------------------------
// 756. Tile-Based Rendering
// ---------------------------------------------------------------------------

export class TileRenderer {
  private tiles: Map<string, Tile> = new Map();
  private tileSize: number;
  private lodLevels: number;

  constructor(tileSize = 256, lodLevels = 4) {
    this.tileSize = tileSize;
    this.lodLevels = lodLevels;
  }

  getTileKey(x: number, y: number, lod: number): string {
    return `${x}_${y}_${lod}`;
  }

  getTile(x: number, y: number, lod: number): Tile | undefined {
    return this.tiles.get(this.getTileKey(x, y, lod));
  }

  createTile(x: number, y: number, lod: number): Tile {
    const key = this.getTileKey(x, y, lod);
    const size = this.tileSize / Math.pow(2, lod);
    
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(this.tileSize, this.tileSize)
      : document.createElement('canvas');
    
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = this.tileSize;
      canvas.height = this.tileSize;
    }

    const tile: Tile = {
      x: x * size,
      y: y * size,
      width: size,
      height: size,
      canvas,
      dirty: true,
      lod,
    };

    this.tiles.set(key, tile);
    return tile;
  }

  markDirty(x: number, y: number, lod: number): void {
    const tile = this.getTile(x, y, lod);
    if (tile) tile.dirty = true;
  }

  markAllDirty(): void {
    this.tiles.forEach(tile => tile.dirty = true);
  }

  getVisibleTiles(viewport: Rect, lod: number): Tile[] {
    const size = this.tileSize / Math.pow(2, lod);
    const startX = Math.floor(viewport.x / size);
    const startY = Math.floor(viewport.y / size);
    const endX = Math.ceil((viewport.x + viewport.width) / size);
    const endY = Math.ceil((viewport.y + viewport.height) / size);

    const visible: Tile[] = [];
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        let tile = this.getTile(x, y, lod);
        if (!tile) {
          tile = this.createTile(x, y, lod);
        }
        visible.push(tile);
      }
    }
    return visible;
  }

  clearTile(x: number, y: number, lod: number): boolean {
    return this.tiles.delete(this.getTileKey(x, y, lod));
  }

  clearAllTiles(): void {
    this.tiles.clear();
  }

  getTileCount(): number {
    return this.tiles.size;
  }
}

// ---------------------------------------------------------------------------
// 757. Level-of-Detail Rendering
// ---------------------------------------------------------------------------

export class LODManager {
  private levels: number;
  private thresholds: number[];

  constructor(levels = 4) {
    this.levels = levels;
    this.thresholds = this.calculateThresholds();
  }

  private calculateThresholds(): number[] {
    const thresholds: number[] = [];
    for (let i = 0; i < this.levels; i++) {
      thresholds.push(Math.pow(2, i));
    }
    return thresholds;
  }

  getLODForScale(scale: number): number {
    for (let i = this.levels - 1; i >= 0; i--) {
      if (scale <= 1 / this.thresholds[i]) {
        return i;
      }
    }
    return 0;
  }

  getScaleForLOD(lod: number): number {
    return 1 / Math.pow(2, lod);
  }

  shouldUpdateLOD(currentLOD: number, scale: number): boolean {
    const idealLOD = this.getLODForScale(scale);
    return idealLOD !== currentLOD;
  }
}

// ---------------------------------------------------------------------------
// 758. Occlusion Culling
// ---------------------------------------------------------------------------

export class OcclusionCuller {
  private occluders: Rect[] = [];

  addOccluder(rect: Rect): void {
    this.occluders.push(rect);
  }

  removeOccluder(rect: Rect): boolean {
    const index = this.occluders.findIndex(o => 
      o.x === rect.x && o.y === rect.y && 
      o.width === rect.width && o.height === rect.height
    );
    if (index >= 0) {
      this.occluders.splice(index, 1);
      return true;
    }
    return false;
  }

  clearOccluders(): void {
    this.occluders = [];
  }

  isOccluded(rect: Rect): boolean {
    for (const occluder of this.occluders) {
      if (this.contains(occluder, rect)) {
        return true;
      }
    }
    return false;
  }

  getVisibleRects(rects: Rect[]): Rect[] {
    return rects.filter(rect => !this.isOccluded(rect));
  }

  private contains(outer: Rect, inner: Rect): boolean {
    return outer.x <= inner.x &&
           outer.y <= inner.y &&
           outer.x + outer.width >= inner.x + inner.width &&
           outer.y + outer.height >= inner.y + inner.height;
  }
}

// ---------------------------------------------------------------------------
// 759. Render Budget Allocation
// ---------------------------------------------------------------------------

export class RenderBudgetManager {
  private targetFPS: number;
  private frameBudgetMs: number;
  private frameStartTime: number = 0;
  private usedMs: number = 0;

  constructor(targetFPS = 60) {
    this.targetFPS = targetFPS;
    this.frameBudgetMs = 1000 / targetFPS;
  }

  beginFrame(): void {
    this.frameStartTime = performance.now();
    this.usedMs = 0;
  }

  getRemainingBudget(): number {
    this.usedMs = performance.now() - this.frameStartTime;
    return Math.max(0, this.frameBudgetMs - this.usedMs);
  }

  hasBudget(requiredMs = 1): boolean {
    return this.getRemainingBudget() >= requiredMs;
  }

  getBudgetStatus(): RenderBudget {
    const remaining = this.getRemainingBudget();
    return {
      targetFPS: this.targetFPS,
      frameBudgetMs: this.frameBudgetMs,
      usedMs: this.usedMs,
      remaining,
    };
  }

  setTargetFPS(fps: number): void {
    this.targetFPS = fps;
    this.frameBudgetMs = 1000 / fps;
  }

  endFrame(): { overBudget: boolean; actualMs: number } {
    const actualMs = performance.now() - this.frameStartTime;
    return {
      overBudget: actualMs > this.frameBudgetMs,
      actualMs,
    };
  }
}

// ---------------------------------------------------------------------------
// 760. Frame Pacing
// ---------------------------------------------------------------------------

export class FramePacer {
  private targetInterval: number;
  private lastFrameTime: number = 0;
  private rafId: number | null = null;
  private callback: ((deltaTime: number) => void) | null = null;
  private running = false;

  constructor(targetFPS = 60) {
    this.targetInterval = 1000 / targetFPS;
  }

  start(callback: (deltaTime: number) => void): void {
    this.callback = callback;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setTargetFPS(fps: number): void {
    this.targetInterval = 1000 / fps;
  }

  private tick = (): void => {
    if (!this.running || !this.callback) return;

    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed >= this.targetInterval) {
      const deltaTime = elapsed;
      this.lastFrameTime = now - (elapsed % this.targetInterval);
      this.callback(deltaTime);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}

// ---------------------------------------------------------------------------
// 761-768. Text Rendering
// ---------------------------------------------------------------------------

export class TextRenderer {
  private ctx: CanvasRenderingContext2D;
  private fontAtlas: Map<string, HTMLCanvasElement> = new Map();
  private defaultOptions: TextRenderOptions = {
    font: 'Inter, sans-serif',
    fontSize: 14,
    color: '#ffffff',
    align: 'left',
    baseline: 'alphabetic',
    subpixel: true,
    ligatures: true,
  };

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  // 761. Subpixel Rendering
  setSubpixelRendering(enabled: boolean): void {
    this.defaultOptions.subpixel = enabled;
    // Note: Canvas doesn't directly support subpixel rendering control
    // This is more of a hint for the implementation
  }

  // 762. Font Atlas Caching
  getGlyphFromAtlas(char: string, font: string, size: number): HTMLCanvasElement | null {
    const key = `${font}_${size}_${char}`;
    if (this.fontAtlas.has(key)) {
      return this.fontAtlas.get(key)!;
    }

    // Create glyph canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.font = `${size}px ${font}`;
    const metrics = ctx.measureText(char);
    
    canvas.width = Math.ceil(metrics.width) + 4;
    canvas.height = size + 8;
    
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(char, 2, 4);

    this.fontAtlas.set(key, canvas);
    return canvas;
  }

  clearFontAtlas(): void {
    this.fontAtlas.clear();
  }

  // 763. Variable Font Support
  setVariableFont(font: string, variations: Record<string, number>): string {
    const variationString = Object.entries(variations)
      .map(([axis, value]) => `'${axis}' ${value}`)
      .join(', ');
    return `${font}; font-variation-settings: ${variationString}`;
  }

  // 764. Ligatures Toggle
  renderText(text: string, x: number, y: number, options: Partial<TextRenderOptions> = {}): void {
    const opts = { ...this.defaultOptions, ...options };
    
    this.ctx.save();
    this.ctx.font = `${opts.fontSize}px ${opts.font}`;
    this.ctx.fillStyle = opts.color;
    this.ctx.textAlign = opts.align;
    this.ctx.textBaseline = opts.baseline;

    // 765. Handle ligatures (browser dependent)
    if (!opts.ligatures) {
      // Render character by character to disable ligatures
      let currentX = x;
      for (const char of text) {
        this.ctx.fillText(char, currentX, y);
        currentX += this.ctx.measureText(char).width + (opts.letterSpacing || 0);
      }
    } else {
      // 767. Gradient fills
      if (opts.gradient) {
        const gradient = opts.gradient.direction === 'horizontal'
          ? this.ctx.createLinearGradient(x, y, x + this.ctx.measureText(text).width, y)
          : this.ctx.createLinearGradient(x, y, x, y + opts.fontSize);
        
        opts.gradient.colors.forEach((color, i) => {
          gradient.addColorStop(i / (opts.gradient!.colors.length - 1), color);
        });
        this.ctx.fillStyle = gradient;
      }

      this.ctx.fillText(text, x, y);

      // 766. Stroke/outline
      if (opts.stroke) {
        this.ctx.strokeStyle = opts.stroke.color;
        this.ctx.lineWidth = opts.stroke.width;
        this.ctx.strokeText(text, x, y);
      }
    }

    this.ctx.restore();
  }

  // 768. Text Path Following (curved text)
  renderTextOnPath(text: string, path: Path2D | { x: number; y: number }[], options: Partial<TextRenderOptions> = {}): void {
    const opts = { ...this.defaultOptions, ...options };
    this.ctx.save();
    this.ctx.font = `${opts.fontSize}px ${opts.font}`;
    this.ctx.fillStyle = opts.color;

    if (Array.isArray(path) && path.length >= 2) {
      let totalLength = 0;
      const segments: { start: { x: number; y: number }; end: { x: number; y: number }; length: number; angle: number }[] = [];

      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        segments.push({ start: path[i - 1], end: path[i], length, angle });
        totalLength += length;
      }

      let currentLength = 0;
      let segmentIndex = 0;
      let segmentPos = 0;

      for (const char of text) {
        const charWidth = this.ctx.measureText(char).width;
        
        while (segmentIndex < segments.length && segmentPos + charWidth > segments[segmentIndex].length) {
          currentLength += segments[segmentIndex].length - segmentPos;
          segmentIndex++;
          segmentPos = 0;
        }

        if (segmentIndex >= segments.length) break;

        const segment = segments[segmentIndex];
        const t = segmentPos / segment.length;
        const x = segment.start.x + (segment.end.x - segment.start.x) * t;
        const y = segment.start.y + (segment.end.y - segment.start.y) * t;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(segment.angle);
        this.ctx.fillText(char, 0, 0);
        this.ctx.restore();

        segmentPos += charWidth + (opts.letterSpacing || 0);
      }
    }

    this.ctx.restore();
  }

  measureText(text: string, options: Partial<TextRenderOptions> = {}): TextMetrics {
    const opts = { ...this.defaultOptions, ...options };
    this.ctx.font = `${opts.fontSize}px ${opts.font}`;
    return this.ctx.measureText(text);
  }
}

// ---------------------------------------------------------------------------
// 769. GPU Feature Detection
// ---------------------------------------------------------------------------

export function detectGPUFeatures(): GPUFeatures {
  return {
    webgl: !!document.createElement('canvas').getContext('webgl'),
    webgl2: !!document.createElement('canvas').getContext('webgl2'),
    webgpu: 'gpu' in navigator,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    imageDecoding: 'decode' in HTMLImageElement.prototype,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
}

// ---------------------------------------------------------------------------
// 770-775. GPU Acceleration Utilities
// ---------------------------------------------------------------------------

// 770. WebGPU Compute Shaders (stub - requires actual WebGPU implementation)
export class WebGPUCompute {
  private device: GPUDevice | null = null;
  private supported = false;

  async init(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      this.supported = false;
      return false;
    }

    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<GPUAdapter | null> } }).gpu.requestAdapter();
      if (!adapter) return false;
      
      this.device = await adapter.requestDevice();
      this.supported = true;
      return true;
    } catch {
      this.supported = false;
      return false;
    }
  }

  isSupported(): boolean {
    return this.supported;
  }

  // Placeholder for compute shader operations
  async runComputeShader(shader: string, data: Float32Array): Promise<Float32Array | null> {
    if (!this.device) return null;
    // WebGPU compute shader implementation would go here
    return data;
  }
}

// 771. GPU-Accelerated Blur
export function createGPUBlur(gl: WebGL2RenderingContext): { blur: (texture: WebGLTexture, radius: number) => void } {
  const blurProgram = createBlurProgram(gl);
  
  return {
    blur: (texture: WebGLTexture, radius: number) => {
      if (!blurProgram) return;
      gl.useProgram(blurProgram);
      // Set uniforms and draw
    },
  };
}

function createBlurProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertexShader = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  const fragmentShader = `#version 300 es
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_radius;
    in vec2 v_texCoord;
    out vec4 outColor;
    
    void main() {
      vec4 sum = vec4(0.0);
      float total = 0.0;
      for (float x = -u_radius; x <= u_radius; x++) {
        for (float y = -u_radius; y <= u_radius; y++) {
          vec2 offset = vec2(x, y) / u_resolution;
          float weight = 1.0 - length(vec2(x, y)) / u_radius;
          if (weight > 0.0) {
            sum += texture(u_texture, v_texCoord + offset) * weight;
            total += weight;
          }
        }
      }
      outColor = sum / total;
    }
  `;

  return compileProgram(gl, vertexShader, fragmentShader);
}

function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;

  gl.shaderSource(vertexShader, vs);
  gl.compileShader(vertexShader);
  gl.shaderSource(fragmentShader, fs);
  gl.compileShader(fragmentShader);

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  return program;
}

// 772. GPU Color Space Conversion
export const colorSpaceShaders = {
  srgbToLinear: `
    vec3 srgbToLinear(vec3 srgb) {
      return pow(srgb, vec3(2.2));
    }
  `,
  linearToSrgb: `
    vec3 linearToSrgb(vec3 linear) {
      return pow(linear, vec3(1.0/2.2));
    }
  `,
  rgbToHsl: `
    vec3 rgbToHsl(vec3 rgb) {
      float maxC = max(max(rgb.r, rgb.g), rgb.b);
      float minC = min(min(rgb.r, rgb.g), rgb.b);
      float l = (maxC + minC) / 2.0;
      float s = 0.0;
      float h = 0.0;
      if (maxC != minC) {
        float d = maxC - minC;
        s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
        if (maxC == rgb.r) h = (rgb.g - rgb.b) / d + (rgb.g < rgb.b ? 6.0 : 0.0);
        else if (maxC == rgb.g) h = (rgb.b - rgb.r) / d + 2.0;
        else h = (rgb.r - rgb.g) / d + 4.0;
        h /= 6.0;
      }
      return vec3(h, s, l);
    }
  `,
};

// 773. GPU Image Scaling
export const scalingShaders = {
  bilinear: `
    vec4 bilinearSample(sampler2D tex, vec2 uv, vec2 texSize) {
      vec2 texel = uv * texSize - 0.5;
      vec2 f = fract(texel);
      vec2 p = floor(texel) + 0.5;
      vec4 tl = texture(tex, p / texSize);
      vec4 tr = texture(tex, (p + vec2(1, 0)) / texSize);
      vec4 bl = texture(tex, (p + vec2(0, 1)) / texSize);
      vec4 br = texture(tex, (p + vec2(1, 1)) / texSize);
      return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
    }
  `,
  lanczos: `
    float lanczos(float x, float a) {
      if (x == 0.0) return 1.0;
      if (abs(x) >= a) return 0.0;
      float px = 3.14159265359 * x;
      return a * sin(px) * sin(px / a) / (px * px);
    }
  `,
};

// 775. GPU Memory Pool
export class GPUMemoryPool {
  private gl: WebGL2RenderingContext;
  private texturePool: WebGLTexture[] = [];
  private bufferPool: WebGLBuffer[] = [];
  private maxPoolSize: number;

  constructor(gl: WebGL2RenderingContext, maxPoolSize = 100) {
    this.gl = gl;
    this.maxPoolSize = maxPoolSize;
  }

  acquireTexture(): WebGLTexture | null {
    if (this.texturePool.length > 0) {
      return this.texturePool.pop()!;
    }
    return this.gl.createTexture();
  }

  releaseTexture(texture: WebGLTexture): void {
    if (this.texturePool.length < this.maxPoolSize) {
      this.texturePool.push(texture);
    } else {
      this.gl.deleteTexture(texture);
    }
  }

  acquireBuffer(): WebGLBuffer | null {
    if (this.bufferPool.length > 0) {
      return this.bufferPool.pop()!;
    }
    return this.gl.createBuffer();
  }

  releaseBuffer(buffer: WebGLBuffer): void {
    if (this.bufferPool.length < this.maxPoolSize) {
      this.bufferPool.push(buffer);
    } else {
      this.gl.deleteBuffer(buffer);
    }
  }

  clear(): void {
    this.texturePool.forEach(t => this.gl.deleteTexture(t));
    this.bufferPool.forEach(b => this.gl.deleteBuffer(b));
    this.texturePool = [];
    this.bufferPool = [];
  }

  getStats(): { textures: number; buffers: number } {
    return {
      textures: this.texturePool.length,
      buffers: this.bufferPool.length,
    };
  }
}

// ---------------------------------------------------------------------------
// React Hooks for Rendering
// ---------------------------------------------------------------------------

export function useRenderBudget(targetFPS = 60) {
  const manager = useRef(new RenderBudgetManager(targetFPS));
  
  const beginFrame = useCallback(() => manager.current.beginFrame(), []);
  const hasBudget = useCallback((ms?: number) => manager.current.hasBudget(ms), []);
  const endFrame = useCallback(() => manager.current.endFrame(), []);
  
  return { beginFrame, hasBudget, endFrame, getBudgetStatus: () => manager.current.getBudgetStatus() };
}

export function useFramePacer(callback: (deltaTime: number) => void, targetFPS = 60) {
  const pacer = useRef<FramePacer | null>(null);
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    pacer.current = new FramePacer(targetFPS);
    pacer.current.start((dt) => callbackRef.current(dt));
    
    return () => {
      pacer.current?.stop();
    };
  }, [targetFPS]);
}

export function useDirtyRects(width: number, height: number) {
  const tracker = useRef(new DirtyRectTracker(width, height));
  
  useEffect(() => {
    tracker.current.setBounds(width, height);
  }, [width, height]);
  
  return {
    markDirty: (rect: Rect) => tracker.current.markDirty(rect),
    markFullDirty: () => tracker.current.markFullDirty(),
    getDirtyRects: () => tracker.current.getDirtyRects(),
    clear: () => tracker.current.clear(),
    hasDirty: () => tracker.current.hasDirty(),
  };
}

export function useLayerCache(maxSize?: number, maxAge?: number) {
  const cache = useRef(new LayerCache(maxSize, maxAge));
  
  return {
    get: (key: string) => cache.current.get(key),
    set: (key: string, canvas: HTMLCanvasElement | OffscreenCanvas) => cache.current.set(key, canvas),
    invalidate: (key: string) => cache.current.invalidate(key),
    clear: () => cache.current.clear(),
  };
}

export function useGPUFeatures(): GPUFeatures {
  const [features] = useState(() => detectGPUFeatures());
  return features;
}
