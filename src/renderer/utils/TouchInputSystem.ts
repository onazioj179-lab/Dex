// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Touch and Stylus Input System for DEX
// Uses Pointer Events API exclusively - no Touch Events API

import { Z_HELP_OVERLAY_MAX } from '../../shared/zIndex';
import { MAX_CONTACTS } from '../shell/input/touchContacts';
import { initTouchDensity } from './touchDensity';

type GestureType =
  | 'tap'
  | 'double-tap'
  | 'long-press'
  | 'two-finger-scroll'
  | 'two-finger-pinch'
  | 'two-finger-spread'
  | 'three-finger-swipe-left'
  | 'three-finger-swipe-right'
  | 'three-finger-swipe-up'
  | 'three-finger-swipe-down'
  /** One finger from the bottom screen edge upward (iPad / phone home gesture). */
  | 'edge-swipe-up'
  | 'touch-drag';

type PressureCurvePreset = 'linear' | 'soft' | 'firm';

interface GestureEvent {
  type: GestureType;
  centerX: number;
  centerY: number;
  scale?: number;
  deltaX?: number;
  deltaY?: number;
  target: EventTarget | null;
  /** Every contact started on the bare desktop/shell, not inside an app window or
   *  a touch surface that handles its own gestures. System gestures (overview,
   *  app switching) should only act when this is true. */
  onDesktop?: boolean;
}

interface ActivePointer {
  id: number;
  type: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  width: number;
  height: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  buttons: number;
  isPrimary: boolean;
  target: EventTarget | null;
  /** Started inside an app window or a self-handling touch surface. */
  inApp: boolean;
}

interface StylusState {
  isActive: boolean;
  lastActiveTime: number;
  pressureCurve: PressureCurvePreset;
  barrelButton1Action: string;
  barrelButton2Action: string;
}

type GestureCallback = (event: GestureEvent) => void;

const LONG_PRESS_MS = 400; // Reduced from 500ms for snappier touch feel
const TOUCH_DRAG_DELAY_MS = 200;
const DOUBLE_TAP_MS = 300;
const TAP_DISTANCE_THRESHOLD = 10;
const SWIPE_THRESHOLD = 50;
/** A bottom-edge swipe must start this close to the screen edge ... */
const EDGE_START_PX = 24;
/** ... and travel this far up. */
const EDGE_SWIPE_DISTANCE = 72;
const PINCH_THRESHOLD = 10;
const PALM_AREA_THRESHOLD = 400;
const STYLUS_TIMEOUT_MS = 2000;

// TAP SAFETY: Prevent accidental taps
const MIN_TAP_DURATION_MS = 50; // Must hold for at least 50ms to register tap
const TAP_COOLDOWN_MS = 150; // Minimum time between taps on same target

class GestureRecognizer {
  private pointers: Map<number, ActivePointer> = new Map();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private lastTapTarget: EventTarget | null = null; // Track last tap target for cooldown
  private gestureCallbacks: Map<GestureType, Set<GestureCallback>> = new Map();
  private element: HTMLElement | null = null;
  private dragState: {
    active: boolean;
    pointerId: number;
    clone: HTMLElement | null;
    startTarget: EventTarget | null;
  } | null = null;
  private initialPinchDistance = 0;
  /** One system pinch/spread or swipe-up per gesture, not one per pointermove. */
  private pinchLatched = false;
  private swipeUpLatched = false;
  private swipeDownLatched = false;
  private edgeUpLatched = false;
  private contactListeners: Set<(count: number) => void> = new Set();

