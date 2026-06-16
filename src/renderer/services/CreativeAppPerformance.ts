// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Creative App Performance Layer
// Specialized optimizations for VINX, Imosion, Prism, Flux, Forge, AXL
// Uses ProPerformanceEngine for enterprise-grade performance
// =============================================================================

import { proEngine, TaskPriority } from './ProPerformanceEngine';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface RenderJob {
  id: string;
  type: 'preview' | 'export' | 'effect' | 'composite';
  priority: TaskPriority;
  frameStart: number;
  frameEnd: number;
  resolution: { width: number; height: number };
  onProgress?: (frame: number, total: number) => void;
  onComplete?: (result: Blob | ImageData) => void;
}

export interface AudioJob {
  id: string;
  type: 'process' | 'render' | 'analyze' | 'mix';
  sampleRate: number;
  channels: number;
  startSample: number;
  endSample: number;
  effects?: string[];
  onProgress?: (percent: number) => void;
  onComplete?: (buffer: AudioBuffer | Float32Array) => void;
}

interface TimelineRegion {
  id: string;
  type: 'clip' | 'effect' | 'transition' | 'audio';
  startTime: number;
  endTime: number;
  trackId: string;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// RENDER QUEUE
// Like Adobe Media Encoder - manages render jobs across apps
// ---------------------------------------------------------------------------

class RenderQueue {
  private jobs: Map<string, RenderJob> = new Map();
  private activeJobs = 0;
  private maxParallel = 2; // Limit parallel renders
  private isPaused = false;

  /**
   * Add a render job to the queue
   */
  enqueue(job: RenderJob): string {
    this.jobs.set(job.id, job);
    this.processQueue();
    return job.id;
  }

  /**
   * Remove a job from the queue
   */
  dequeue(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /**
   * Pause all rendering
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume rendering
   */
  resume(): void {
    this.isPaused = false;
    this.processQueue();
  }

  /**
   * Process the render queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused) return;
    if (this.activeJobs >= this.maxParallel) return;

    // Sort by priority
    const sortedJobs = Array.from(this.jobs.values()).sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 0, high: 1, normal: 2, low: 3, idle: 4
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const nextJob = sortedJobs[0];
    if (!nextJob) return;

    this.activeJobs++;
    this.jobs.delete(nextJob.id);

    try {
      await this.executeRenderJob(nextJob);
    } finally {
      this.activeJobs--;
      this.processQueue();
    }
  }

  /**
   * Execute a single render job
   */
  private async executeRenderJob(job: RenderJob): Promise<void> {
    const totalFrames = job.frameEnd - job.frameStart;
    
    // Process in chunks of 30 frames
    const chunkSize = 30;
    
    for (let frame = job.frameStart; frame <= job.frameEnd; frame += chunkSize) {
      if (this.isPaused) {
        // Re-queue job
        this.jobs.set(job.id, { ...job, frameStart: frame });
        return;
      }

      const endFrame = Math.min(frame + chunkSize, job.frameEnd);
      
      // Yield to UI thread between chunks
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          // Simulate frame processing
          job.onProgress?.(endFrame - job.frameStart, totalFrames);
          resolve();
        });
      });
    }

    // Final result (placeholder)
    job.onComplete?.(new ImageData(job.resolution.width, job.resolution.height));
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queued: this.jobs.size,
      active: this.activeJobs,
      paused: this.isPaused,
    };
  }
}

// ---------------------------------------------------------------------------
// TIMELINE CACHE
// Caches rendered frames and audio for scrubbing
// ---------------------------------------------------------------------------

class TimelineCache {
  private frameCache: Map<string, ImageData> = new Map();
  private audioCache: Map<string, Float32Array> = new Map();
  private maxFrames = 300; // ~10 seconds at 30fps
  private maxAudioSeconds = 30;
  private sampleRate = 48000;

  /**
   * Cache a frame
   */
  cacheFrame(timeCode: number, data: ImageData): void {
    const key = `frame-${timeCode.toFixed(3)}`;
    
    // Evict if over limit
    if (this.frameCache.size >= this.maxFrames) {
      const firstKey = this.frameCache.keys().next().value;
      if (firstKey !== undefined) {
        this.frameCache.delete(firstKey);
      }
    }

    this.frameCache.set(key, data);
  }

  /**
   * Get cached frame
   */
  getFrame(timeCode: number): ImageData | undefined {
    const key = `frame-${timeCode.toFixed(3)}`;
    return this.frameCache.get(key);
  }

