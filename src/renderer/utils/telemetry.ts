// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Telemetry & Analytics System (Phase H: Items 701-725)
// Internal tracking for user interactions, performance, and diagnostics
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GestureEvent {
  type: 'swipe' | 'pinch' | 'tap' | 'rotate' | 'pan' | 'longpress';
  timestamp: number;
  duration: number;
  velocity?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  target?: string;
  appId?: string;
}

export interface ClickEvent {
  x: number;
  y: number;
  timestamp: number;
  target: string;
  appId?: string;
}

export interface HeatmapData {
  appId: string;
  clicks: { x: number; y: number; count: number }[];
  width: number;
  height: number;
}

export interface SessionReplayFrame {
  timestamp: number;
  type: 'dom' | 'scroll' | 'input' | 'click' | 'resize';
  data: unknown;
}

export interface FeatureUsage {
  featureId: string;
  count: number;
  lastUsed: number;
  totalDuration: number;
}

export interface NavigationFlow {
  from: string;
  to: string;
  timestamp: number;
  duration: number;
}

export interface ScrollDepthData {
  appId: string;
  maxDepth: number;
  timeAtDepths: Record<number, number>;
}

export interface TaskTiming {
  taskId: string;
  startTime: number;
  endTime?: number;
  completed: boolean;
  steps: { name: string; duration: number }[];
}

export interface InputMethodUsage {
  keyboard: number;
  mouse: number;
  touch: number;
  pen: number;
  gamepad: number;
}

export interface FrameTiming {
  timestamp: number;
  duration: number;
  fps: number;
  jank: boolean;
}

export interface MemorySnapshot {
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface LongTask {
  timestamp: number;
  duration: number;
  name: string;
  attribution: string[];
}

export interface PaintTiming {
  fcp: number;
  lcp: number;
  fid: number;
  cls: number;
  ttfb: number;
}

export interface InteractionLatency {
  type: string;
  startTime: number;
  processingTime: number;
  paintTime: number;
  totalLatency: number;
}

export interface ResourceTiming {
  name: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  decodedBodySize: number;
}

export interface TelemetryConsent {
  analytics: boolean;
  performance: boolean;
  errorReporting: boolean;
  sessionReplay: boolean;
}

export interface Breadcrumb {
  timestamp: number;
  category: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

export interface HealthStatus {
  cpu: number;
  memory: number;
  fps: number;
  networkLatency: number;
  errorRate: number;
  status: 'healthy' | 'degraded' | 'critical';
}

// ---------------------------------------------------------------------------
// 701. Gesture Event Collector
// ---------------------------------------------------------------------------

class GestureCollector {
  private events: GestureEvent[] = [];
  private maxEvents = 1000;

  record(event: Omit<GestureEvent, 'timestamp'>): void {
    this.events.push({ ...event, timestamp: Date.now() });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  getEvents(since?: number): GestureEvent[] {
    if (since) {
      return this.events.filter(e => e.timestamp >= since);
    }
    return [...this.events];
  }

  getPatterns(): Record<string, number> {
    const patterns: Record<string, number> = {};
    this.events.forEach(e => {
      patterns[e.type] = (patterns[e.type] || 0) + 1;
    });
    return patterns;
  }

  clear(): void {
    this.events = [];
  }
}

export const gestureCollector = new GestureCollector();

// ---------------------------------------------------------------------------
// 702. Interaction Heatmap Recorder
// ---------------------------------------------------------------------------

class HeatmapRecorder {
  private heatmaps: Map<string, HeatmapData> = new Map();
  private gridSize = 20;

  recordClick(appId: string, x: number, y: number, width: number, height: number): void {
    let heatmap = this.heatmaps.get(appId);
    if (!heatmap) {
      heatmap = { appId, clicks: [], width, height };
      this.heatmaps.set(appId, heatmap);
    }

    const gridX = Math.floor(x / this.gridSize) * this.gridSize;
    const gridY = Math.floor(y / this.gridSize) * this.gridSize;

    const existing = heatmap.clicks.find(c => c.x === gridX && c.y === gridY);
    if (existing) {
      existing.count++;
    } else {
      heatmap.clicks.push({ x: gridX, y: gridY, count: 1 });
    }
  }

  getHeatmap(appId: string): HeatmapData | undefined {
    return this.heatmaps.get(appId);
  }

  getAllHeatmaps(): HeatmapData[] {
    return Array.from(this.heatmaps.values());
  }

  clear(appId?: string): void {
    if (appId) {
      this.heatmaps.delete(appId);
    } else {
      this.heatmaps.clear();
    }
  }

  exportAsCanvas(appId: string): HTMLCanvasElement | null {
    const heatmap = this.heatmaps.get(appId);
    if (!heatmap) return null;

    const canvas = document.createElement('canvas');
    canvas.width = heatmap.width;
    canvas.height = heatmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const maxCount = Math.max(...heatmap.clicks.map(c => c.count), 1);

    heatmap.clicks.forEach(({ x, y, count }) => {
      const intensity = count / maxCount;
      const gradient = ctx.createRadialGradient(x + 10, y + 10, 0, x + 10, y + 10, 30);
      gradient.addColorStop(0, `rgba(255, 0, 0, ${intensity})`);
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 20, y - 20, 60, 60);
    });

    return canvas;
  }
}

export const heatmapRecorder = new HeatmapRecorder();

// ---------------------------------------------------------------------------
// 703. Session Replay Infrastructure
// ---------------------------------------------------------------------------

class SessionReplayRecorder {
  private frames: SessionReplayFrame[] = [];
  private recording = false;
  private maxFrames = 5000;
  private mutationObserver: MutationObserver | null = null;

