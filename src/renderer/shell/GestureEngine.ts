// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Gesture Engine
 * Intercepts trackpad/pointer input and classifies sequences into
 * named gestures. Components subscribe to the gesture event bus
 * rather than raw pointer events.
 */

import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// GESTURE TYPES
// ---------------------------------------------------------------------------

export type GestureType =
  | 'swipe-left'
  | 'swipe-right'
  | 'swipe-up-3'
  | 'swipe-down-3'
  | 'pinch-in'
  | 'pinch-out'
  | 'edge-swipe-left'
  | 'edge-swipe-right'
  | 'force-touch';

export interface GestureEvent {
  type: GestureType;
  /** Normalized progress 0..1 for continuous gestures */
  progress: number;
  /** Velocity in px/frame */
  velocity: number;
  /** Screen coordinates of gesture origin */
  originX: number;
  originY: number;
  /** Whether the gesture is being actively tracked (vs completed) */
  active: boolean;
  /** For pinch: scale value relative to 1.0 */
  scale?: number;
}

type GestureHandler = (event: GestureEvent) => void;

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const MIN_MOVEMENT_THRESHOLD = 6;
const HORIZONTAL_RATIO_THRESHOLD = 0.35;
const VERTICAL_RATIO_THRESHOLD = 0.35;
const SWIPE_FRAMES_REQUIRED = 2;
const EDGE_ZONE_PX = 24;
const PINCH_IN_THRESHOLD = 0.8;
const PINCH_OUT_THRESHOLD = 1.2;
const FORCE_TOUCH_PRESSURE = 0.6;

// ---------------------------------------------------------------------------
// ENGINE
// ---------------------------------------------------------------------------

class GestureEngineImpl {
  private _listeners = new Map<GestureType | '*', Set<GestureHandler>>();
  private _wheelBuffer: { dx: number; dy: number; ts: number }[] = [];
  private _isTracking = false;
  private _origin = { x: 0, y: 0 };
  private _cumulativeX = 0;
  private _cumulativeY = 0;
  private _frameCount = 0;
  private _gestureScale = 1;
  private _gestureActive = false;
  private _destroyed = false;

  // Bound handlers for cleanup
  private _onWheel: (e: WheelEvent) => void;
  private _onGestureStart: (e: any) => void;
  private _onGestureChange: (e: any) => void;
  private _onGestureEnd: (e: any) => void;
  private _onPointerDown: (e: PointerEvent) => void;

  constructor() {
    this._onWheel = this._handleWheel.bind(this);
    this._onGestureStart = this._handleGestureStart.bind(this);
    this._onGestureChange = this._handleGestureChange.bind(this);
    this._onGestureEnd = this._handleGestureEnd.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
  }

  init(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
    document.addEventListener('gesturestart', this._onGestureStart, { capture: true });
    document.addEventListener('gesturechange', this._onGestureChange, { capture: true });
    document.addEventListener('gestureend', this._onGestureEnd, { capture: true });
    document.addEventListener('pointerdown', this._onPointerDown, { capture: true });
  }

  destroy(): void {
    this._destroyed = true;
    if (this._trackingResetTimer) clearTimeout(this._trackingResetTimer);
    document.removeEventListener('wheel', this._onWheel, { capture: true });
    document.removeEventListener('gesturestart', this._onGestureStart, { capture: true });
    document.removeEventListener('gesturechange', this._onGestureChange, { capture: true });
    document.removeEventListener('gestureend', this._onGestureEnd, { capture: true });
    document.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    this._listeners.clear();
  }