  /**
   * Cache audio samples
   */
  cacheAudio(startTime: number, data: Float32Array): void {
    const key = `audio-${startTime.toFixed(3)}`;
    
    // Calculate total cached audio
    let totalSamples = 0;
    for (const samples of this.audioCache.values()) {
      totalSamples += samples.length;
    }

    // Evict if over limit
    const maxSamples = this.maxAudioSeconds * this.sampleRate;
    while (totalSamples > maxSamples && this.audioCache.size > 0) {
      const firstKey = this.audioCache.keys().next().value;
      if (firstKey !== undefined) {
        const firstEntry = this.audioCache.get(firstKey);
        totalSamples -= firstEntry?.length || 0;
        this.audioCache.delete(firstKey);
      } else {
        break;
      }
    }

    this.audioCache.set(key, data);
  }

  /**
   * Get cached audio
   */
  getAudio(startTime: number): Float32Array | undefined {
    const key = `audio-${startTime.toFixed(3)}`;
    return this.audioCache.get(key);
  }

  /**
   * Invalidate frames in a time range
   */
  invalidateRange(startTime: number, endTime: number): void {
    for (const key of this.frameCache.keys()) {
      const time = parseFloat(key.replace('frame-', ''));
      if (time >= startTime && time <= endTime) {
        this.frameCache.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.frameCache.clear();
    this.audioCache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    let audioSamples = 0;
    for (const samples of this.audioCache.values()) {
      audioSamples += samples.length;
    }

    return {
      frames: this.frameCache.size,
      audioSeconds: audioSamples / this.sampleRate,
    };
  }
}

// ---------------------------------------------------------------------------
// EFFECT PROCESSOR
// GPU-accelerated effect processing
// ---------------------------------------------------------------------------

class EffectProcessor {
  private effectCache: Map<string, unknown> = new Map();
  // Each cached value is a full-resolution ImageData buffer (megabytes), so an
  // unbounded cache leaks heavily across an editing session. Bound it with a
  // small LRU (insertion-ordered Map; hits re-insert to the tail, sets evict
  // the head once over the cap).
  private static readonly MAX_EFFECT_CACHE = 24;

  /**
   * Apply an effect chain to image data
   */
  async applyEffects(
    imageData: ImageData,
    effects: Array<{ id: string; type: string; params: Record<string, unknown> }>
  ): Promise<ImageData> {
    let result = imageData;

    for (const effect of effects) {
      // Check cache
      const cacheKey = `${effect.id}-${JSON.stringify(effect.params)}`;
      const cached = this.effectCache.get(cacheKey);
      if (cached) {
        // LRU bump: move this key to the tail so it survives eviction.
        this.effectCache.delete(cacheKey);
        this.effectCache.set(cacheKey, cached);
        result = cached as ImageData;
        continue;
      }

      // Apply effect
      switch (effect.type) {
        case 'blur':
          result = await proEngine.gpu.processImage(result, 'blur', { radius: (effect.params.radius as number) || 5 });
          break;
        case 'brightness':
          result = await proEngine.gpu.processImage(result, 'brightness', { value: (effect.params.value as number) || 1 });
          break;
        case 'grayscale':
          result = await proEngine.gpu.processImage(result, 'grayscale');
          break;
        default:
          // Unknown effect, pass through
          break;
      }

      // Cache result (bounded LRU — evict the oldest once over the cap)
      this.effectCache.set(cacheKey, result);
      if (this.effectCache.size > EffectProcessor.MAX_EFFECT_CACHE) {
        const oldest = this.effectCache.keys().next().value;
        if (oldest !== undefined) this.effectCache.delete(oldest);
      }
    }

    return result;
  }

  /**
   * Clear effect cache
   */
  clearCache(): void {
    this.effectCache.clear();
  }
}

// ---------------------------------------------------------------------------
// WAVEFORM GENERATOR
// Background waveform generation for audio apps
// ---------------------------------------------------------------------------

class WaveformGenerator {
  private waveformCache: Map<string, Float32Array> = new Map();
  // Bound the waveform cache (Float32Arrays per audio buffer) so it can't grow
  // without limit across a long audio-editing session. Same LRU discipline as
  // EffectProcessor.
  private static readonly MAX_WAVEFORM_CACHE = 32;

  /**
   * Generate waveform data for visualization
   */
  async generateWaveform(
    audioBuffer: AudioBuffer,
    samplesPerPixel: number = 100,
    channel: number = 0
  ): Promise<Float32Array> {
    const cacheKey = `${audioBuffer.length}-${samplesPerPixel}-${channel}`;
    const cached = this.waveformCache.get(cacheKey);
    if (cached) {
      // LRU bump.
      this.waveformCache.delete(cacheKey);
      this.waveformCache.set(cacheKey, cached);
      return cached;
    }

    const channelData = audioBuffer.getChannelData(channel);
    const pixelCount = Math.ceil(channelData.length / samplesPerPixel);
    const waveform = new Float32Array(pixelCount * 2); // min/max pairs

    // Process in chunks
    await proEngine.loader.processInChunks({
      items: Array.from({ length: pixelCount }, (_, i) => i),
      chunkSize: 100,
      process: (pixelIndex) => {
        const start = pixelIndex * samplesPerPixel;
        const end = Math.min(start + samplesPerPixel, channelData.length);
        
        let min = 1;
        let max = -1;
        
        for (let i = start; i < end; i++) {
          const sample = channelData[i];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        
        waveform[pixelIndex * 2] = min;
        waveform[pixelIndex * 2 + 1] = max;
      },
    });

    this.waveformCache.set(cacheKey, waveform);
    if (this.waveformCache.size > WaveformGenerator.MAX_WAVEFORM_CACHE) {
      const oldest = this.waveformCache.keys().next().value;
      if (oldest !== undefined) this.waveformCache.delete(oldest);
    }
    return waveform;
  }

  /**
   * Clear waveform cache
   */
  clearCache(): void {
    this.waveformCache.clear();
  }
}

// ---------------------------------------------------------------------------
// UNDO SYSTEM
// Efficient undo/redo with diff-based storage
// ---------------------------------------------------------------------------

interface UndoEntry {
  id: string;
  timestamp: number;
  label: string;
  snapshot?: unknown;
  patches?: Array<{ op: 'add' | 'remove' | 'replace'; path: string; value?: unknown }>;
}

class UndoSystem {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private maxHistory = 50;
  private currentState: unknown = null;

  /**
   * Push a new undo entry
   */
  push(label: string, newState: unknown): void {
    // Calculate diff (simplified - in production use a proper diff library)
    const entry: UndoEntry = {
      id: `undo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      label,
      snapshot: this.currentState, // Store previous state
    };

    this.undoStack.push(entry);
    this.redoStack = []; // Clear redo on new action
    this.currentState = newState;

    // Limit history
    while (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo the last action
   */
  undo(): unknown | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    const previous = this.currentState;
    this.currentState = entry.snapshot;
    
    this.redoStack.push({
      ...entry,
      snapshot: previous,
    });

    return this.currentState;
  }

  /**
   * Redo the last undone action
   */
  redo(): unknown | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    const previous = this.currentState;
    this.currentState = entry.snapshot;
    
    this.undoStack.push({
      ...entry,
      snapshot: previous,
    });

    return this.currentState;
  }

  /**
   * Get history for UI display
   */
  getHistory(): Array<{ id: string; label: string; timestamp: number }> {
    return this.undoStack.map(e => ({
      id: e.id,
      label: e.label,
      timestamp: e.timestamp,
    }));
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentState = null;
  }
}

// ---------------------------------------------------------------------------
// AUTOSAVE SYSTEM
// Background autosave with throttling
// ---------------------------------------------------------------------------

class AutosaveSystem {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSaveTime = 0;
  private minInterval = 30000; // 30 seconds minimum between saves
  private isDirty = false;
  private saveCallback: (() => Promise<void>) | null = null;

  /**
   * Configure autosave
   */
  configure(options: {
    interval: number;
    onSave: () => Promise<void>;
  }): void {
    this.minInterval = options.interval;
    this.saveCallback = options.onSave;
  }

  /**
   * Mark project as dirty (needs save)
   */
  markDirty(): void {
    this.isDirty = true;
    this.scheduleSave();
  }

  /**
   * Schedule an autosave
   */
  private scheduleSave(): void {
    if (this.saveTimer) return;
    if (!this.saveCallback) return;

    const timeSinceLastSave = Date.now() - this.lastSaveTime;
    const delay = Math.max(0, this.minInterval - timeSinceLastSave);

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      
      if (!this.isDirty) return;
      
      try {
        await proEngine.runBackground('autosave', async () => {
          await this.saveCallback?.();
        }, 'low');
        
        this.isDirty = false;
        this.lastSaveTime = Date.now();
      } catch (error) {
        console.error('[Autosave] Failed:', error);
        // Retry later
        this.scheduleSave();
      }
    }, delay);
  }

  /**
   * Force immediate save
   */
  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.saveCallback) {
      await this.saveCallback();
      this.isDirty = false;
      this.lastSaveTime = Date.now();
    }
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
  }
}

// ---------------------------------------------------------------------------
// CREATIVE APP CONTEXT
// Unified context for all creative apps
// ---------------------------------------------------------------------------

export class CreativeAppContext {
  public renderQueue: RenderQueue;
  public timelineCache: TimelineCache;
  public effectProcessor: EffectProcessor;
  public waveformGenerator: WaveformGenerator;
  public undoSystem: UndoSystem;
  public autosave: AutosaveSystem;
  
  private appId: string;

  constructor(appId: string) {
    this.appId = appId;
    this.renderQueue = new RenderQueue();
    this.timelineCache = new TimelineCache();
    this.effectProcessor = new EffectProcessor();
    this.waveformGenerator = new WaveformGenerator();
    this.undoSystem = new UndoSystem();
    this.autosave = new AutosaveSystem();
  }

  /**
   * Mark a timeline region as dirty
   */
  markRegionDirty(region: TimelineRegion): void {
    proEngine.markForUpdate(
      `${this.appId}-${region.id}`,
      region.type,
      [] // Dependencies would be listed here
    );
    
    // Invalidate frame cache
    this.timelineCache.invalidateRange(region.startTime, region.endTime);
    
    // Mark for autosave
    this.autosave.markDirty();
  }

  /**
   * Get performance stats
   */
  getStats() {
    return {
      renderQueue: this.renderQueue.getStatus(),
      cache: this.timelineCache.getStats(),
      canUndo: this.undoSystem.canUndo(),
      canRedo: this.undoSystem.canRedo(),
      hasUnsavedChanges: this.autosave.hasUnsavedChanges(),
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.timelineCache.clear();
    this.effectProcessor.clearCache();
    this.waveformGenerator.clearCache();
    this.undoSystem.clear();
    this.autosave.destroy();
  }
}

// ---------------------------------------------------------------------------
// REACT HOOKS FOR CREATIVE APPS
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';

/**
 * Hook for using creative app context
 */
export function useCreativeApp(appId: string): CreativeAppContext {
  const contextRef = useRef<CreativeAppContext | null>(null);
  
  if (!contextRef.current) {
    contextRef.current = new CreativeAppContext(appId);
  }

  useEffect(() => {
    return () => {
      contextRef.current?.destroy();
    };
  }, []);

  return contextRef.current;
}

/**
 * Hook for render queue status
 */
export function useRenderQueue(context: CreativeAppContext) {
  const [status, setStatus] = useState(context.renderQueue.getStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(context.renderQueue.getStatus());
    }, 500);

    return () => clearInterval(interval);
  }, [context]);

  const enqueue = useCallback((job: Omit<RenderJob, 'id'>) => {
    const id = `render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    context.renderQueue.enqueue({ ...job, id });
    return id;
  }, [context]);

  return { status, enqueue };
}

/**
 * Hook for undo/redo
 */
export function useUndo<T>(context: CreativeAppContext) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [history, setHistory] = useState(context.undoSystem.getHistory());

  const updateState = useCallback(() => {
    setCanUndo(context.undoSystem.canUndo());
    setCanRedo(context.undoSystem.canRedo());
    setHistory(context.undoSystem.getHistory());
  }, [context]);

  const push = useCallback((label: string, state: T) => {
    context.undoSystem.push(label, state);
    updateState();
  }, [context, updateState]);

  const undo = useCallback(() => {
    const result = context.undoSystem.undo() as T | null;
    updateState();
    return result;
  }, [context, updateState]);

  const redo = useCallback(() => {
    const result = context.undoSystem.redo() as T | null;
    updateState();
    return result;
  }, [context, updateState]);

  return { canUndo, canRedo, history, push, undo, redo };
}

/**
 * Hook for autosave
 */
export function useAutosave(
  context: CreativeAppContext,
  saveFunction: () => Promise<void>,
  intervalMs: number = 30000
) {
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    context.autosave.configure({
      interval: intervalMs,
      onSave: async () => {
        await saveFunction();
        setLastSaved(new Date());
        setHasUnsaved(false);
      },
    });
  }, [context, saveFunction, intervalMs]);

  const markDirty = useCallback(() => {
    context.autosave.markDirty();
    setHasUnsaved(true);
  }, [context]);

  const saveNow = useCallback(async () => {
    await context.autosave.saveNow();
    setLastSaved(new Date());
    setHasUnsaved(false);
  }, [context]);

  return { hasUnsaved, lastSaved, markDirty, saveNow };
}

// ---------------------------------------------------------------------------
// EXPORT SINGLETON INSTANCES
// ---------------------------------------------------------------------------

export const renderQueue = new RenderQueue();
export const effectProcessor = new EffectProcessor();
export const waveformGenerator = new WaveformGenerator();
