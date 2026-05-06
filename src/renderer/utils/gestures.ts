// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Advanced Gesture System (Phase I: Items 726-750)
// Unified gesture recognition, platform matching, and state machine
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GestureType = 'tap' | 'doubletap' | 'longpress' | 'pan' | 'swipe' | 'pinch' | 'rotate' | 'custom';
export type GesturePhase = 'possible' | 'began' | 'changed' | 'ended' | 'cancelled' | 'failed';
export type GestureDirection = 'up' | 'down' | 'left' | 'right' | 'none';

export interface GesturePoint {
  x: number;
  y: number;
  timestamp: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
}

export interface GestureVelocity {
  x: number;
  y: number;
  magnitude: number;
  angle: number;
}

export interface GestureRecognition {
  type: GestureType;
  phase: GesturePhase;
  startPoint: GesturePoint;
  currentPoint: GesturePoint;
  delta: { x: number; y: number };
  velocity: GestureVelocity;
  acceleration: GestureVelocity;
  scale: number;
  rotation: number;
  direction: GestureDirection;
  touchCount: number;
  duration: number;
  distance: number;
  prediction?: GesturePoint;
}

export interface GestureConfig {
  minTapDuration: number;
  maxTapDuration: number;
  longPressDuration: number;
  doubleTapInterval: number;
  swipeVelocityThreshold: number;
  swipeDistanceThreshold: number;
  pinchThreshold: number;
  rotationThreshold: number;
  deadZone: number;
}

export interface CustomGestureDefinition {
  name: string;
  touchCount: number;
  pattern: GesturePoint[];
  tolerance: number;
  maxDuration: number;
}

export interface GestureRecording {
  gestures: GestureRecognition[];
  startTime: number;
  endTime: number;
  duration: number;
}

export interface PlatformGesturePreset {
  scrollPhysics: {
    friction: number;
    bounceStiffness: number;
    bounceDamping: number;
    rubberBanding: boolean;
  };
  swipeThreshold: number;
  pinchSensitivity: number;
  rotationSensitivity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: GestureConfig = {
  minTapDuration: 0,
  maxTapDuration: 300,
  longPressDuration: 500,
  doubleTapInterval: 300,
  swipeVelocityThreshold: 0.5,
  swipeDistanceThreshold: 50,
  pinchThreshold: 0.1,
  rotationThreshold: 10,
  deadZone: 10,
};

const PLATFORM_PRESETS: Record<string, PlatformGesturePreset> = {
  macos: {
    scrollPhysics: { friction: 0.92, bounceStiffness: 400, bounceDamping: 30, rubberBanding: true },
    swipeThreshold: 0.3,
    pinchSensitivity: 1.0,
    rotationSensitivity: 1.0,
  },
  windows: {
    scrollPhysics: { friction: 0.95, bounceStiffness: 0, bounceDamping: 0, rubberBanding: false },
    swipeThreshold: 0.5,
    pinchSensitivity: 0.8,
    rotationSensitivity: 0.8,
  },
  linux: {
    scrollPhysics: { friction: 0.90, bounceStiffness: 200, bounceDamping: 20, rubberBanding: true },
    swipeThreshold: 0.4,
    pinchSensitivity: 1.0,
    rotationSensitivity: 1.0,
  },
};

// ---------------------------------------------------------------------------
// 726. Unified Gesture Recognizer Pipeline
// ---------------------------------------------------------------------------

class GestureRecognizer {
  private config: GestureConfig;
  private activeGestures: Map<number, GestureRecognition> = new Map();
  private listeners: ((gesture: GestureRecognition) => void)[] = [];
  private priorityQueue: { type: GestureType; priority: number }[] = [];
  private lastTapTime = 0;
  private lastTapPoint: GesturePoint | null = null;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupPriorityQueue();
  }

  private setupPriorityQueue(): void {
    // Higher priority = recognized first
    this.priorityQueue = [
      { type: 'longpress', priority: 100 },
      { type: 'doubletap', priority: 90 },
      { type: 'tap', priority: 80 },
      { type: 'pinch', priority: 70 },
      { type: 'rotate', priority: 60 },
      { type: 'swipe', priority: 50 },
      { type: 'pan', priority: 40 },
    ];
  }

  // 727. Gesture Priority Queue
  setPriority(type: GestureType, priority: number): void {
    const item = this.priorityQueue.find(p => p.type === type);
    if (item) {
      item.priority = priority;
    }
    this.priorityQueue.sort((a, b) => b.priority - a.priority);
  }