  start(): void {
    if (this.recording) return;
    this.recording = true;
    this.frames = [];

    // Record initial DOM state
    this.recordFrame('dom', this.sanitizeDOM(document.body));

    // Observe DOM mutations
    this.mutationObserver = new MutationObserver((mutations) => {
      const sanitized = mutations.map(m => ({
        type: m.type,
        target: this.getSelector(m.target as Element),
        addedNodes: m.addedNodes.length,
        removedNodes: m.removedNodes.length,
        attributeName: m.attributeName,
      }));
      this.recordFrame('dom', sanitized);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Track scroll
    window.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('input', this.handleInput, true);
    window.addEventListener('resize', this.handleResize);
  }

  stop(): void {
    this.recording = false;
    this.mutationObserver?.disconnect();
    window.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('input', this.handleInput, true);
    window.removeEventListener('resize', this.handleResize);
  }

  private handleScroll = (e: Event) => {
    const target = e.target as Element;
    this.recordFrame('scroll', {
      target: this.getSelector(target),
      scrollTop: target.scrollTop || window.scrollY,
      scrollLeft: target.scrollLeft || window.scrollX,
    });
  };

  private handleClick = (e: MouseEvent) => {
    this.recordFrame('click', {
      x: e.clientX,
      y: e.clientY,
      target: this.getSelector(e.target as Element),
    });
  };

  private handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    // Don't record password fields
    if (target.type === 'password') return;
    this.recordFrame('input', {
      target: this.getSelector(target),
      value: target.value?.substring(0, 100), // Limit value length
    });
  };

  private handleResize = () => {
    this.recordFrame('resize', {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  private recordFrame(type: SessionReplayFrame['type'], data: unknown): void {
    if (!this.recording) return;
    this.frames.push({ timestamp: Date.now(), type, data });
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  private getSelector(el: Element | null): string {
    if (!el) return '';
    if (el.id) return `#${el.id}`;
    if (el.className) return `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')}`;
    return el.tagName.toLowerCase();
  }

  private sanitizeDOM(el: Element): unknown {
    // Return a privacy-safe representation
    return {
      tag: el.tagName,
      id: el.id,
      classes: el.className,
      children: Array.from(el.children).slice(0, 50).map(c => this.sanitizeDOM(c)),
    };
  }

  getFrames(since?: number): SessionReplayFrame[] {
    if (since) {
      return this.frames.filter(f => f.timestamp >= since);
    }
    return [...this.frames];
  }

  exportReplay(): string {
    return JSON.stringify(this.frames);
  }
}

export const sessionReplayRecorder = new SessionReplayRecorder();

// ---------------------------------------------------------------------------
// 704. Feature Usage Counter
// ---------------------------------------------------------------------------

class FeatureUsageTracker {
  private usage: Map<string, FeatureUsage> = new Map();
  private activeFeatures: Map<string, number> = new Map();

  trackStart(featureId: string): void {
    this.activeFeatures.set(featureId, Date.now());
  }

  trackEnd(featureId: string): void {
    const startTime = this.activeFeatures.get(featureId);
    if (!startTime) return;

    const duration = Date.now() - startTime;
    let usage = this.usage.get(featureId);

    if (!usage) {
      usage = { featureId, count: 0, lastUsed: 0, totalDuration: 0 };
      this.usage.set(featureId, usage);
    }

    usage.count++;
    usage.lastUsed = Date.now();
    usage.totalDuration += duration;
    this.activeFeatures.delete(featureId);
  }

  track(featureId: string): void {
    let usage = this.usage.get(featureId);
    if (!usage) {
      usage = { featureId, count: 0, lastUsed: 0, totalDuration: 0 };
      this.usage.set(featureId, usage);
    }
    usage.count++;
    usage.lastUsed = Date.now();
  }

  getUsage(featureId: string): FeatureUsage | undefined {
    return this.usage.get(featureId);
  }

  getAllUsage(): FeatureUsage[] {
    return Array.from(this.usage.values());
  }

  getTopFeatures(limit = 10): FeatureUsage[] {
    return this.getAllUsage()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  clear(): void {
    this.usage.clear();
    this.activeFeatures.clear();
  }
}

export const featureUsageTracker = new FeatureUsageTracker();

// ---------------------------------------------------------------------------
// 705. Navigation Flow Tracker
// ---------------------------------------------------------------------------

class NavigationFlowTracker {
  private flows: NavigationFlow[] = [];
  private currentApp: string | null = null;
  private lastTransitionTime = 0;
  private maxFlows = 500;

  trackNavigation(toApp: string): void {
    const now = Date.now();
    if (this.currentApp && this.currentApp !== toApp) {
      this.flows.push({
        from: this.currentApp,
        to: toApp,
        timestamp: now,
        duration: now - this.lastTransitionTime,
      });

      if (this.flows.length > this.maxFlows) {
        this.flows.shift();
      }
    }
    this.currentApp = toApp;
    this.lastTransitionTime = now;
  }

  getFlows(since?: number): NavigationFlow[] {
    if (since) {
      return this.flows.filter(f => f.timestamp >= since);
    }
    return [...this.flows];
  }

  getCommonPaths(): { path: string; count: number }[] {
    const pathCounts: Record<string, number> = {};
    this.flows.forEach(f => {
      const path = `${f.from} -> ${f.to}`;
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    });

    return Object.entries(pathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  }

  clear(): void {
    this.flows = [];
  }
}

export const navigationFlowTracker = new NavigationFlowTracker();

// ---------------------------------------------------------------------------
// 706. Error Correlation with User Actions
// ---------------------------------------------------------------------------

class ErrorCorrelator {
  private actionBuffer: { action: string; timestamp: number; data?: unknown }[] = [];
  private errors: { error: Error; actions: { action: string; timestamp: number; data?: unknown }[]; timestamp: number }[] = [];
  private bufferSize = 50;

  recordAction(action: string, data?: unknown): void {
    this.actionBuffer.push({ action, timestamp: Date.now(), data });
    if (this.actionBuffer.length > this.bufferSize) {
      this.actionBuffer.shift();
    }
  }

  recordError(error: Error): void {
    this.errors.push({
      error,
      actions: [...this.actionBuffer],
      timestamp: Date.now(),
    });
  }

  getErrorsWithContext(): typeof this.errors {
    return [...this.errors];
  }

  getLastError(): typeof this.errors[0] | undefined {
    return this.errors[this.errors.length - 1];
  }

  clear(): void {
    this.actionBuffer = [];
    this.errors = [];
  }
}

export const errorCorrelator = new ErrorCorrelator();

// ---------------------------------------------------------------------------
// 707. Scroll Depth Tracking
// ---------------------------------------------------------------------------

class ScrollDepthTracker {
  private data: Map<string, ScrollDepthData> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  startTracking(appId: string, element: HTMLElement): void {
    if (this.intervals.has(appId)) return;

    const scrollData: ScrollDepthData = {
      appId,
      maxDepth: 0,
      timeAtDepths: {},
    };
    this.data.set(appId, scrollData);

    const track = () => {
      const scrollHeight = element.scrollHeight - element.clientHeight;
      const depth = scrollHeight > 0 ? Math.round((element.scrollTop / scrollHeight) * 100) : 0;
      
      scrollData.maxDepth = Math.max(scrollData.maxDepth, depth);
      
      const depthBucket = Math.floor(depth / 10) * 10;
      scrollData.timeAtDepths[depthBucket] = (scrollData.timeAtDepths[depthBucket] || 0) + 1;
    };

    const interval = setInterval(track, 1000);
    this.intervals.set(appId, interval);
  }

  stopTracking(appId: string): void {
    const interval = this.intervals.get(appId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(appId);
    }
  }

  getData(appId: string): ScrollDepthData | undefined {
    return this.data.get(appId);
  }

  getAllData(): ScrollDepthData[] {
    return Array.from(this.data.values());
  }

  clear(): void {
    this.intervals.forEach(i => clearInterval(i));
    this.intervals.clear();
    this.data.clear();
  }
}

export const scrollDepthTracker = new ScrollDepthTracker();

// ---------------------------------------------------------------------------
// 708. Time-on-Task Measurement
// ---------------------------------------------------------------------------

class TaskTimingTracker {
  private tasks: Map<string, TaskTiming> = new Map();

  startTask(taskId: string): void {
    this.tasks.set(taskId, {
      taskId,
      startTime: Date.now(),
      completed: false,
      steps: [],
    });
  }

  recordStep(taskId: string, stepName: string, duration: number): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.steps.push({ name: stepName, duration });
    }
  }

  completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.endTime = Date.now();
      task.completed = true;
    }
  }

  abandonTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.endTime = Date.now();
      task.completed = false;
    }
  }

  getTask(taskId: string): TaskTiming | undefined {
    return this.tasks.get(taskId);
  }

  getAverageTaskTime(taskId: string): number {
    const completedTasks = Array.from(this.tasks.values())
      .filter(t => t.taskId === taskId && t.completed && t.endTime);
    
    if (completedTasks.length === 0) return 0;
    
    const totalTime = completedTasks.reduce((sum, t) => sum + (t.endTime! - t.startTime), 0);
    return totalTime / completedTasks.length;
  }

  getCompletionRate(): number {
    const tasks = Array.from(this.tasks.values()).filter(t => t.endTime);
    if (tasks.length === 0) return 0;
    return tasks.filter(t => t.completed).length / tasks.length;
  }

  clear(): void {
    this.tasks.clear();
  }
}

export const taskTimingTracker = new TaskTimingTracker();

// ---------------------------------------------------------------------------
// 709. Abandonment Detection
// ---------------------------------------------------------------------------

class AbandonmentDetector {
  private workflows: Map<string, { steps: string[]; requiredSteps: string[]; startTime: number }> = new Map();
  private abandonments: { workflowId: string; completedSteps: string[]; missingSteps: string[]; timestamp: number }[] = [];