  attach(element: HTMLElement): void {
    this.element = element;
    // Capture phase: an app that stops propagation of its pointerup must not
    // leave a ghost contact here (which made every later single touch count as
    // two). Never pointer-captures anything itself: capturing on <body> stole
    // capture from the element the finger was actually dragging.
    element.addEventListener('pointerdown', this.onPointerDown, true);
    element.addEventListener('pointermove', this.onPointerMove, true);
    element.addEventListener('pointerup', this.onPointerUp, true);
    element.addEventListener('pointercancel', this.onPointerCancel, true);
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.element) return;
    this.element.removeEventListener('pointerdown', this.onPointerDown, true);
    this.element.removeEventListener('pointermove', this.onPointerMove, true);
    this.element.removeEventListener('pointerup', this.onPointerUp, true);
    this.element.removeEventListener('pointercancel', this.onPointerCancel, true);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.element = null;
    this.pointers.clear();
    this.clearLongPress();
    this.notifyContacts();
  }

  /** Live count of tracked contacts (diagnostics: Settings > Touch & Pen). */
  onContacts(cb: (count: number) => void): () => void {
    this.contactListeners.add(cb);
    return () => { this.contactListeners.delete(cb); };
  }

  get contactCount(): number { return this.pointers.size; }

  private notifyContacts(): void {
    for (const cb of this.contactListeners) {
      try { cb(this.pointers.size); } catch (_e) { /* ignore */ }
    }
  }

  private onDesktop(pts: ActivePointer[]): boolean {
    return pts.every((p) => !p.inApp);
  }

  on(type: GestureType, callback: GestureCallback): () => void {
    if (!this.gestureCallbacks.has(type)) {
      this.gestureCallbacks.set(type, new Set());
    }
    this.gestureCallbacks.get(type)!.add(callback);
    return () => { this.gestureCallbacks.get(type)?.delete(callback); };
  }

  private emit(event: GestureEvent): void {
    const callbacks = this.gestureCallbacks.get(event.type);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(event); } catch (_e) { /* ignore */ }
      }
    }
  }

  private onContextMenu = (e: Event): void => {
    if (this.pointers.size > 0) {
      e.preventDefault();
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && stylusInputManager.isStylusActive()) {
      const area = (e.width || 1) * (e.height || 1);
      if (area > PALM_AREA_THRESHOLD) {
        return;
      }
    }

    // A primary touch means no other touch is down (Pointer Events spec), so any
    // touch still tracked lost its pointerup. Same for a new mouse press.
    if ((e.pointerType === 'touch' && e.isPrimary) || e.pointerType === 'mouse') {
      for (const [id, p] of this.pointers) if (p.type === e.pointerType) this.pointers.delete(id);
    }
    if (this.pointers.size === 0) { this.pinchLatched = false; this.swipeUpLatched = false; this.swipeDownLatched = false; this.edgeUpLatched = false; }
    if (!this.pointers.has(e.pointerId) && this.pointers.size >= MAX_CONTACTS) return;

    const startEl = e.target as Element | null;
    const pointer: ActivePointer = {
      id: e.pointerId,
      type: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      startTime: Date.now(),
      width: e.width || 1,
      height: e.height || 1,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      buttons: e.buttons,
      isPrimary: e.isPrimary,
      target: e.target,
      inApp: !!startEl?.closest?.('[data-floating-window], [data-app-id]:not([data-app-id="home"]), [data-touch-surface], canvas, [contenteditable="true"]'),
    };

    this.pointers.set(e.pointerId, pointer);
    this.notifyContacts();

    if (e.pointerType === 'pen') {
      stylusInputManager.onStylusActivity(e);
    }

    if (this.pointers.size === 1 && (e.pointerType === 'touch' || e.pointerType === 'mouse')) {
      this.startLongPress(pointer);
    }

    if (this.pointers.size === 2) {
      this.clearLongPress();
      const pts = Array.from(this.pointers.values());
      this.initialPinchDistance = this.distanceBetween(pts[0], pts[1]);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    pointer.currentX = e.clientX;
    pointer.currentY = e.clientY;
    pointer.pressure = e.pressure;
    pointer.tiltX = e.tiltX;
    pointer.tiltY = e.tiltY;
    pointer.twist = e.twist;

    if (e.pointerType === 'pen') {
      stylusInputManager.onStylusActivity(e);
    }

    if (this.pointers.size === 1) {
      const dist = Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY);
      if (dist > TAP_DISTANCE_THRESHOLD) {
        this.clearLongPress();
      }

      if (this.dragState?.active && this.dragState.pointerId === e.pointerId) {
        this.updateDragClone(e.clientX, e.clientY);
        this.emit({
          type: 'touch-drag',
          centerX: e.clientX,
          centerY: e.clientY,
          deltaX: e.clientX - pointer.startX,
          deltaY: e.clientY - pointer.startY,
          target: pointer.target
        });
      }
    }

    if (this.pointers.size === 2) {
      const pts = Array.from(this.pointers.values());
      const currentDist = this.distanceBetween(pts[0], pts[1]);
      const centerX = (pts[0].currentX + pts[1].currentX) / 2;
      const centerY = (pts[0].currentY + pts[1].currentY) / 2;

      const avgDeltaX = ((pts[0].currentX - pts[0].startX) + (pts[1].currentX - pts[1].startX)) / 2;
      const avgDeltaY = ((pts[0].currentY - pts[0].startY) + (pts[1].currentY - pts[1].startY)) / 2;

      const scaleDiff = currentDist - this.initialPinchDistance;

      if (Math.abs(scaleDiff) > PINCH_THRESHOLD) {
        if (!this.pinchLatched) {
          this.pinchLatched = true;
          const scale = currentDist / (this.initialPinchDistance || 1);
          this.emit({
            type: scaleDiff > 0 ? 'two-finger-spread' : 'two-finger-pinch',
            centerX,
            centerY,
            scale,
            target: pts[0].target,
            onDesktop: this.onDesktop(pts),
          });
        }
      } else if (!this.pinchLatched && (Math.abs(avgDeltaY) > TAP_DISTANCE_THRESHOLD || Math.abs(avgDeltaX) > TAP_DISTANCE_THRESHOLD)) {
        this.emit({
          type: 'two-finger-scroll',
          centerX,
          centerY,
          deltaX: avgDeltaX,
          deltaY: avgDeltaY,
          target: pts[0].target
        });
      }
    }

    // One finger dragged up from the bottom screen edge (touch only).
    if (this.pointers.size === 1 && !this.edgeUpLatched) {
      const p = Array.from(this.pointers.values())[0];
      const fromEdge = typeof window !== 'undefined' && p.startY >= window.innerHeight - EDGE_START_PX;
      if (p.type === 'touch' && fromEdge && p.startY - p.currentY > EDGE_SWIPE_DISTANCE && Math.abs(p.currentX - p.startX) < p.startY - p.currentY) {
        this.edgeUpLatched = true;
        this.emit({ type: 'edge-swipe-up', centerX: p.currentX, centerY: p.currentY, deltaY: p.currentY - p.startY, target: p.target, onDesktop: true });
      }
    }

    if (this.pointers.size === 3) {
      const pts = Array.from(this.pointers.values());
      const avgDeltaX = pts.reduce((s, p) => s + (p.currentX - p.startX), 0) / 3;
      const avgDeltaY = pts.reduce((s, p) => s + (p.currentY - p.startY), 0) / 3;

      if (Math.abs(avgDeltaX) > SWIPE_THRESHOLD && Math.abs(avgDeltaX) > Math.abs(avgDeltaY)) {
        this.emit({
          type: avgDeltaX > 0 ? 'three-finger-swipe-right' : 'three-finger-swipe-left',
          centerX: pts[0].currentX,
          centerY: pts[0].currentY,
          deltaX: avgDeltaX,
          target: pts[0].target,
          onDesktop: this.onDesktop(pts),
        });
        for (const p of pts) {
          p.startX = p.currentX;
          p.startY = p.currentY;
        }
      } else if (!this.swipeDownLatched && avgDeltaY > SWIPE_THRESHOLD && Math.abs(avgDeltaY) > Math.abs(avgDeltaX)) {
        this.swipeDownLatched = true;
        this.emit({
          type: 'three-finger-swipe-down',
          centerX: pts[0].currentX,
          centerY: pts[0].currentY,
          deltaY: avgDeltaY,
          target: pts[0].target,
          onDesktop: this.onDesktop(pts),
        });
      } else if (!this.swipeUpLatched && avgDeltaY < -SWIPE_THRESHOLD && Math.abs(avgDeltaY) > Math.abs(avgDeltaX)) {
        this.swipeUpLatched = true;
        this.emit({
          type: 'three-finger-swipe-up',
          centerX: pts[0].currentX,
          centerY: pts[0].currentY,
          deltaY: avgDeltaY,
          target: pts[0].target,
          onDesktop: this.onDesktop(pts),
        });
        for (const p of pts) {
          p.startX = p.currentX;
          p.startY = p.currentY;
        }
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    this.clearLongPress();

    if (this.dragState?.active && this.dragState.pointerId === e.pointerId) {
      this.endDrag();
    }

    if (this.pointers.size === 1) {
      const dist = Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY);
      const duration = Date.now() - pointer.startTime;

      // TAP SAFETY: Only register tap if held long enough and within distance threshold
      if (dist < TAP_DISTANCE_THRESHOLD && duration < LONG_PRESS_MS && duration >= MIN_TAP_DURATION_MS) {
        const now = Date.now();
        
        // TAP SAFETY: Check cooldown for same target to prevent double-clicks on wrong app
        const isSameTarget = this.lastTapTarget === e.target;
        const timeSinceLastTap = now - this.lastTapTime;
        const inCooldown = isSameTarget && timeSinceLastTap < TAP_COOLDOWN_MS && timeSinceLastTap > DOUBLE_TAP_MS;
        
        if (inCooldown) {
          // Skip this tap - too soon after last tap on same target
        } else if (now - this.lastTapTime < DOUBLE_TAP_MS &&
            Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY) < TAP_DISTANCE_THRESHOLD) {
          this.emit({ type: 'double-tap', centerX: e.clientX, centerY: e.clientY, target: e.target });
          this.lastTapTime = 0;
          this.lastTapTarget = null;
        } else {
          this.emit({ type: 'tap', centerX: e.clientX, centerY: e.clientY, target: e.target });
          this.lastTapTime = now;
          this.lastTapX = e.clientX;
          this.lastTapY = e.clientY;
          this.lastTapTarget = e.target;
        }
      }
    }

    this.pointers.delete(e.pointerId);
    this.notifyContacts();
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.notifyContacts();
    this.clearLongPress();
    if (this.dragState?.active) {
      this.endDrag();
    }
  };

  private startLongPress(pointer: ActivePointer): void {
    this.clearLongPress();
    this.longPressTimer = setTimeout(() => {
      const currentPointer = this.pointers.get(pointer.id);
      if (!currentPointer) return;
      const dist = Math.hypot(currentPointer.currentX - pointer.startX, currentPointer.currentY - pointer.startY);
      if (dist < TAP_DISTANCE_THRESHOLD) {
        this.emit({
          type: 'long-press',
          centerX: currentPointer.currentX,
          centerY: currentPointer.currentY,
          target: currentPointer.target
        });

        const draggable = this.findDraggable(currentPointer.target);
        if (draggable) {
          this.startDrag(pointer.id, draggable, currentPointer.currentX, currentPointer.currentY);
        }
      }
    }, LONG_PRESS_MS);
  }

  private clearLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private findDraggable(target: EventTarget | null): HTMLElement | null {
    let el = target as HTMLElement | null;
    while (el) {
      if (el.draggable || el.dataset.touchDraggable === 'true') return el;
      el = el.parentElement;
    }
    return null;
  }

  private startDrag(pointerId: number, element: HTMLElement, x: number, y: number): void {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.zIndex = String(Z_HELP_OVERLAY_MAX);
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.8';
    clone.style.transform = 'scale(1.05)';
    const rect = element.getBoundingClientRect();
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = `${x - rect.width / 2}px`;
    clone.style.top = `${y - rect.height / 2}px`;
    document.body.appendChild(clone);

    this.dragState = {
      active: true,
      pointerId,
      clone,
      startTarget: element
    };
  }

  private updateDragClone(x: number, y: number): void {
    if (!this.dragState?.clone) return;
    const rect = this.dragState.clone.getBoundingClientRect();
    this.dragState.clone.style.left = `${x - rect.width / 2}px`;
    this.dragState.clone.style.top = `${y - rect.height / 2}px`;
  }

  private endDrag(): void {
    if (this.dragState?.clone) {
      this.dragState.clone.remove();
    }
    this.dragState = null;
  }

  private distanceBetween(a: ActivePointer, b: ActivePointer): number {
    return Math.hypot(a.currentX - b.currentX, a.currentY - b.currentY);
  }

  destroy(): void {
    this.detach();
    this.gestureCallbacks.clear();
  }
}