  onGesture(callback: (gesture: GestureRecognition) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private emit(gesture: GestureRecognition): void {
    this.listeners.forEach(l => l(gesture));
  }

  // 728. Continuous Gesture Tracking
  handlePointerDown(e: PointerEvent): void {
    const point: GesturePoint = {
      x: e.clientX,
      y: e.clientY,
      timestamp: e.timeStamp,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
    };

    const gesture: GestureRecognition = {
      type: 'tap',
      phase: 'began',
      startPoint: point,
      currentPoint: point,
      delta: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, magnitude: 0, angle: 0 },
      acceleration: { x: 0, y: 0, magnitude: 0, angle: 0 },
      scale: 1,
      rotation: 0,
      direction: 'none',
      touchCount: 1,
      duration: 0,
      distance: 0,
    };

    this.activeGestures.set(e.pointerId, gesture);
    this.emit(gesture);
  }

  handlePointerMove(e: PointerEvent): void {
    const gesture = this.activeGestures.get(e.pointerId);
    if (!gesture) return;

    const prevPoint = gesture.currentPoint;
    const currentPoint: GesturePoint = {
      x: e.clientX,
      y: e.clientY,
      timestamp: e.timeStamp,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
    };

    const dt = Math.max(1, currentPoint.timestamp - prevPoint.timestamp);
    const dx = currentPoint.x - prevPoint.x;
    const dy = currentPoint.y - prevPoint.y;

    // 729. Velocity/Acceleration Curves
    const prevVelocity = gesture.velocity;
    const newVelocity: GestureVelocity = {
      x: dx / dt * 1000,
      y: dy / dt * 1000,
      magnitude: Math.sqrt(dx * dx + dy * dy) / dt * 1000,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    };

    const acceleration: GestureVelocity = {
      x: (newVelocity.x - prevVelocity.x) / dt * 1000,
      y: (newVelocity.y - prevVelocity.y) / dt * 1000,
      magnitude: (newVelocity.magnitude - prevVelocity.magnitude) / dt * 1000,
      angle: newVelocity.angle - prevVelocity.angle,
    };

    gesture.currentPoint = currentPoint;
    gesture.delta = {
      x: currentPoint.x - gesture.startPoint.x,
      y: currentPoint.y - gesture.startPoint.y,
    };
    gesture.velocity = newVelocity;
    gesture.acceleration = acceleration;
    gesture.duration = currentPoint.timestamp - gesture.startPoint.timestamp;
    gesture.distance = Math.sqrt(
      gesture.delta.x * gesture.delta.x + gesture.delta.y * gesture.delta.y
    );
    gesture.direction = this.getDirection(gesture.delta);
    gesture.phase = 'changed';

    // 730. Gesture Prediction
    gesture.prediction = this.predictGesture(gesture);

    // Recognize gesture type
    gesture.type = this.recognizeType(gesture);

    this.emit(gesture);
  }

  handlePointerUp(e: PointerEvent): void {
    const gesture = this.activeGestures.get(e.pointerId);
    if (!gesture) return;

    gesture.phase = 'ended';
    gesture.duration = e.timeStamp - gesture.startPoint.timestamp;

    // Check for double tap
    if (gesture.type === 'tap' && gesture.duration < this.config.maxTapDuration) {
      if (this.lastTapPoint && e.timeStamp - this.lastTapTime < this.config.doubleTapInterval) {
        const dist = Math.sqrt(
          Math.pow(gesture.startPoint.x - this.lastTapPoint.x, 2) +
          Math.pow(gesture.startPoint.y - this.lastTapPoint.y, 2)
        );
        if (dist < this.config.deadZone * 2) {
          gesture.type = 'doubletap';
        }
      }
      this.lastTapTime = e.timeStamp;
      this.lastTapPoint = gesture.startPoint;
    }

    this.emit(gesture);
    this.activeGestures.delete(e.pointerId);
  }

  // 731. Gesture Cancellation with Rollback
  handlePointerCancel(e: PointerEvent): void {
    const gesture = this.activeGestures.get(e.pointerId);
    if (!gesture) return;

    gesture.phase = 'cancelled';
    this.emit(gesture);
    this.activeGestures.delete(e.pointerId);
  }

  cancelGesture(pointerId: number): GestureRecognition | undefined {
    const gesture = this.activeGestures.get(pointerId);
    if (gesture) {
      gesture.phase = 'cancelled';
      this.emit(gesture);
      this.activeGestures.delete(pointerId);
      return gesture;
    }
  }

  cancelAllGestures(): GestureRecognition[] {
    const cancelled: GestureRecognition[] = [];
    this.activeGestures.forEach((gesture, id) => {
      gesture.phase = 'cancelled';
      this.emit(gesture);
      cancelled.push(gesture);
    });
    this.activeGestures.clear();
    return cancelled;
  }