  startWorkflow(workflowId: string, requiredSteps: string[]): void {
    this.workflows.set(workflowId, {
      steps: [],
      requiredSteps,
      startTime: Date.now(),
    });
  }

  recordStep(workflowId: string, step: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.steps.push(step);
    }
  }

  checkAbandonment(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    const missingSteps = workflow.requiredSteps.filter(s => !workflow.steps.includes(s));
    if (missingSteps.length > 0) {
      this.abandonments.push({
        workflowId,
        completedSteps: workflow.steps,
        missingSteps,
        timestamp: Date.now(),
      });
      return true;
    }
    return false;
  }

  completeWorkflow(workflowId: string): void {
    this.checkAbandonment(workflowId);
    this.workflows.delete(workflowId);
  }

  getAbandonments(): typeof this.abandonments {
    return [...this.abandonments];
  }

  getAbandonmentRate(): number {
    const total = this.abandonments.length + 
      Array.from(this.workflows.values()).filter(w => 
        w.requiredSteps.every(s => w.steps.includes(s))
      ).length;
    
    if (total === 0) return 0;
    return this.abandonments.length / total;
  }

  clear(): void {
    this.workflows.clear();
    this.abandonments = [];
  }
}

export const abandonmentDetector = new AbandonmentDetector();

// ---------------------------------------------------------------------------
// 710. Input Method Tracking
// ---------------------------------------------------------------------------

class InputMethodTracker {
  private usage: InputMethodUsage = {
    keyboard: 0,
    mouse: 0,
    touch: 0,
    pen: 0,
    gamepad: 0,
  };
  private listeners: (() => void)[] = [];