class StylusInputManager {
  private stylusState: StylusState = {
    isActive: false,
    lastActiveTime: 0,
    pressureCurve: 'linear',
    barrelButton1Action: 'context-menu',
    barrelButton2Action: 'undo'
  };

  private stylusTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private drawingSurfaces: Set<HTMLElement> = new Set();
  private hoverCallbacks: Set<(e: PointerEvent) => void> = new Set();
  private pressureCallbacks: Set<(pressure: number, mappedWidth: number) => void> = new Set();
  private tiltCallbacks: Set<(tiltX: number, tiltY: number, twist: number) => void> = new Set();
  private buttonCallbacks: Map<string, Set<() => void>> = new Map();

  isStylusActive(): boolean {
    return this.stylusState.isActive;
  }

  onStylusActivity(e: PointerEvent): void {
    if (e.pointerType !== 'pen') return;

    this.stylusState.isActive = true;
    this.stylusState.lastActiveTime = Date.now();

    if (this.stylusTimeoutTimer) clearTimeout(this.stylusTimeoutTimer);
    this.stylusTimeoutTimer = setTimeout(() => {
      this.stylusState.isActive = false;
    }, STYLUS_TIMEOUT_MS);
  }

  registerDrawingSurface(element: HTMLElement): () => void {
    this.drawingSurfaces.add(element);

    element.style.touchAction = 'none';

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        this.onStylusActivity(e);

        if (e.button === 2 || e.button === 5) {
          this.handleBarrelButton(1);
          e.preventDefault();
          return;
        }
        if (e.button === 4) {
          this.handleBarrelButton(2);
          e.preventDefault();
          return;
        }

        if ((e as any).pointerType === 'pen' && e.buttons === 32) {
          this.handleEraserEnd(element);
          return;
        }
      }