  private getDirection(delta: { x: number; y: number }): GestureDirection {
    if (Math.abs(delta.x) < this.config.deadZone && Math.abs(delta.y) < this.config.deadZone) {
      return 'none';
    }
    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      return delta.x > 0 ? 'right' : 'left';
    }
    return delta.y > 0 ? 'down' : 'up';
  }

  private recognizeType(gesture: GestureRecognition): GestureType {
    // Check in priority order
    for (const { type } of this.priorityQueue) {
      if (this.matchesType(gesture, type)) {
        return type;
      }
    }
    return 'pan';
  }

  private matchesType(gesture: GestureRecognition, type: GestureType): boolean {
    switch (type) {
      case 'longpress':
        return gesture.duration >= this.config.longPressDuration && gesture.distance < this.config.deadZone;
      case 'tap':
        return gesture.duration < this.config.maxTapDuration && gesture.distance < this.config.deadZone;
      case 'swipe':
        return gesture.velocity.magnitude > this.config.swipeVelocityThreshold && 
               gesture.distance > this.config.swipeDistanceThreshold;
      case 'pan':
        return gesture.distance > this.config.deadZone;
      default:
        return false;
    }
  }

  // 730. Gesture Prediction
  private predictGesture(gesture: GestureRecognition): GesturePoint {
    const predictionTime = 50; // ms ahead
    return {
      x: gesture.currentPoint.x + gesture.velocity.x * predictionTime / 1000,
      y: gesture.currentPoint.y + gesture.velocity.y * predictionTime / 1000,
      timestamp: gesture.currentPoint.timestamp + predictionTime,
    };
  }
}

export const gestureRecognizer = new GestureRecognizer();

// ---------------------------------------------------------------------------
// 732. Custom Gesture Definition API
// ---------------------------------------------------------------------------

class CustomGestureRegistry {
  private definitions: Map<string, CustomGestureDefinition> = new Map();
  private recordings: Map<string, GesturePoint[]> = new Map();

  defineGesture(definition: CustomGestureDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  removeGesture(name: string): boolean {
    return this.definitions.delete(name);
  }

  getGesture(name: string): CustomGestureDefinition | undefined {
    return this.definitions.get(name);
  }

  getAllGestures(): CustomGestureDefinition[] {
    return Array.from(this.definitions.values());
  }

  // 733. Gesture Recording
  startRecording(name: string): void {
    this.recordings.set(name, []);
  }

  recordPoint(name: string, point: GesturePoint): void {
    const recording = this.recordings.get(name);
    if (recording) {
      recording.push(point);
    }
  }

  stopRecording(name: string): GesturePoint[] | undefined {
    const recording = this.recordings.get(name);
    this.recordings.delete(name);
    return recording;
  }

  createGestureFromRecording(
    name: string,
    recording: GesturePoint[],
    tolerance = 50,
    maxDuration = 2000
  ): CustomGestureDefinition {
    const definition: CustomGestureDefinition = {
      name,
      touchCount: 1,
      pattern: this.normalizePattern(recording),
      tolerance,
      maxDuration,
    };
    this.defineGesture(definition);
    return definition;
  }

  private normalizePattern(points: GesturePoint[]): GesturePoint[] {
    if (points.length === 0) return [];

    // Normalize to relative positions from first point
    const first = points[0];
    return points.map(p => ({
      x: p.x - first.x,
      y: p.y - first.y,
      timestamp: p.timestamp - first.timestamp,
    }));
  }

  matchGesture(points: GesturePoint[]): { name: string; confidence: number } | null {
    const normalized = this.normalizePattern(points);
    let bestMatch: { name: string; confidence: number } | null = null;

    this.definitions.forEach((def) => {
      const confidence = this.calculateMatch(normalized, def);
      if (confidence > 0.7 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { name: def.name, confidence };
      }
    });

    return bestMatch;
  }

  private calculateMatch(points: GesturePoint[], definition: CustomGestureDefinition): number {
    if (points.length === 0 || definition.pattern.length === 0) return 0;

    // Simple DTW-like matching
    const sampleCount = Math.min(points.length, definition.pattern.length);
    let totalDistance = 0;

    for (let i = 0; i < sampleCount; i++) {
      const pi = Math.floor(i * points.length / sampleCount);
      const di = Math.floor(i * definition.pattern.length / sampleCount);
      
      const dx = points[pi].x - definition.pattern[di].x;
      const dy = points[pi].y - definition.pattern[di].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }

    const avgDistance = totalDistance / sampleCount;
    const confidence = Math.max(0, 1 - avgDistance / definition.tolerance);
    return confidence;
  }
}

export const customGestureRegistry = new CustomGestureRegistry();

// ---------------------------------------------------------------------------
// 733. Gesture Recording and Playback
// ---------------------------------------------------------------------------

class GesturePlayer {
  private recordings: Map<string, GestureRecording> = new Map();
  private playbackState: { name: string; index: number; rafId: number } | null = null;

  saveRecording(name: string, recording: GestureRecording): void {
    this.recordings.set(name, recording);
  }

  loadRecording(name: string): GestureRecording | undefined {
    return this.recordings.get(name);
  }

  deleteRecording(name: string): boolean {
    return this.recordings.delete(name);
  }

  listRecordings(): string[] {
    return Array.from(this.recordings.keys());
  }