  start(): void {
    const keyHandler = () => { this.usage.keyboard++; };
    const mouseHandler = () => { this.usage.mouse++; };
    const touchHandler = () => { this.usage.touch++; };
    const pointerHandler = (e: PointerEvent) => {
      if (e.pointerType === 'pen') this.usage.pen++;
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('mousedown', mouseHandler);
    window.addEventListener('touchstart', touchHandler);
    window.addEventListener('pointerdown', pointerHandler);

    this.listeners.push(
      () => window.removeEventListener('keydown', keyHandler),
      () => window.removeEventListener('mousedown', mouseHandler),
      () => window.removeEventListener('touchstart', touchHandler),
      () => window.removeEventListener('pointerdown', pointerHandler),
    );

    // Gamepad polling
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads?.() || [];
      for (const gp of gamepads) {
        if (gp?.buttons.some(b => b.pressed)) {
          this.usage.gamepad++;
        }
      }
    };
    const gpInterval = setInterval(pollGamepad, 100);
    this.listeners.push(() => clearInterval(gpInterval));
  }

  stop(): void {
    this.listeners.forEach(cleanup => cleanup());
    this.listeners = [];
  }

  getUsage(): InputMethodUsage {
    return { ...this.usage };
  }

  getPrimaryInputMethod(): keyof InputMethodUsage {
    const entries = Object.entries(this.usage) as [keyof InputMethodUsage, number][];
    return entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
  }

  reset(): void {
    this.usage = { keyboard: 0, mouse: 0, touch: 0, pen: 0, gamepad: 0 };
  }
}

export const inputMethodTracker = new InputMethodTracker();

// ---------------------------------------------------------------------------
// 711. Frame Timing Collector (Jank Detection)
// ---------------------------------------------------------------------------

class FrameTimingCollector {
  private timings: FrameTiming[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private maxTimings = 1000;
  private jankThreshold = 16.67 * 2; // 2 frames at 60fps

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();

    const tick = (now: number) => {
      const duration = now - this.lastTime;
      const fps = 1000 / duration;
      const jank = duration > this.jankThreshold;

      this.timings.push({ timestamp: now, duration, fps, jank });
      if (this.timings.length > this.maxTimings) {
        this.timings.shift();
      }

      this.lastTime = now;
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getTimings(since?: number): FrameTiming[] {
    if (since) {
      return this.timings.filter(t => t.timestamp >= since);
    }
    return [...this.timings];
  }

  getJankFrames(): FrameTiming[] {
    return this.timings.filter(t => t.jank);
  }

  getAverageFPS(): number {
    if (this.timings.length === 0) return 0;
    return this.timings.reduce((sum, t) => sum + t.fps, 0) / this.timings.length;
  }

  getJankPercentage(): number {
    if (this.timings.length === 0) return 0;
    return (this.getJankFrames().length / this.timings.length) * 100;
  }

  clear(): void {
    this.timings = [];
  }
}

export const frameTimingCollector = new FrameTimingCollector();

// ---------------------------------------------------------------------------
// 712. Memory Pressure Monitoring
// ---------------------------------------------------------------------------

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private maxSnapshots = 500;

  start(intervalMs = 5000): void {
    if (this.intervalId) return;

    const takeSnapshot = () => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (memory) {
        this.snapshots.push({
          timestamp: Date.now(),
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        });

        if (this.snapshots.length > this.maxSnapshots) {
          this.snapshots.shift();
        }
      }
    };

    takeSnapshot();
    this.intervalId = setInterval(takeSnapshot, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getSnapshots(since?: number): MemorySnapshot[] {
    if (since) {
      return this.snapshots.filter(s => s.timestamp >= since);
    }
    return [...this.snapshots];
  }

  getCurrentUsage(): number {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return 0;
    return (latest.usedJSHeapSize / latest.jsHeapSizeLimit) * 100;
  }

  isUnderPressure(): boolean {
    return this.getCurrentUsage() > 80;
  }

  getMemoryTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.snapshots.length < 10) return 'stable';
    
    const recent = this.snapshots.slice(-10);
    const first = recent[0].usedJSHeapSize;
    const last = recent[recent.length - 1].usedJSHeapSize;
    const diff = last - first;
    
    if (diff > first * 0.1) return 'increasing';
    if (diff < -first * 0.1) return 'decreasing';
    return 'stable';
  }

  clear(): void {
    this.snapshots = [];
  }
}

export const memoryMonitor = new MemoryMonitor();

// ---------------------------------------------------------------------------
// 713. Long Task Detection
// ---------------------------------------------------------------------------

class LongTaskDetector {
  private tasks: LongTask[] = [];
  private observer: PerformanceObserver | null = null;
  private maxTasks = 200;

  start(): void {
    if (this.observer) return;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.tasks.push({
            timestamp: entry.startTime,
            duration: entry.duration,
            name: entry.name,
            attribution: (entry as unknown as { attribution?: { name: string }[] }).attribution?.map(a => a.name) || [],
          });

          if (this.tasks.length > this.maxTasks) {
            this.tasks.shift();
          }
        }
      });

      this.observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long task API not supported
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  getTasks(since?: number): LongTask[] {
    if (since) {
      return this.tasks.filter(t => t.timestamp >= since);
    }
    return [...this.tasks];
  }

  getAverageDuration(): number {
    if (this.tasks.length === 0) return 0;
    return this.tasks.reduce((sum, t) => sum + t.duration, 0) / this.tasks.length;
  }

  getTaskCount(): number {
    return this.tasks.length;
  }

  clear(): void {
    this.tasks = [];
  }
}

export const longTaskDetector = new LongTaskDetector();

// ---------------------------------------------------------------------------
// 714. Paint Timing Metrics
// ---------------------------------------------------------------------------

class PaintTimingCollector {
  private metrics: Partial<PaintTiming> = {};
  private observer: PerformanceObserver | null = null;