      if (e.pointerType === 'touch' && this.stylusState.isActive) {
        const area = (e.width || 1) * (e.height || 1);
        if (area > PALM_AREA_THRESHOLD) {
          e.preventDefault();
          return;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        this.onStylusActivity(e);

        const mappedPressure = this.mapPressure(e.pressure);
        for (const cb of this.pressureCallbacks) {
          try { cb(e.pressure, mappedPressure); } catch (_e) { /* ignore */ }
        }

        for (const cb of this.tiltCallbacks) {
          try { cb(e.tiltX, e.tiltY, e.twist); } catch (_e) { /* ignore */ }
        }

        if (e.buttons === 0) {
          for (const cb of this.hoverCallbacks) {
            try { cb(e); } catch (_e) { /* ignore */ }
          }
        }
      }
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);

    return () => {
      this.drawingSurfaces.delete(element);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
    };
  }

  mapPressure(rawPressure: number): number {
    const p = Math.max(0, Math.min(1, rawPressure));
    switch (this.stylusState.pressureCurve) {
      case 'soft':
        return Math.pow(p, 0.5);
      case 'firm':
        return Math.pow(p, 2.0);
      case 'linear':
      default:
        return p;
    }
  }

  pressureToStrokeWidth(rawPressure: number, minWidth: number, maxWidth: number): number {
    const mapped = this.mapPressure(rawPressure);
    return minWidth + mapped * (maxWidth - minWidth);
  }

  setPressureCurve(preset: PressureCurvePreset): void {
    this.stylusState.pressureCurve = preset;
  }

  setBarrelButtonAction(button: 1 | 2, action: string): void {
    if (button === 1) this.stylusState.barrelButton1Action = action;
    else this.stylusState.barrelButton2Action = action;
  }

  private handleBarrelButton(button: 1 | 2): void {
    const action = button === 1 ? this.stylusState.barrelButton1Action : this.stylusState.barrelButton2Action;
    const callbacks = this.buttonCallbacks.get(action);
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(); } catch (_e) { /* ignore */ }
      }
    }
  }

  private handleEraserEnd(surface: HTMLElement): void {
    surface.dispatchEvent(new CustomEvent('dex-stylus-eraser', { bubbles: true }));
  }

  onHover(callback: (e: PointerEvent) => void): () => void {
    this.hoverCallbacks.add(callback);
    return () => { this.hoverCallbacks.delete(callback); };
  }

  onPressure(callback: (raw: number, mapped: number) => void): () => void {
    this.pressureCallbacks.add(callback);
    return () => { this.pressureCallbacks.delete(callback); };
  }

  onTilt(callback: (tiltX: number, tiltY: number, twist: number) => void): () => void {
    this.tiltCallbacks.add(callback);
    return () => { this.tiltCallbacks.delete(callback); };
  }

  onButtonAction(action: string, callback: () => void): () => void {
    if (!this.buttonCallbacks.has(action)) {
      this.buttonCallbacks.set(action, new Set());
    }
    this.buttonCallbacks.get(action)!.add(callback);
    return () => { this.buttonCallbacks.get(action)?.delete(callback); };
  }

  getState(): StylusState {
    return { ...this.stylusState };
  }

  destroy(): void {
    if (this.stylusTimeoutTimer) clearTimeout(this.stylusTimeoutTimer);
    this.drawingSurfaces.clear();
    this.hoverCallbacks.clear();
    this.pressureCallbacks.clear();
    this.tiltCallbacks.clear();
    this.buttonCallbacks.clear();
  }
}