  playback(
    name: string, 
    onGesture: (gesture: GestureRecognition) => void,
    speed = 1.0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const recording = this.recordings.get(name);
      if (!recording) {
        reject(new Error(`Recording not found: ${name}`));
        return;
      }

      let index = 0;
      let startTime = performance.now();

      const playNext = () => {
        if (index >= recording.gestures.length) {
          this.playbackState = null;
          resolve();
          return;
        }

        const gesture = recording.gestures[index];
        const expectedTime = gesture.duration / speed;
        const elapsed = performance.now() - startTime;

        if (elapsed >= expectedTime) {
          onGesture(gesture);
          index++;
          startTime = performance.now();
        }

        this.playbackState = {
          name,
          index,
          rafId: requestAnimationFrame(playNext),
        };
      };

      playNext();
    });
  }

  stopPlayback(): void {
    if (this.playbackState) {
      cancelAnimationFrame(this.playbackState.rafId);
      this.playbackState = null;
    }
  }

  isPlaying(): boolean {
    return this.playbackState !== null;
  }

  exportRecording(name: string): string | null {
    const recording = this.recordings.get(name);
    if (!recording) return null;
    return JSON.stringify(recording);
  }

  importRecording(name: string, json: string): boolean {
    try {
      const recording = JSON.parse(json) as GestureRecording;
      this.recordings.set(name, recording);
      return true;
    } catch {
      return false;
    }
  }
}

export const gesturePlayer = new GesturePlayer();

// ---------------------------------------------------------------------------
// 734. Gesture Learning from User Patterns
// ---------------------------------------------------------------------------

class GestureLearner {
  private patterns: Map<string, GestureRecognition[]> = new Map();
  private minSamples = 5;

  recordPattern(label: string, gesture: GestureRecognition): void {
    if (!this.patterns.has(label)) {
      this.patterns.set(label, []);
    }
    this.patterns.get(label)!.push(gesture);
  }

  hasEnoughSamples(label: string): boolean {
    const patterns = this.patterns.get(label);
    return patterns !== undefined && patterns.length >= this.minSamples;
  }

  learn(label: string): CustomGestureDefinition | null {
    const patterns = this.patterns.get(label);
    if (!patterns || patterns.length < this.minSamples) return null;

    // Calculate average pattern
    const avgPattern: GesturePoint[] = [];
    const pointCounts: number[] = [];

    patterns.forEach(gesture => {
      // Simplify: use start, mid, end points
      const points = [
        gesture.startPoint,
        gesture.currentPoint,
      ];

      points.forEach((p, i) => {
        if (!avgPattern[i]) {
          avgPattern[i] = { x: 0, y: 0, timestamp: 0 };
          pointCounts[i] = 0;
        }
        avgPattern[i].x += p.x;
        avgPattern[i].y += p.y;
        avgPattern[i].timestamp += p.timestamp;
        pointCounts[i]++;
      });
    });

    // Average
    avgPattern.forEach((p, i) => {
      p.x /= pointCounts[i];
      p.y /= pointCounts[i];
      p.timestamp /= pointCounts[i];
    });

    // Normalize
    const first = avgPattern[0];
    const normalizedPattern = avgPattern.map(p => ({
      x: p.x - first.x,
      y: p.y - first.y,
      timestamp: p.timestamp - first.timestamp,
    }));

    // Calculate tolerance from variance
    let maxVariance = 0;
    patterns.forEach(gesture => {
      const dx = gesture.currentPoint.x - gesture.startPoint.x - (normalizedPattern[1]?.x || 0);
      const dy = gesture.currentPoint.y - gesture.startPoint.y - (normalizedPattern[1]?.y || 0);
      maxVariance = Math.max(maxVariance, Math.sqrt(dx * dx + dy * dy));
    });

    const definition: CustomGestureDefinition = {
      name: label,
      touchCount: 1,
      pattern: normalizedPattern,
      tolerance: maxVariance * 1.5,
      maxDuration: Math.max(...patterns.map(p => p.duration)) * 1.2,
    };

    customGestureRegistry.defineGesture(definition);
    return definition;
  }

  clearPatterns(label?: string): void {
    if (label) {
      this.patterns.delete(label);
    } else {
      this.patterns.clear();
    }
  }
}

export const gestureLearner = new GestureLearner();

// ---------------------------------------------------------------------------
// 735. Gesture Debug Overlay
// ---------------------------------------------------------------------------

interface TouchVisualization {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  trail: { x: number; y: number }[];
}

class GestureDebugger {
  private enabled = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private touches: Map<number, TouchVisualization> = new Map();
  private rafId: number | null = null;