  start(): void {
    // Get existing paint entries
    const paintEntries = performance.getEntriesByType('paint');
    for (const entry of paintEntries) {
      if (entry.name === 'first-contentful-paint') {
        this.metrics.fcp = entry.startTime;
      }
    }

    // Observe LCP
    try {
      this.observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { value?: number };
        
        if (lastEntry.entryType === 'largest-contentful-paint') {
          this.metrics.lcp = lastEntry.startTime;
        } else if (lastEntry.entryType === 'first-input') {
          this.metrics.fid = (lastEntry as unknown as { processingStart: number }).processingStart - lastEntry.startTime;
        } else if (lastEntry.entryType === 'layout-shift' && !(lastEntry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
          this.metrics.cls = (this.metrics.cls || 0) + (lastEntry.value || 0);
        }
      });

      this.observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observer.observe({ type: 'first-input', buffered: true });
      this.observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Performance observer types not supported
    }

    // Get TTFB from navigation timing
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navEntry) {
      this.metrics.ttfb = navEntry.responseStart - navEntry.requestStart;
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  getMetrics(): Partial<PaintTiming> {
    return { ...this.metrics };
  }

  getWebVitalsScore(): 'good' | 'needs-improvement' | 'poor' {
    const { lcp, fid, cls } = this.metrics;
    
    // Web Vitals thresholds
    const lcpGood = lcp !== undefined && lcp <= 2500;
    const fidGood = fid !== undefined && fid <= 100;
    const clsGood = cls !== undefined && cls <= 0.1;
    
    if (lcpGood && fidGood && clsGood) return 'good';
    
    const lcpPoor = lcp !== undefined && lcp > 4000;
    const fidPoor = fid !== undefined && fid > 300;
    const clsPoor = cls !== undefined && cls > 0.25;
    
    if (lcpPoor || fidPoor || clsPoor) return 'poor';
    
    return 'needs-improvement';
  }
}

export const paintTimingCollector = new PaintTimingCollector();

// ---------------------------------------------------------------------------
// 715. Interaction Latency Measurement
// ---------------------------------------------------------------------------

class InteractionLatencyTracker {
  private latencies: InteractionLatency[] = [];
  private pendingInteractions: Map<string, { type: string; startTime: number }> = new Map();
  private maxLatencies = 500;

  startInteraction(id: string, type: string): void {
    this.pendingInteractions.set(id, { type, startTime: performance.now() });
  }

  recordProcessingComplete(id: string): number {
    const interaction = this.pendingInteractions.get(id);
    if (!interaction) return 0;
    return performance.now() - interaction.startTime;
  }

  completeInteraction(id: string): void {
    const interaction = this.pendingInteractions.get(id);
    if (!interaction) return;

    const paintTime = performance.now();
    const processingTime = this.recordProcessingComplete(id);
    
    this.latencies.push({
      type: interaction.type,
      startTime: interaction.startTime,
      processingTime,
      paintTime: paintTime - interaction.startTime - processingTime,
      totalLatency: paintTime - interaction.startTime,
    });

    if (this.latencies.length > this.maxLatencies) {
      this.latencies.shift();
    }

    this.pendingInteractions.delete(id);
  }

  getLatencies(type?: string): InteractionLatency[] {
    if (type) {
      return this.latencies.filter(l => l.type === type);
    }
    return [...this.latencies];
  }

  getAverageLatency(type?: string): number {
    const latencies = this.getLatencies(type);
    if (latencies.length === 0) return 0;
    return latencies.reduce((sum, l) => sum + l.totalLatency, 0) / latencies.length;
  }

  getP95Latency(type?: string): number {
    const latencies = this.getLatencies(type).map(l => l.totalLatency).sort((a, b) => a - b);
    if (latencies.length === 0) return 0;
    const index = Math.floor(latencies.length * 0.95);
    return latencies[index] || 0;
  }

  clear(): void {
    this.latencies = [];
    this.pendingInteractions.clear();
  }
}

export const interactionLatencyTracker = new InteractionLatencyTracker();

// ---------------------------------------------------------------------------
// 716. Resource Loading Waterfall
// ---------------------------------------------------------------------------

class ResourceWaterfallCollector {
  private resources: ResourceTiming[] = [];

  collect(): void {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    this.resources = entries.map(entry => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize,
      decodedBodySize: entry.decodedBodySize,
    }));
  }

  getResources(): ResourceTiming[] {
    return [...this.resources];
  }

  getResourcesByType(type: string): ResourceTiming[] {
    return this.resources.filter(r => r.initiatorType === type);
  }

  getTotalTransferSize(): number {
    return this.resources.reduce((sum, r) => sum + r.transferSize, 0);
  }

  getSlowestResources(limit = 10): ResourceTiming[] {
    return [...this.resources]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  clear(): void {
    this.resources = [];
    performance.clearResourceTimings();
  }
}

export const resourceWaterfallCollector = new ResourceWaterfallCollector();

// ---------------------------------------------------------------------------
// 717. React Render Profiler Integration
// ---------------------------------------------------------------------------

interface RenderProfile {
  componentName: string;
  phase: 'mount' | 'update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

class RenderProfiler {
  private profiles: RenderProfile[] = [];
  private maxProfiles = 1000;

  onRender(
    id: string,
    phase: 'mount' | 'update',
    actualDuration: number,
    baseDuration: number,
    startTime: number,
    commitTime: number
  ): void {
    this.profiles.push({
      componentName: id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });

    if (this.profiles.length > this.maxProfiles) {
      this.profiles.shift();
    }
  }

  getProfiles(componentName?: string): RenderProfile[] {
    if (componentName) {
      return this.profiles.filter(p => p.componentName === componentName);
    }
    return [...this.profiles];
  }

  getSlowestRenders(limit = 10): RenderProfile[] {
    return [...this.profiles]
      .sort((a, b) => b.actualDuration - a.actualDuration)
      .slice(0, limit);
  }