  on(type: GestureType | '*', handler: GestureHandler): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(handler);
    return () => { this._listeners.get(type)?.delete(handler); };
  }

  private _emit(event: GestureEvent): void {
    if (this._destroyed) return;
    this._listeners.get(event.type)?.forEach(fn => fn(event));
    this._listeners.get('*')?.forEach(fn => fn(event));
    // Bridge to DOM so AppManager and other components can listen globally
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dex-gesture', { detail: event }));
    }
  }

  // -----------------------------------------------------------------------
  // WHEEL EVENTS (two-finger swipes on trackpad)
  // -----------------------------------------------------------------------

  private _handleWheel(e: WheelEvent): void {
    const now = performance.now();
    const dx = e.deltaX;
    const dy = e.deltaY;

    // Detect if this originates near an edge
    const isLeftEdge = e.clientX < EDGE_ZONE_PX;
    const isRightEdge = e.clientX > window.innerWidth - EDGE_ZONE_PX;

    // Buffer this frame
    this._wheelBuffer.push({ dx, dy, ts: now });

    // Keep only recent frames (100ms window)
    while (this._wheelBuffer.length > 0 && now - this._wheelBuffer[0].ts > 100) {
      this._wheelBuffer.shift();
    }

    if (!this._isTracking) {
      this._cumulativeX = 0;
      this._cumulativeY = 0;
      this._frameCount = 0;
      this._origin = { x: e.clientX, y: e.clientY };
    }

    this._cumulativeX += dx;
    this._cumulativeY += dy;
    this._frameCount++;

    const absDx = Math.abs(this._cumulativeX);
    const absDy = Math.abs(this._cumulativeY);

    // Movement below threshold: not a gesture yet
    if (absDx < MIN_MOVEMENT_THRESHOLD && absDy < MIN_MOVEMENT_THRESHOLD) {
      return;
    }

    // Classify direction
    const horizontalDominant = absDx > absDy && absDy < absDx * HORIZONTAL_RATIO_THRESHOLD;

    if (horizontalDominant && this._frameCount >= SWIPE_FRAMES_REQUIRED) {
      this._isTracking = true;
      const velocity = this._averageVelocity('x');
      const screenWidth = window.innerWidth;
      const progress = Math.min(1, absDx / (screenWidth * 0.5));
      const direction = this._cumulativeX > 0 ? 'right' : 'left';

      if (isLeftEdge && direction === 'right') {
        this._emit({
          type: 'edge-swipe-left',
          progress,
          velocity: Math.abs(velocity),
          originX: this._origin.x,
          originY: this._origin.y,
          active: true,
        });
      } else if (isRightEdge && direction === 'left') {
        this._emit({
          type: 'edge-swipe-right',
          progress,
          velocity: Math.abs(velocity),
          originX: this._origin.x,
          originY: this._origin.y,
          active: true,
        });
      } else {
        this._emit({
          type: direction === 'left' ? 'swipe-left' : 'swipe-right',
          progress,
          velocity: Math.abs(velocity),
          originX: this._origin.x,
          originY: this._origin.y,
          active: true,
        });
      }

      // Reset tracking after emission
      this._scheduleTrackingReset();
    }

    // Vertical-dominant: 3-finger swipe up / down (Mission Control / App Exposé)
    const verticalDominant = absDy > absDx && absDx < absDy * VERTICAL_RATIO_THRESHOLD;

    if (verticalDominant && this._frameCount >= SWIPE_FRAMES_REQUIRED) {
      this._isTracking = true;
      const velocity = this._averageVelocity('y');
      const screenHeight = window.innerHeight;
      const progress = Math.min(1, absDy / (screenHeight * 0.4));
      const direction = this._cumulativeY < 0 ? 'up' : 'down';

      this._emit({
        type: direction === 'up' ? 'swipe-up-3' : 'swipe-down-3',
        progress,
        velocity: Math.abs(velocity),
        originX: this._origin.x,
        originY: this._origin.y,
        active: true,
      });

      this._scheduleTrackingReset();
    }
  }

  private _trackingResetTimer: ReturnType<typeof setTimeout> | null = null;

  private _scheduleTrackingReset(): void {
    if (this._trackingResetTimer) clearTimeout(this._trackingResetTimer);
    this._trackingResetTimer = setTimeout(() => {
      if (this._isTracking) {
        const absDx = Math.abs(this._cumulativeX);
        const absDy = Math.abs(this._cumulativeY);
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isLeftEdge = this._origin.x < EDGE_ZONE_PX;
        const isRightEdge = this._origin.x > window.innerWidth - EDGE_ZONE_PX;

        const horizontalDominant = absDx > absDy && absDy < absDx * HORIZONTAL_RATIO_THRESHOLD;
        const verticalDominant = absDy > absDx && absDx < absDy * VERTICAL_RATIO_THRESHOLD;

        let type: GestureType;
        let progress: number;

        if (verticalDominant) {
          const direction = this._cumulativeY < 0 ? 'up' : 'down';
          type = direction === 'up' ? 'swipe-up-3' : 'swipe-down-3';
          progress = Math.min(1, absDy / (screenHeight * 0.4));
        } else {
          const direction = this._cumulativeX > 0 ? 'right' : 'left';
          progress = Math.min(1, absDx / (screenWidth * 0.5));
          if (isLeftEdge && direction === 'right') type = 'edge-swipe-left';
          else if (isRightEdge && direction === 'left') type = 'edge-swipe-right';
          else type = direction === 'left' ? 'swipe-left' : 'swipe-right';
        }

        this._emit({
          type,
          progress,
          velocity: horizontalDominant ? this._averageVelocity('x') : this._averageVelocity('y'),
          originX: this._origin.x,
          originY: this._origin.y,
          active: false,
        });
      }
      this._isTracking = false;
      this._wheelBuffer = [];
      this._cumulativeX = 0;
      this._cumulativeY = 0;
      this._frameCount = 0;
    }, 80);
  }

  private _averageVelocity(axis: 'x' | 'y'): number {
    if (this._wheelBuffer.length < 2) return 0;
    const first = this._wheelBuffer[0];
    const last = this._wheelBuffer[this._wheelBuffer.length - 1];
    const dt = last.ts - first.ts;
    if (dt === 0) return 0;
    const sum = this._wheelBuffer.reduce((s, f) => s + (axis === 'x' ? f.dx : f.dy), 0);
    return sum / (dt / 16.67);
  }

  // -----------------------------------------------------------------------
  // NATIVE GESTURE EVENTS (pinch, 3-finger on trackpads)
  // -----------------------------------------------------------------------

  private _handleGestureStart(e: any): void {
    this._gestureScale = 1;
    this._gestureActive = true;
    this._origin = { x: e.clientX || window.innerWidth / 2, y: e.clientY || window.innerHeight / 2 };
  }

  private _handleGestureChange(e: any): void {
    if (!this._gestureActive) return;
    this._gestureScale = e.scale ?? 1;
    if (this._gestureScale < PINCH_IN_THRESHOLD) {
      this._emit({
        type: 'pinch-in',
        progress: Math.min(1, (1 - this._gestureScale) / (1 - PINCH_IN_THRESHOLD)),
        velocity: 0,
        originX: this._origin.x,
        originY: this._origin.y,
        active: true,
        scale: this._gestureScale,
      });
    } else if (this._gestureScale > PINCH_OUT_THRESHOLD) {
      this._emit({
        type: 'pinch-out',
        progress: Math.min(1, (this._gestureScale - 1) / (PINCH_OUT_THRESHOLD - 1)),
        velocity: 0,
        originX: this._origin.x,
        originY: this._origin.y,
        active: true,
        scale: this._gestureScale,
      });
    }
  }

  private _handleGestureEnd(_e: any): void {
    if (!this._gestureActive) return;
    const type = this._gestureScale < PINCH_IN_THRESHOLD ? 'pinch-in' : 'pinch-out';
    if (this._gestureScale < PINCH_IN_THRESHOLD || this._gestureScale > PINCH_OUT_THRESHOLD) {
      this._emit({
        type,
        progress: 1,
        velocity: 0,
        originX: this._origin.x,
        originY: this._origin.y,
        active: false,
        scale: this._gestureScale,
      });
    }
    this._gestureActive = false;
    this._gestureScale = 1;
  }

  // -----------------------------------------------------------------------
  // POINTER EVENTS (force touch)
  // -----------------------------------------------------------------------

  private _handlePointerDown(e: PointerEvent): void {
    if (e.pressure > FORCE_TOUCH_PRESSURE && e.pointerType !== 'mouse') {
      this._emit({
        type: 'force-touch',
        progress: e.pressure,
        velocity: 0,
        originX: e.clientX,
        originY: e.clientY,
        active: true,
      });
    }
  }

  /** Alias for init() - starts the gesture engine */
  start(): void {
    this.init();
  }

  /** Alias for destroy() - stops the gesture engine */
  stop(): void {
    this.destroy();
  }
}

// ---------------------------------------------------------------------------
// SINGLETON
// ---------------------------------------------------------------------------

export const gestureEngine = new GestureEngineImpl();