  enable(container?: HTMLElement): void {
    if (this.enabled) return;
    this.enabled = true;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: var(--z-gesture-debug, 30000);
    `;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    (container || document.body).appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.startRender();
    this.attachListeners();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.touches.clear();
  }

  private attachListeners(): void {
    const handlePointerDown = (e: PointerEvent) => {
      this.touches.set(e.pointerId, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        radius: 30,
        color: this.getColorForPointerType(e.pointerType),
        trail: [{ x: e.clientX, y: e.clientY }],
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      const touch = this.touches.get(e.pointerId);
      if (touch) {
        touch.x = e.clientX;
        touch.y = e.clientY;
        touch.trail.push({ x: e.clientX, y: e.clientY });
        if (touch.trail.length > 50) touch.trail.shift();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
  }

  private getColorForPointerType(type: string): string {
    switch (type) {
      case 'touch': return 'rgba(0, 122, 255, 0.5)';
      case 'pen': return 'rgba(255, 149, 0, 0.5)';
      case 'mouse': return 'rgba(52, 199, 89, 0.5)';
      default: return 'rgba(255, 255, 255, 0.5)';
    }
  }

  private startRender(): void {
    const render = () => {
      if (!this.ctx || !this.canvas) return;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.touches.forEach(touch => {
        // Draw trail
        if (touch.trail.length > 1) {
          this.ctx!.beginPath();
          this.ctx!.moveTo(touch.trail[0].x, touch.trail[0].y);
          touch.trail.forEach(p => this.ctx!.lineTo(p.x, p.y));
          this.ctx!.strokeStyle = touch.color.replace('0.5', '0.3');
          this.ctx!.lineWidth = 3;
          this.ctx!.stroke();
        }

        // Draw touch point
        this.ctx!.beginPath();
        this.ctx!.arc(touch.x, touch.y, touch.radius, 0, Math.PI * 2);
        this.ctx!.fillStyle = touch.color;
        this.ctx!.fill();

        // Draw crosshair
        this.ctx!.beginPath();
        this.ctx!.moveTo(touch.x - 20, touch.y);
        this.ctx!.lineTo(touch.x + 20, touch.y);
        this.ctx!.moveTo(touch.x, touch.y - 20);
        this.ctx!.lineTo(touch.x, touch.y + 20);
        this.ctx!.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx!.lineWidth = 1;
        this.ctx!.stroke();

        // Draw coordinates
        this.ctx!.font = '12px monospace';
        this.ctx!.fillStyle = 'white';
        this.ctx!.fillText(`(${Math.round(touch.x)}, ${Math.round(touch.y)})`, touch.x + 35, touch.y + 5);
      });

      this.rafId = requestAnimationFrame(render);
    };

    this.rafId = requestAnimationFrame(render);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const gestureDebugger = new GestureDebugger();

// ---------------------------------------------------------------------------
// 736-742. Platform Gesture Matching
// ---------------------------------------------------------------------------

class PlatformGestureAdapter {
  private platform: 'macos' | 'windows' | 'linux';
  private preset: PlatformGesturePreset;

  constructor() {
    this.platform = this.detectPlatform();
    this.preset = PLATFORM_PRESETS[this.platform] || PLATFORM_PRESETS.windows;
  }

  private detectPlatform(): 'macos' | 'windows' | 'linux' {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('linux')) return 'linux';
    return 'windows';
  }

  getPlatform(): string {
    return this.platform;
  }

  getPreset(): PlatformGesturePreset {
    return { ...this.preset };
  }

  setPreset(preset: Partial<PlatformGesturePreset>): void {
    this.preset = { ...this.preset, ...preset };
  }

  // 736. macOS Trackpad Scroll Physics
  applyMacOSScrollPhysics(velocity: number, position: number, bounds: { min: number; max: number }): number {
    const { friction, bounceStiffness, bounceDamping, rubberBanding } = this.preset.scrollPhysics;
    
    let newPosition = position + velocity;
    
    // Rubber banding at boundaries
    if (rubberBanding) {
      if (newPosition < bounds.min) {
        const overshoot = bounds.min - newPosition;
        newPosition = bounds.min - overshoot * 0.3; // Rubber band effect
      } else if (newPosition > bounds.max) {
        const overshoot = newPosition - bounds.max;
        newPosition = bounds.max + overshoot * 0.3;
      }
    } else {
      newPosition = Math.max(bounds.min, Math.min(bounds.max, newPosition));
    }
    
    return newPosition;
  }

  // 740. Three-finger App Switch (macOS-style)
  isThreeFingerSwipe(gesture: GestureRecognition): boolean {
    return gesture.touchCount >= 3 && 
           gesture.type === 'swipe' && 
           gesture.velocity.magnitude > this.preset.swipeThreshold;
  }

  // 741. Edge Swipe for Notifications (Windows-style)
  isEdgeSwipe(gesture: GestureRecognition, screenWidth: number): { edge: 'left' | 'right' | 'top' | 'bottom'; valid: boolean } {
    const edgeThreshold = 20;
    const { startPoint, direction } = gesture;
    
    if (startPoint.x < edgeThreshold && direction === 'right') {
      return { edge: 'left', valid: true };
    }
    if (startPoint.x > screenWidth - edgeThreshold && direction === 'left') {
      return { edge: 'right', valid: true };
    }
    if (startPoint.y < edgeThreshold && direction === 'down') {
      return { edge: 'top', valid: true };
    }
    
    return { edge: 'left', valid: false };
  }

  // 742. Workspace Switch Gesture (Linux-style)
  isWorkspaceSwitch(gesture: GestureRecognition): { direction: 'left' | 'right' | 'up' | 'down' } | null {
    if (gesture.touchCount < 3) return null;
    if (gesture.type !== 'swipe') return null;
    
    const { direction } = gesture;
    if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') {
      return { direction };
    }
    return null;
  }
}

export const platformGestureAdapter = new PlatformGestureAdapter();

// ---------------------------------------------------------------------------
// 743. Force Touch Detection
// ---------------------------------------------------------------------------

class ForceTouchDetector {
  private forceThresholds = { light: 0.1, medium: 0.5, heavy: 0.8 };
  private supported = false;

  constructor() {
    this.checkSupport();
  }

  private checkSupport(): void {
    // Check for Force Touch / 3D Touch support
    this.supported = 'ontouchforcechange' in document || 
                     (window as unknown as { TouchEvent?: { prototype?: { force?: number } } }).TouchEvent?.prototype?.force !== undefined;
  }

  isSupported(): boolean {
    return this.supported;
  }

  detectForceLevel(pressure: number): 'none' | 'light' | 'medium' | 'heavy' {
    if (pressure < this.forceThresholds.light) return 'none';
    if (pressure < this.forceThresholds.medium) return 'light';
    if (pressure < this.forceThresholds.heavy) return 'medium';
    return 'heavy';
  }

  setThresholds(thresholds: Partial<typeof this.forceThresholds>): void {
    this.forceThresholds = { ...this.forceThresholds, ...thresholds };
  }
}

export const forceTouchDetector = new ForceTouchDetector();

// ---------------------------------------------------------------------------
// 744. Haptic Feedback Patterns
// ---------------------------------------------------------------------------

class HapticFeedback {
  private supported = false;

  constructor() {
    this.supported = 'vibrate' in navigator;
  }

  isSupported(): boolean {
    return this.supported;
  }

  light(): void {
    if (this.supported) {
      navigator.vibrate(10);
    }
  }

  medium(): void {
    if (this.supported) {
      navigator.vibrate(25);
    }
  }

  heavy(): void {
    if (this.supported) {
      navigator.vibrate(50);
    }
  }

  success(): void {
    if (this.supported) {
      navigator.vibrate([10, 50, 10]);
    }
  }

  warning(): void {
    if (this.supported) {
      navigator.vibrate([30, 50, 30]);
    }
  }

  error(): void {
    if (this.supported) {
      navigator.vibrate([50, 100, 50, 100, 50]);
    }
  }

  selection(): void {
    if (this.supported) {
      navigator.vibrate(5);
    }
  }

  impact(intensity: 'light' | 'medium' | 'heavy'): void {
    const patterns = { light: 10, medium: 25, heavy: 50 };
    if (this.supported) {
      navigator.vibrate(patterns[intensity]);
    }
  }

  pattern(pattern: number[]): void {
    if (this.supported) {
      navigator.vibrate(pattern);
    }
  }
}

export const hapticFeedback = new HapticFeedback();

// ---------------------------------------------------------------------------
// 745. Gesture Accessibility Alternatives
// ---------------------------------------------------------------------------

class GestureAccessibility {
  private alternatives: Map<GestureType, { key: string; modifiers: string[] }> = new Map([
    ['tap', { key: 'Enter', modifiers: [] }],
    ['doubletap', { key: 'Enter', modifiers: ['Shift'] }],
    ['longpress', { key: ' ', modifiers: [] }],
    ['swipe', { key: 'Arrow', modifiers: [] }],
    ['pinch', { key: '+/-', modifiers: ['Ctrl'] }],
    ['rotate', { key: '[/]', modifiers: ['Ctrl'] }],
  ]);

  getKeyboardAlternative(gesture: GestureType): { key: string; modifiers: string[] } | undefined {
    return this.alternatives.get(gesture);
  }

  setAlternative(gesture: GestureType, key: string, modifiers: string[] = []): void {
    this.alternatives.set(gesture, { key, modifiers });
  }

  getAllAlternatives(): Map<GestureType, { key: string; modifiers: string[] }> {
    return new Map(this.alternatives);
  }

  describeAlternative(gesture: GestureType): string {
    const alt = this.alternatives.get(gesture);
    if (!alt) return 'No keyboard alternative';
    
    const mods = alt.modifiers.length > 0 ? alt.modifiers.join('+') + '+' : '';
    return `${mods}${alt.key}`;
  }
}

export const gestureAccessibility = new GestureAccessibility();

// ---------------------------------------------------------------------------
// 746. Finite State Machine for Gesture Phases
// ---------------------------------------------------------------------------

type GestureState = 'idle' | 'possible' | 'began' | 'changed' | 'ended' | 'cancelled' | 'failed';
type GestureEvent = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'timeout' | 'reset';

interface GestureTransition {
  from: GestureState;
  event: GestureEvent;
  to: GestureState;
  condition?: (context: unknown) => boolean;
  action?: (context: unknown) => void;
}

class GestureStateMachine {
  private state: GestureState = 'idle';
  private transitions: GestureTransition[] = [];
  private listeners: ((state: GestureState, prevState: GestureState) => void)[] = [];

  constructor() {
    this.setupDefaultTransitions();
  }

  private setupDefaultTransitions(): void {
    this.transitions = [
      { from: 'idle', event: 'pointerdown', to: 'possible' },
      { from: 'possible', event: 'pointermove', to: 'began' },
      { from: 'possible', event: 'pointerup', to: 'ended' },
      { from: 'possible', event: 'timeout', to: 'failed' },
      { from: 'began', event: 'pointermove', to: 'changed' },
      { from: 'began', event: 'pointerup', to: 'ended' },
      { from: 'began', event: 'pointercancel', to: 'cancelled' },
      { from: 'changed', event: 'pointermove', to: 'changed' },
      { from: 'changed', event: 'pointerup', to: 'ended' },
      { from: 'changed', event: 'pointercancel', to: 'cancelled' },
      { from: 'ended', event: 'reset', to: 'idle' },
      { from: 'cancelled', event: 'reset', to: 'idle' },
      { from: 'failed', event: 'reset', to: 'idle' },
    ];
  }

  addTransition(transition: GestureTransition): void {
    this.transitions.push(transition);
  }

  getState(): GestureState {
    return this.state;
  }

  dispatch(event: GestureEvent, context?: unknown): GestureState {
    const transition = this.transitions.find(t => 
      t.from === this.state && 
      t.event === event &&
      (!t.condition || t.condition(context))
    );

    if (transition) {
      const prevState = this.state;
      this.state = transition.to;
      
      if (transition.action) {
        transition.action(context);
      }
      
      this.listeners.forEach(l => l(this.state, prevState));
    }

    return this.state;
  }

  reset(): void {
    this.dispatch('reset');
  }

  onStateChange(callback: (state: GestureState, prevState: GestureState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

export const gestureStateMachine = new GestureStateMachine();

// ---------------------------------------------------------------------------
// 747. Gesture Chaining
// ---------------------------------------------------------------------------

interface GestureChain {
  name: string;
  gestures: GestureType[];
  timeouts: number[];
  onComplete: () => void;
}

class GestureChainManager {
  private chains: GestureChain[] = [];
  private activeChains: Map<string, { index: number; lastTime: number }> = new Map();

  defineChain(chain: GestureChain): void {
    this.chains.push(chain);
    this.activeChains.set(chain.name, { index: 0, lastTime: 0 });
  }

  processGesture(gesture: GestureRecognition): void {
    const now = Date.now();

    this.chains.forEach(chain => {
      const state = this.activeChains.get(chain.name);
      if (!state) return;

      const expectedType = chain.gestures[state.index];
      const timeout = chain.timeouts[state.index] || 500;

      if (gesture.type === expectedType) {
        if (state.index === 0 || now - state.lastTime < timeout) {
          state.index++;
          state.lastTime = now;

          if (state.index >= chain.gestures.length) {
            chain.onComplete();
            state.index = 0;
          }
        } else {
          state.index = 0;
        }
      }
    });
  }

  removeChain(name: string): boolean {
    const index = this.chains.findIndex(c => c.name === name);
    if (index >= 0) {
      this.chains.splice(index, 1);
      this.activeChains.delete(name);
      return true;
    }
    return false;
  }

  resetChain(name: string): void {
    const state = this.activeChains.get(name);
    if (state) {
      state.index = 0;
      state.lastTime = 0;
    }
  }

  resetAllChains(): void {
    this.activeChains.forEach(state => {
      state.index = 0;
      state.lastTime = 0;
    });
  }
}

export const gestureChainManager = new GestureChainManager();

// ---------------------------------------------------------------------------
// 748. Gesture Timeout Configuration
// ---------------------------------------------------------------------------

class GestureTimeoutManager {
  private timeouts: Map<string, { duration: number; callback: () => void; timerId: NodeJS.Timeout | null }> = new Map();

  setTimeout(name: string, duration: number, callback: () => void): void {
    this.clearTimeout(name);
    
    const timerId = setTimeout(() => {
      callback();
      this.timeouts.delete(name);
    }, duration);

    this.timeouts.set(name, { duration, callback, timerId });
  }

  clearTimeout(name: string): void {
    const timeout = this.timeouts.get(name);
    if (timeout?.timerId) {
      clearTimeout(timeout.timerId);
      this.timeouts.delete(name);
    }
  }

  clearAllTimeouts(): void {
    this.timeouts.forEach(timeout => {
      if (timeout.timerId) {
        clearTimeout(timeout.timerId);
      }
    });
    this.timeouts.clear();
  }

  getTimeout(name: string): number | undefined {
    return this.timeouts.get(name)?.duration;
  }

  isActive(name: string): boolean {
    return this.timeouts.has(name);
  }
}

export const gestureTimeoutManager = new GestureTimeoutManager();

// ---------------------------------------------------------------------------
// 749. Gesture Momentum Transfer
// ---------------------------------------------------------------------------

class MomentumTransfer {
  transfer(
    fromGesture: GestureRecognition,
    toElement: HTMLElement,
    options: { friction?: number; maxVelocity?: number } = {}
  ): () => void {
    const { friction = 0.95, maxVelocity = 5000 } = options;
    
    let velocity = {
      x: Math.max(-maxVelocity, Math.min(maxVelocity, fromGesture.velocity.x)),
      y: Math.max(-maxVelocity, Math.min(maxVelocity, fromGesture.velocity.y)),
    };
    
    let rafId: number;
    let cancelled = false;

    const animate = () => {
      if (cancelled) return;
      
      if (Math.abs(velocity.x) < 0.5 && Math.abs(velocity.y) < 0.5) {
        return;
      }

      toElement.scrollLeft -= velocity.x * 0.016;
      toElement.scrollTop -= velocity.y * 0.016;

      velocity.x *= friction;
      velocity.y *= friction;

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }
}

export const momentumTransfer = new MomentumTransfer();

// ---------------------------------------------------------------------------
// 750. Gesture Dead Zone Calibration
// ---------------------------------------------------------------------------

class DeadZoneCalibrator {
  private deadZones: Map<string, number> = new Map([
    ['default', 10],
    ['mouse', 5],
    ['touch', 15],
    ['pen', 8],
  ]);

  getDeadZone(pointerType: string = 'default'): number {
    return this.deadZones.get(pointerType) || this.deadZones.get('default') || 10;
  }

  setDeadZone(pointerType: string, value: number): void {
    this.deadZones.set(pointerType, Math.max(0, value));
  }

  calibrate(samples: { x: number; y: number }[]): number {
    if (samples.length < 2) return this.getDeadZone();

    // Calculate average jitter
    let totalJitter = 0;
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].x - samples[i - 1].x;
      const dy = samples[i].y - samples[i - 1].y;
      totalJitter += Math.sqrt(dx * dx + dy * dy);
    }

    const avgJitter = totalJitter / (samples.length - 1);
    return Math.ceil(avgJitter * 2); // Double the average jitter
  }

  isWithinDeadZone(delta: { x: number; y: number }, pointerType?: string): boolean {
    const deadZone = this.getDeadZone(pointerType);
    return Math.abs(delta.x) < deadZone && Math.abs(delta.y) < deadZone;
  }
}

export const deadZoneCalibrator = new DeadZoneCalibrator();

// ---------------------------------------------------------------------------
// React Hooks for Gesture System
// ---------------------------------------------------------------------------

export function useGestureRecognizer(
  ref: React.RefObject<HTMLElement>,
  onGesture: (gesture: GestureRecognition) => void
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recognizer = new GestureRecognizer();
    const unsubscribe = recognizer.onGesture(onGesture);

    const handlePointerDown = (e: PointerEvent) => recognizer.handlePointerDown(e);
    const handlePointerMove = (e: PointerEvent) => recognizer.handlePointerMove(e);
    const handlePointerUp = (e: PointerEvent) => recognizer.handlePointerUp(e);
    const handlePointerCancel = (e: PointerEvent) => recognizer.handlePointerCancel(e);

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      unsubscribe();
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [ref, onGesture]);
}

export function useGestureDebug(enabled: boolean) {
  useEffect(() => {
    if (enabled) {
      gestureDebugger.enable();
    } else {
      gestureDebugger.disable();
    }

    return () => {
      gestureDebugger.disable();
    };
  }, [enabled]);
}

export function useHapticFeedback() {
  return {
    light: hapticFeedback.light.bind(hapticFeedback),
    medium: hapticFeedback.medium.bind(hapticFeedback),
    heavy: hapticFeedback.heavy.bind(hapticFeedback),
    success: hapticFeedback.success.bind(hapticFeedback),
    warning: hapticFeedback.warning.bind(hapticFeedback),
    error: hapticFeedback.error.bind(hapticFeedback),
    selection: hapticFeedback.selection.bind(hapticFeedback),
  };
}

export function usePlatformGestures() {
  const [platform] = useState(() => platformGestureAdapter.getPlatform());
  const [preset] = useState(() => platformGestureAdapter.getPreset());

  return { platform, preset };
}

export function useGestureChain(chain: Omit<GestureChain, 'onComplete'>, onComplete: () => void) {
  useEffect(() => {
    gestureChainManager.defineChain({ ...chain, onComplete });
    
    return () => {
      gestureChainManager.removeChain(chain.name);
    };
  }, [chain.name, chain.gestures, chain.timeouts, onComplete]);
}