  getAverageRenderTime(componentName: string): number {
    const componentProfiles = this.getProfiles(componentName);
    if (componentProfiles.length === 0) return 0;
    return componentProfiles.reduce((sum, p) => sum + p.actualDuration, 0) / componentProfiles.length;
  }

  clear(): void {
    this.profiles = [];
  }
}

export const renderProfiler = new RenderProfiler();

// ---------------------------------------------------------------------------
// 718. Native Module Call Latency
// ---------------------------------------------------------------------------

class NativeCallTracker {
  private calls: { module: string; method: string; duration: number; timestamp: number }[] = [];
  private maxCalls = 500;

  async trackCall<T>(module: string, method: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.calls.push({ module, method, duration, timestamp: Date.now() });
      if (this.calls.length > this.maxCalls) {
        this.calls.shift();
      }
    }
  }

  getCalls(module?: string): typeof this.calls {
    if (module) {
      return this.calls.filter(c => c.module === module);
    }
    return [...this.calls];
  }

  getAverageLatency(module: string, method?: string): number {
    const filtered = this.calls.filter(c => 
      c.module === module && (!method || c.method === method)
    );
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, c) => sum + c.duration, 0) / filtered.length;
  }

  getSlowestCalls(limit = 10): typeof this.calls {
    return [...this.calls]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  clear(): void {
    this.calls = [];
  }
}

export const nativeCallTracker = new NativeCallTracker();

// ---------------------------------------------------------------------------
// 719. Disk I/O Performance Metrics
// ---------------------------------------------------------------------------

class DiskIOTracker {
  private operations: { type: 'read' | 'write'; path: string; size: number; duration: number; timestamp: number }[] = [];
  private maxOps = 500;

  recordOperation(type: 'read' | 'write', path: string, size: number, duration: number): void {
    this.operations.push({ type, path, size, duration, timestamp: Date.now() });
    if (this.operations.length > this.maxOps) {
      this.operations.shift();
    }
  }

  getOperations(type?: 'read' | 'write'): typeof this.operations {
    if (type) {
      return this.operations.filter(o => o.type === type);
    }
    return [...this.operations];
  }

  getThroughput(type: 'read' | 'write', windowMs = 60000): number {
    const now = Date.now();
    const recentOps = this.operations.filter(o => 
      o.type === type && o.timestamp >= now - windowMs
    );
    const totalSize = recentOps.reduce((sum, o) => sum + o.size, 0);
    return totalSize / (windowMs / 1000); // bytes per second
  }

  getAverageLatency(type?: 'read' | 'write'): number {
    const ops = this.getOperations(type);
    if (ops.length === 0) return 0;
    return ops.reduce((sum, o) => sum + o.duration, 0) / ops.length;
  }

  clear(): void {
    this.operations = [];
  }
}

export const diskIOTracker = new DiskIOTracker();

// ---------------------------------------------------------------------------
// 720. GPU Utilization Monitoring
// ---------------------------------------------------------------------------

class GPUMonitor {
  private samples: { timestamp: number; utilization: number }[] = [];
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private maxSamples = 200;

  start(): void {
    if (this.rafId !== null) return;

    const measure = (now: number) => {
      this.frameCount++;
      
      if (now - this.lastFrameTime >= 1000) {
        // Estimate GPU utilization based on frame rate
        // This is a rough approximation
        const fps = this.frameCount / ((now - this.lastFrameTime) / 1000);
        const targetFPS = 60;
        const utilization = Math.min(100, (fps / targetFPS) * 100);
        
        this.samples.push({ timestamp: Date.now(), utilization });
        if (this.samples.length > this.maxSamples) {
          this.samples.shift();
        }
        
        this.frameCount = 0;
        this.lastFrameTime = now;
      }
      
      this.rafId = requestAnimationFrame(measure);
    };

    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(measure);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getSamples(since?: number): typeof this.samples {
    if (since) {
      return this.samples.filter(s => s.timestamp >= since);
    }
    return [...this.samples];
  }

  getCurrentUtilization(): number {
    return this.samples[this.samples.length - 1]?.utilization || 0;
  }

  getAverageUtilization(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.utilization, 0) / this.samples.length;
  }

  clear(): void {
    this.samples = [];
  }
}

export const gpuMonitor = new GPUMonitor();

// ---------------------------------------------------------------------------
// 721. Structured Logging with Context Chains
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  context: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

class StructuredLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 2000;
  private currentTraceId: string | null = null;
  private spanStack: string[] = [];

  startTrace(): string {
    this.currentTraceId = this.generateId();
    return this.currentTraceId;
  }

  endTrace(): void {
    this.currentTraceId = null;
    this.spanStack = [];
  }

  startSpan(name: string): string {
    const spanId = this.generateId();
    this.log('debug', `Span started: ${name}`, { spanName: name });
    this.spanStack.push(spanId);
    return spanId;
  }

  endSpan(): void {
    this.spanStack.pop();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  log(level: LogEntry['level'], message: string, context: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      traceId: this.currentTraceId || undefined,
      spanId: this.spanStack[this.spanStack.length - 1],
      parentSpanId: this.spanStack[this.spanStack.length - 2],
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
      console[consoleMethod](`[${level.toUpperCase()}]`, message, context);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warning(message: string, context?: Record<string, unknown>): void {
    this.log('warning', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  getLogs(filter?: { level?: LogEntry['level']; traceId?: string; since?: number }): LogEntry[] {
    let filtered = [...this.logs];
    
    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }
    if (filter?.traceId) {
      filtered = filtered.filter(l => l.traceId === filter.traceId);
    }
    if (filter?.since) {
      filtered = filtered.filter(l => l.timestamp >= filter.since!);
    }
    
    return filtered;
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clear(): void {
    this.logs = [];
  }
}

export const structuredLogger = new StructuredLogger();

// ---------------------------------------------------------------------------
// 722. Breadcrumb Trail for Error Reproduction
// ---------------------------------------------------------------------------

class BreadcrumbTrail {
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs = 100;

  add(category: string, message: string, level: Breadcrumb['level'] = 'info', data?: Record<string, unknown>): void {
    this.breadcrumbs.push({
      timestamp: Date.now(),
      category,
      message,
      level,
      data,
    });

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  addNavigation(from: string, to: string): void {
    this.add('navigation', `Navigated from ${from} to ${to}`, 'info', { from, to });
  }

  addClick(target: string): void {
    this.add('ui', `Clicked ${target}`, 'info', { target });
  }

  addInput(field: string): void {
    this.add('ui', `Input in ${field}`, 'info', { field });
  }

  addError(error: Error): void {
    this.add('error', error.message, 'error', { 
      name: error.name,
      stack: error.stack,
    });
  }

  addNetwork(method: string, url: string, status: number): void {
    this.add('network', `${method} ${url} - ${status}`, status >= 400 ? 'error' : 'info', {
      method,
      url,
      status,
    });
  }

  getBreadcrumbs(limit?: number): Breadcrumb[] {
    if (limit) {
      return this.breadcrumbs.slice(-limit);
    }
    return [...this.breadcrumbs];
  }

  getTrailForError(): Breadcrumb[] {
    // Return last 20 breadcrumbs for error context
    return this.breadcrumbs.slice(-20);
  }

  clear(): void {
    this.breadcrumbs = [];
  }
}

export const breadcrumbTrail = new BreadcrumbTrail();

// ---------------------------------------------------------------------------
// 723. Health Check Dashboard Data
// ---------------------------------------------------------------------------

class HealthChecker {
  getStatus(): HealthStatus {
    const fps = frameTimingCollector.getAverageFPS();
    const memoryUsage = memoryMonitor.getCurrentUsage();
    const errorCount = structuredLogger.getLogs({ level: 'error', since: Date.now() - 60000 }).length;
    
    const cpuEstimate = 100 - (fps / 60 * 100); // Rough estimate
    const errorRate = errorCount / 60; // Errors per second

    let status: HealthStatus['status'] = 'healthy';
    if (fps < 30 || memoryUsage > 80 || errorRate > 1) {
      status = 'degraded';
    }
    if (fps < 15 || memoryUsage > 90 || errorRate > 5) {
      status = 'critical';
    }

    return {
      cpu: cpuEstimate,
      memory: memoryUsage,
      fps,
      networkLatency: 0, // Would need actual network monitoring
      errorRate,
      status,
    };
  }

  getDetailedHealth(): Record<string, unknown> {
    return {
      status: this.getStatus(),
      memory: {
        current: memoryMonitor.getCurrentUsage(),
        trend: memoryMonitor.getMemoryTrend(),
      },
      performance: {
        fps: frameTimingCollector.getAverageFPS(),
        jankPercentage: frameTimingCollector.getJankPercentage(),
        longTaskCount: longTaskDetector.getTaskCount(),
        avgLongTaskDuration: longTaskDetector.getAverageDuration(),
      },
      webVitals: paintTimingCollector.getMetrics(),
      inputMethods: inputMethodTracker.getUsage(),
      topFeatures: featureUsageTracker.getTopFeatures(5),
      recentErrors: structuredLogger.getLogs({ level: 'error' }).slice(-5),
    };
  }
}

export const healthChecker = new HealthChecker();

// ---------------------------------------------------------------------------
// 724. Automatic Performance Regression Detection
// ---------------------------------------------------------------------------

interface Baseline {
  fps: number;
  memoryUsage: number;
  longTaskDuration: number;
  interactionLatency: number;
}

class RegressionDetector {
  private baseline: Baseline | null = null;
  private thresholds = {
    fpsDropPercent: 20,
    memoryIncreasePercent: 30,
    longTaskDurationIncreasePercent: 50,
    latencyIncreasePercent: 50,
  };

  setBaseline(): void {
    this.baseline = {
      fps: frameTimingCollector.getAverageFPS(),
      memoryUsage: memoryMonitor.getCurrentUsage(),
      longTaskDuration: longTaskDetector.getAverageDuration(),
      interactionLatency: interactionLatencyTracker.getAverageLatency(),
    };
  }

  detectRegressions(): { metric: string; baseline: number; current: number; change: number }[] {
    if (!this.baseline) return [];

    const regressions: { metric: string; baseline: number; current: number; change: number }[] = [];
    
    const currentFPS = frameTimingCollector.getAverageFPS();
    const fpsChange = ((this.baseline.fps - currentFPS) / this.baseline.fps) * 100;
    if (fpsChange > this.thresholds.fpsDropPercent) {
      regressions.push({ metric: 'fps', baseline: this.baseline.fps, current: currentFPS, change: -fpsChange });
    }

    const currentMemory = memoryMonitor.getCurrentUsage();
    const memoryChange = ((currentMemory - this.baseline.memoryUsage) / this.baseline.memoryUsage) * 100;
    if (memoryChange > this.thresholds.memoryIncreasePercent) {
      regressions.push({ metric: 'memory', baseline: this.baseline.memoryUsage, current: currentMemory, change: memoryChange });
    }

    const currentLongTask = longTaskDetector.getAverageDuration();
    if (this.baseline.longTaskDuration > 0) {
      const longTaskChange = ((currentLongTask - this.baseline.longTaskDuration) / this.baseline.longTaskDuration) * 100;
      if (longTaskChange > this.thresholds.longTaskDurationIncreasePercent) {
        regressions.push({ metric: 'longTaskDuration', baseline: this.baseline.longTaskDuration, current: currentLongTask, change: longTaskChange });
      }
    }

    const currentLatency = interactionLatencyTracker.getAverageLatency();
    if (this.baseline.interactionLatency > 0) {
      const latencyChange = ((currentLatency - this.baseline.interactionLatency) / this.baseline.interactionLatency) * 100;
      if (latencyChange > this.thresholds.latencyIncreasePercent) {
        regressions.push({ metric: 'interactionLatency', baseline: this.baseline.interactionLatency, current: currentLatency, change: latencyChange });
      }
    }

    return regressions;
  }

  hasRegression(): boolean {
    return this.detectRegressions().length > 0;
  }
}

export const regressionDetector = new RegressionDetector();

// ---------------------------------------------------------------------------
// 725. User Consent Manager
// ---------------------------------------------------------------------------

class ConsentManager {
  private consent: TelemetryConsent = {
    analytics: false,
    performance: false,
    errorReporting: false,
    sessionReplay: false,
  };
  private storageKey = 'dex-telemetry-consent';

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.consent = JSON.parse(stored);
      }
    } catch {
      // Use defaults
    }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.consent));
    } catch {
      // Storage not available
    }
  }

  setConsent(consent: Partial<TelemetryConsent>): void {
    this.consent = { ...this.consent, ...consent };
    this.save();
    this.applyConsent();
  }

  getConsent(): TelemetryConsent {
    return { ...this.consent };
  }

  isAllowed(category: keyof TelemetryConsent): boolean {
    return this.consent[category];
  }

  private applyConsent(): void {
    // Start/stop collectors based on consent
    if (this.consent.analytics) {
      inputMethodTracker.start();
      featureUsageTracker.getAllUsage(); // Just access to initialize
    } else {
      inputMethodTracker.stop();
    }

    if (this.consent.performance) {
      frameTimingCollector.start();
      memoryMonitor.start();
      longTaskDetector.start();
      paintTimingCollector.start();
      gpuMonitor.start();
    } else {
      frameTimingCollector.stop();
      memoryMonitor.stop();
      longTaskDetector.stop();
      paintTimingCollector.stop();
      gpuMonitor.stop();
    }

    if (this.consent.sessionReplay) {
      sessionReplayRecorder.start();
    } else {
      sessionReplayRecorder.stop();
    }
  }

  revokeAll(): void {
    this.consent = {
      analytics: false,
      performance: false,
      errorReporting: false,
      sessionReplay: false,
    };
    this.save();
    this.applyConsent();
  }

  grantAll(): void {
    this.consent = {
      analytics: true,
      performance: true,
      errorReporting: true,
      sessionReplay: true,
    };
    this.save();
    this.applyConsent();
  }
}