class SoftKeyboardHandler {
  private originalHeight = 0;
  private isKeyboardVisible = false;
  private resizeCallbacks: Set<(visible: boolean, availableHeight: number) => void> = new Set();

  initialize(): void {
    if (typeof window === 'undefined') return;

    if (window.visualViewport) {
      this.originalHeight = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', this.onViewportResize);
    }
  }

  private onViewportResize = (): void => {
    if (!window.visualViewport) return;

    const currentHeight = window.visualViewport.height;
    const threshold = this.originalHeight * 0.75;
    const wasVisible = this.isKeyboardVisible;

    if (currentHeight < threshold && !this.isKeyboardVisible) {
      this.isKeyboardVisible = true;
      this.notifyResize(true, currentHeight);
      this.scrollFocusedElementIntoView();
    } else if (currentHeight >= threshold && this.isKeyboardVisible) {
      this.isKeyboardVisible = false;
      this.notifyResize(false, currentHeight);
    }
  };

  private scrollFocusedElementIntoView(): void {
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      requestAnimationFrame(() => {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  private notifyResize(visible: boolean, availableHeight: number): void {
    for (const cb of this.resizeCallbacks) {
      try { cb(visible, availableHeight); } catch (_e) { /* ignore */ }
    }
  }

  onKeyboardChange(callback: (visible: boolean, availableHeight: number) => void): () => void {
    this.resizeCallbacks.add(callback);
    return () => { this.resizeCallbacks.delete(callback); };
  }

  isVisible(): boolean {
    return this.isKeyboardVisible;
  }

  destroy(): void {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.onViewportResize);
    }
    this.resizeCallbacks.clear();
  }
}


function injectTouchTargetCSS(): void {
  if (typeof document === 'undefined') return;
  const id = 'dex-touch-targets-css';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .dex-touch-target {
      position: relative;
    }
    .dex-touch-target::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      min-width: 44px;
      min-height: 44px;
      transform: translate(-50%, -50%);
    }
    button, [role="button"], a, input[type="checkbox"], input[type="radio"], select {
      position: relative;
    }
    /* Touch density (Settings > Touch & Pen; utils/touchDensity.ts): 44 px hit
       areas on every control, and larger visible shell controls. */
    [data-dex-density="touch"] button::after, [data-dex-density="touch"] [role="button"]::after,
    [data-dex-density="touch"] a::after, [data-dex-density="touch"] input[type="checkbox"]::after,
    [data-dex-density="touch"] input[type="radio"]::after, [data-dex-density="touch"] select::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      min-width: 44px;
      min-height: 44px;
      transform: translate(-50%, -50%);
    }
    [data-dex-density="touch"] [role="menuitem"], [data-dex-density="touch"] [role="menuitemcheckbox"],
    [data-dex-density="touch"] [role="menuitemradio"], [data-dex-density="touch"] [role="option"] {
      min-height: 40px !important;
    }
    [data-dex-density="touch"] [data-dex-chrome="control-center"] button,
    [data-dex-density="touch"] [data-dex-chrome="control-center"] [role="switch"],
    [data-dex-density="touch"] [data-dex-chrome="dex-bar"] button {
      min-height: 40px !important;
      min-width: 40px !important;
    }
  `;
  document.head.appendChild(style);
}

export const gestureRecognizer = new GestureRecognizer();
export const stylusInputManager = new StylusInputManager();
export const softKeyboardHandler = new SoftKeyboardHandler();

export function initializeTouchSystem(): void {
  injectTouchTargetCSS();
  initTouchDensity();
  softKeyboardHandler.initialize();
}

export {
  GestureRecognizer,
  StylusInputManager,
  SoftKeyboardHandler,
};
export type {
  GestureEvent,
  GestureType,
  PressureCurvePreset,
  ActivePointer,
  StylusState,
  GestureCallback
};