export const consentManager = new ConsentManager();

// ---------------------------------------------------------------------------
// React Hooks for Telemetry
// ---------------------------------------------------------------------------

export function useTelemetry() {
  useEffect(() => {
    // Auto-start performance monitoring if consented
    if (consentManager.isAllowed('performance')) {
      frameTimingCollector.start();
      memoryMonitor.start();
      longTaskDetector.start();
    }

    return () => {
      frameTimingCollector.stop();
      memoryMonitor.stop();
      longTaskDetector.stop();
    };
  }, []);

  return {
    trackFeature: featureUsageTracker.track.bind(featureUsageTracker),
    trackGesture: gestureCollector.record.bind(gestureCollector),
    trackNavigation: navigationFlowTracker.trackNavigation.bind(navigationFlowTracker),
    recordClick: heatmapRecorder.recordClick.bind(heatmapRecorder),
    log: structuredLogger.log.bind(structuredLogger),
    addBreadcrumb: breadcrumbTrail.add.bind(breadcrumbTrail),
    getHealth: healthChecker.getStatus.bind(healthChecker),
  };
}

export function useFeatureTracking(featureId: string) {
  useEffect(() => {
    featureUsageTracker.trackStart(featureId);
    return () => {
      featureUsageTracker.trackEnd(featureId);
    };
  }, [featureId]);
}

export function useScrollDepthTracking(appId: string, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (ref.current && consentManager.isAllowed('analytics')) {
      scrollDepthTracker.startTracking(appId, ref.current);
      return () => {
        scrollDepthTracker.stopTracking(appId);
      };
    }
  }, [appId, ref]);
}

export function useTaskTiming(taskId: string) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      taskTimingTracker.startTask(taskId);
      startedRef.current = true;
    }
  }, [taskId]);

  const recordStep = useCallback((stepName: string, duration: number) => {
    taskTimingTracker.recordStep(taskId, stepName, duration);
  }, [taskId]);

  const complete = useCallback(() => {
    taskTimingTracker.completeTask(taskId);
  }, [taskId]);

  const abandon = useCallback(() => {
    taskTimingTracker.abandonTask(taskId);
  }, [taskId]);

  return { recordStep, complete, abandon };
}

export function useInteractionLatency(type: string) {
  const idRef = useRef<string | null>(null);

  const start = useCallback(() => {
    idRef.current = `${type}-${Date.now()}`;
    interactionLatencyTracker.startInteraction(idRef.current, type);
  }, [type]);

  const complete = useCallback(() => {
    if (idRef.current) {
      interactionLatencyTracker.completeInteraction(idRef.current);
      idRef.current = null;
    }
  }, []);

  return { start, complete };
}

// ---------------------------------------------------------------------------
// Initialize telemetry on import
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  // Set up global error handler
  window.addEventListener('error', (event) => {
    if (consentManager.isAllowed('errorReporting')) {
      errorCorrelator.recordError(event.error);
      breadcrumbTrail.addError(event.error);
      structuredLogger.error(event.message, { 
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (consentManager.isAllowed('errorReporting')) {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      errorCorrelator.recordError(error);
      breadcrumbTrail.addError(error);
      structuredLogger.error('Unhandled promise rejection', { reason: event.reason });
    }
  });
}
