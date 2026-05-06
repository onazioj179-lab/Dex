// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Motion Controller
 * Spring physics engine, momentum scroller, and reduce-motion compliance.
 * Single source of animation truth for the entire DEX UI.
 */

// ---------------------------------------------------------------------------
// SPRING PRESETS
// ---------------------------------------------------------------------------

export const SPRING_PRESETS = {
  // Core UI -- 80% faster: stiffness x5, mass x0.2
  navigation:    { stiffness: 2500, damping: 80,  mass: 0.12 },
  panel:         { stiffness: 3000, damping: 90,  mass: 0.10 },
  modal:         { stiffness: 3500, damping: 100, mass: 0.08 },
  tooltip:       { stiffness: 4000, damping: 100, mass: 0.06 },
  listReorder:   { stiffness: 2000, damping: 70,  mass: 0.12 },
  dockHover:     { stiffness: 5000, damping: 120, mass: 0.04 },
  buttonPress:   { stiffness: 6000, damping: 140, mass: 0.03 },
  notification:  { stiffness: 3000, damping: 84,  mass: 0.10 },
  dropdown:      { stiffness: 3500, damping: 96,  mass: 0.08 },
  contextMenu:   { stiffness: 4000, damping: 104, mass: 0.06 },
  // Elastic overscroll -- iOS-like rubber band
  elasticBounce: { stiffness: 400,  damping: 30,  mass: 0.8  },
  elasticSnap:   { stiffness: 600,  damping: 35,  mass: 0.6  },
  // Gesture & app switching
  gestureSwipe:     { stiffness: 2500, damping: 76,  mass: 0.12 },
  windowSnap:       { stiffness: 3000, damping: 90,  mass: 0.10 },
  windowLift:       { stiffness: 4000, damping: 108, mass: 0.06 },
  // Notifications
  notificationBanner: { stiffness: 3000, damping: 84, mass: 0.10 },
  // Panels & sidebars
  panelSlide:       { stiffness: 3000, damping: 84,  mass: 0.10 },
  sidebarCollapse:  { stiffness: 3250, damping: 92,  mass: 0.08 },
  // Popover & quick look
  popover:          { stiffness: 3750, damping: 100, mass: 0.06 },
  quickLook:        { stiffness: 3500, damping: 96,  mass: 0.08 },
  // Context menu
  contextMenuEntry: { stiffness: 4250, damping: 108, mass: 0.06 },
  menuSelection:    { stiffness: 4250, damping: 120, mass: 0.04 },
  // Toggle & form
  toggle:           { stiffness: 3750, damping: 100, mass: 0.06 },
  // List selection
  listSelection:    { stiffness: 3250, damping: 90,  mass: 0.08 },
  // Drag & drop rejection
  dragReject:       { stiffness: 4000, damping: 120, mass: 0.10 },
  // Input validation shake
  inputShake:       { stiffness: 4000, damping: 40,  mass: 0.06 },
  // Progress overshoot
  progressFill:     { stiffness: 2500, damping: 76,  mass: 0.12 },
  // Overview
  overviewCard:     { stiffness: 3000, damping: 84,  mass: 0.10 },
} as const;

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

// ---------------------------------------------------------------------------
// REDUCE MOTION
// ---------------------------------------------------------------------------

let _reduceMotion = false;
let _mediaQuery: MediaQueryList | null = null;
let _mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;
const _listeners: Set<(reduced: boolean) => void> = new Set();

export function initReduceMotion(): void {
  if (typeof window === 'undefined') return;
  // Cleanup previous listener if re-initialized (e.g., HMR)
  if (_mediaQuery && _mediaQueryHandler) {
    _mediaQuery.removeEventListener('change', _mediaQueryHandler);
  }
  _mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reduceMotion = _mediaQuery.matches;
  _mediaQueryHandler = (e: MediaQueryListEvent) => {
    _reduceMotion = e.matches;
    _listeners.forEach(fn => fn(_reduceMotion));
    if (_reduceMotion) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  };
  if (_reduceMotion) {
    document.documentElement.classList.add('reduce-motion');
  }
  _mediaQuery.addEventListener('change', _mediaQueryHandler);
}

/** Cleanup reduce-motion listener (call on HMR or teardown) */
export function destroyReduceMotion(): void {
  if (_mediaQuery && _mediaQueryHandler) {
    _mediaQuery.removeEventListener('change', _mediaQueryHandler);
    _mediaQueryHandler = null;
  }
  _listeners.clear();
}

export function isReduceMotion(): boolean {
  return _reduceMotion;
}

export function onReduceMotionChange(fn: (reduced: boolean) => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ---------------------------------------------------------------------------
// SPRING ANIMATOR
// ---------------------------------------------------------------------------

export class SpringAnimator {
  private _stiffness: number;
  private _damping: number;
  private _mass: number;
  private _value: number;
  private _target: number;
  private _velocity: number;
  private _raf: number | null = null;
  private _onUpdate: ((value: number) => void) | null = null;
  private _onComplete: (() => void) | null = null;
  private _settled = true;
  private _lastTime = 0;
  private _restThreshold = 0.001;
  private _restVelocityThreshold = 0.001;

  constructor(config: SpringConfig, initialValue = 0) {
    this._stiffness = config.stiffness;
    this._damping = config.damping;
    this._mass = config.mass;
    this._value = initialValue;
    this._target = initialValue;
    this._velocity = 0;
  }

  get value(): number { return this._value; }
  get target(): number { return this._target; }
  get settled(): boolean { return this._settled; }

  onUpdate(fn: (value: number) => void): this {
    this._onUpdate = fn;
    return this;
  }

  onComplete(fn: () => void): this {
    this._onComplete = fn;
    return this;
  }

  setTarget(target: number): void {
    if (_reduceMotion) {
      this._cancel();
      this._value = target;
      this._target = target;
      this._velocity = 0;
      this._settled = true;
      this._onUpdate?.(target);
      this._onComplete?.();
      return;
    }
    this._target = target;
    this._settled = false;
    if (this._raf === null) {
      this._lastTime = performance.now();
      this._tick();
    }
  }

  setValue(value: number): void {
    this._cancel();
    this._value = value;
    this._target = value;
    this._velocity = 0;
    this._settled = true;
    this._onUpdate?.(value);
  }

  stop(): void {
    this._cancel();
    this._settled = true;
  }

  destroy(): void {
    this._cancel();
    this._onUpdate = null;
    this._onComplete = null;
  }

  private _cancel(): void {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  private _tick = (): void => {
    const now = performance.now();
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    // Clamp delta to prevent spiral of death
    if (dt > 0.064) dt = 0.064;

    // RK4 integration for stability
    const k = this._stiffness;
    const c = this._damping;
    const m = this._mass;

    const displacement = this._value - this._target;
    const springForce = -k * displacement;
    const dampingForce = -c * this._velocity;
    const acceleration = (springForce + dampingForce) / m;

    this._velocity += acceleration * dt;
    this._value += this._velocity * dt;

    // Check settled
    const atRest =
      Math.abs(this._value - this._target) < this._restThreshold &&
      Math.abs(this._velocity) < this._restVelocityThreshold;

    if (atRest) {
      this._value = this._target;
      this._velocity = 0;
      this._settled = true;
      this._raf = null;
      this._onUpdate?.(this._value);
      this._onComplete?.();
      return;
    }

    this._onUpdate?.(this._value);
    this._raf = requestAnimationFrame(this._tick);
  };
}

// ---------------------------------------------------------------------------
// MOMENTUM SCROLLER
// ---------------------------------------------------------------------------

export interface MomentumScrollerConfig {
  friction?: number;         // per-frame deceleration, default 0.95
  snapPoints?: number[];     // optional snap positions
  snapThreshold?: number;    // distance within which to snap
}

export class MomentumScroller {
  private _position = 0;
  private _velocity = 0;
  private _friction: number;
  private _snapPoints: number[];
  private _snapThreshold: number;
  private _raf: number | null = null;
  private _onScroll: ((position: number) => void) | null = null;
  private _onSettle: (() => void) | null = null;
  private _spring: SpringAnimator | null = null;

  constructor(config: MomentumScrollerConfig = {}) {
    this._friction = config.friction ?? 0.95;
    this._snapPoints = config.snapPoints ?? [];
    this._snapThreshold = config.snapThreshold ?? 100;
  }

  get position(): number { return this._position; }

  onScroll(fn: (position: number) => void): this {
    this._onScroll = fn;
    return this;
  }

  onSettle(fn: () => void): this {
    this._onSettle = fn;
    return this;
  }

  setPosition(pos: number): void {
    this._stop();
    this._position = pos;
    this._velocity = 0;
  }

  release(velocity: number): void {
    if (_reduceMotion) {
      // No momentum coast with reduce motion
      this._onSettle?.();
      return;
    }
    this._velocity = velocity;
    if (this._raf === null) {
      this._coast();
    }
  }

  stop(): void {
    this._stop();
  }

  destroy(): void {
    this._stop();
    this._spring?.destroy();
    this._onScroll = null;
    this._onSettle = null;
  }

  private _stop(): void {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._spring?.stop();
  }

  private _coast = (): void => {
    this._velocity *= this._friction;
    this._position += this._velocity;
    this._onScroll?.(this._position);

    if (Math.abs(this._velocity) < 0.5) {
      this._raf = null;
      // Check snap
      if (this._snapPoints.length > 0) {
        const nearest = this._snapPoints.reduce((best, sp) =>
          Math.abs(sp - this._position) < Math.abs(best - this._position) ? sp : best
        );
        if (Math.abs(nearest - this._position) < this._snapThreshold) {
          this._snapTo(nearest);
          return;
        }
      }
      this._onSettle?.();
      return;
    }

    this._raf = requestAnimationFrame(this._coast);
  };

  private _snapTo(target: number): void {
    this._spring?.destroy();
    this._spring = new SpringAnimator(SPRING_PRESETS.navigation, this._position);
    this._spring.onUpdate((v) => {
      this._position = v;
      this._onScroll?.(v);
    });
    this._spring.onComplete(() => {
      this._onSettle?.();
    });
    this._spring.setTarget(target);
  }
}

// ---------------------------------------------------------------------------
// ELASTIC SCROLLER (iOS-like rubber band overscroll)
// ---------------------------------------------------------------------------

export interface ElasticScrollerConfig {
  friction?: number;              // per-frame deceleration, default 0.95
  elasticity?: number;            // overscroll resistance, 0.4 = iOS-like
  maxOverscroll?: number;         // max pixels beyond bounds
  bounceSpring?: SpringConfig;    // spring for bounce-back
}

export class ElasticScroller {
  private _position = 0;
  private _velocity = 0;
  private _minBound = 0;
  private _maxBound = 0;
  private _friction: number;
  private _elasticity: number;
  private _maxOverscroll: number;
  private _bounceSpring: SpringConfig;
  private _raf: number | null = null;
  private _spring: SpringAnimator | null = null;
  private _onScroll: ((position: number, overscroll: number) => void) | null = null;
  private _onSettle: (() => void) | null = null;
  private _onBounceStart: ((direction: 'top' | 'bottom') => void) | null = null;
  private _isBouncing = false;

  constructor(config: ElasticScrollerConfig = {}) {
    this._friction = config.friction ?? 0.95;
    this._elasticity = config.elasticity ?? 0.4;
    this._maxOverscroll = config.maxOverscroll ?? 150;
    this._bounceSpring = config.bounceSpring ?? SPRING_PRESETS.elasticBounce;
  }

  get position(): number { return this._position; }
  get isBouncing(): boolean { return this._isBouncing; }

  onScroll(fn: (position: number, overscroll: number) => void): this {
    this._onScroll = fn;
    return this;
  }

  onSettle(fn: () => void): this {
    this._onSettle = fn;
    return this;
  }

  onBounceStart(fn: (direction: 'top' | 'bottom') => void): this {
    this._onBounceStart = fn;
    return this;
  }

  setBounds(min: number, max: number): void {
    this._minBound = min;
    this._maxBound = max;
  }

  setPosition(pos: number): void {
    this._stop();
    this._position = Math.max(this._minBound, Math.min(this._maxBound, pos));
    this._velocity = 0;
  }

  /**
   * Apply delta while dragging (with elastic resistance beyond bounds)
   */
  applyDelta(delta: number): void {
    this._stop();
    
    const newPos = this._position + delta;
    
    // Apply rubber-band resistance when beyond bounds
    if (newPos < this._minBound) {
      const over = this._minBound - newPos;
      const dampedOver = this._rubberBand(over);
      this._position = this._minBound - dampedOver;
    } else if (newPos > this._maxBound) {
      const over = newPos - this._maxBound;
      const dampedOver = this._rubberBand(over);
      this._position = this._maxBound + dampedOver;
    } else {
      this._position = newPos;
    }

    const overscroll = this._calculateOverscroll();
    this._onScroll?.(this._position, overscroll);
  }

  /**
   * Release with velocity, will coast and/or bounce back
   */
  release(velocity: number): void {
    if (_reduceMotion) {
      this._snapToBounds();
      return;
    }

    this._velocity = velocity;
    
    // If already beyond bounds, immediately bounce back
    if (this._position < this._minBound || this._position > this._maxBound) {
      this._bounceBack();
      return;
    }

    // Start coasting
    if (this._raf === null) {
      this._coast();
    }
  }

  stop(): void {
    this._stop();
  }

  destroy(): void {
    this._stop();
    this._spring?.destroy();
    this._onScroll = null;
    this._onSettle = null;
    this._onBounceStart = null;
  }

  private _rubberBand(overscroll: number): number {
    // Logarithmic resistance curve (feels like iOS)
    const c = this._elasticity;
    const max = this._maxOverscroll;
    return max * (1 - Math.exp(-overscroll * c / max));
  }

  private _calculateOverscroll(): number {
    if (this._position < this._minBound) {
      return this._position - this._minBound;
    } else if (this._position > this._maxBound) {
      return this._position - this._maxBound;
    }
    return 0;
  }

  private _stop(): void {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._spring?.stop();
    this._isBouncing = false;
  }

  private _coast = (): void => {
    this._velocity *= this._friction;
    this._position += this._velocity;

    // Check if we've gone beyond bounds
    if (this._position < this._minBound) {
      // Apply resistance to velocity
      this._velocity *= 0.5;
      const over = this._minBound - this._position;
      this._position = this._minBound - this._rubberBand(over);
      
      // Once velocity is low enough, bounce back
      if (Math.abs(this._velocity) < 5) {
        this._bounceBack();
        return;
      }
    } else if (this._position > this._maxBound) {
      this._velocity *= 0.5;
      const over = this._position - this._maxBound;
      this._position = this._maxBound + this._rubberBand(over);
      
      if (Math.abs(this._velocity) < 5) {
        this._bounceBack();
        return;
      }
    }

    const overscroll = this._calculateOverscroll();
    this._onScroll?.(this._position, overscroll);

    // Coast until velocity is low
    if (Math.abs(this._velocity) < 0.5) {
      this._raf = null;
      // Check if we need to bounce back
      if (this._position < this._minBound || this._position > this._maxBound) {
        this._bounceBack();
      } else {
        this._onSettle?.();
      }
      return;
    }

    this._raf = requestAnimationFrame(this._coast);
  };

  private _bounceBack(): void {
    this._isBouncing = true;
    const target = this._position < this._minBound ? this._minBound : this._maxBound;
    const direction = this._position < this._minBound ? 'top' : 'bottom';
    
    this._onBounceStart?.(direction);
    
    this._spring?.destroy();
    this._spring = new SpringAnimator(this._bounceSpring, this._position);
    this._spring.onUpdate((v) => {
      this._position = v;
      const overscroll = this._calculateOverscroll();
      this._onScroll?.(v, overscroll);
    });
    this._spring.onComplete(() => {
      this._isBouncing = false;
      this._position = target;
      this._onScroll?.(target, 0);
      this._onSettle?.();
    });
    this._spring.setTarget(target);
  }

  private _snapToBounds(): void {
    if (this._position < this._minBound) {
      this._position = this._minBound;
    } else if (this._position > this._maxBound) {
      this._position = this._maxBound;
    }
    this._onScroll?.(this._position, 0);
    this._onSettle?.();
  }
}

// ---------------------------------------------------------------------------
// WILL-CHANGE MANAGER
// ---------------------------------------------------------------------------

export function applyWillChange(el: HTMLElement, prop = 'transform'): void {
  el.style.willChange = prop;
}

export function removeWillChange(el: HTMLElement): void {
  el.style.willChange = 'auto';
}

// ---------------------------------------------------------------------------
// ANIMATION HELPERS
// ---------------------------------------------------------------------------

export function springTransition(
  el: HTMLElement,
  prop: 'transform' | 'opacity',
  from: string,
  to: string,
  config: SpringConfig = SPRING_PRESETS.modal,
): Promise<void> {
  return new Promise((resolve) => {
    if (_reduceMotion) {
      el.style[prop] = to;
      resolve();
      return;
    }
    applyWillChange(el, prop === 'transform' ? 'transform' : 'opacity');
    const spring = new SpringAnimator(config, 0);
    spring.onUpdate((v) => {
      if (prop === 'opacity') {
        el.style.opacity = String(v);
      } else {
        // Interpolate transform strings is complex; use numeric lerp
        el.style[prop] = to;
      }
    });
    spring.onComplete(() => {
      el.style[prop] = to;
      removeWillChange(el);
      spring.destroy();
      resolve();
    });
    el.style[prop] = from;
    spring.setTarget(1);
  });
}

// ---------------------------------------------------------------------------
// SCROLLBAR AUTO-HIDE
// ---------------------------------------------------------------------------

let _scrollbarStyleInjected = false;

export function injectScrollbarStyles(): void {
  if (_scrollbarStyleInjected) return;
  _scrollbarStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* Custom scrollbar -- thin, auto-fade */
    .dex-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .dex-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .dex-scroll::-webkit-scrollbar-thumb {
      background: transparent;
      border-radius: 3px;
      transition: background 0.3s;
    }
    .dex-scroll:hover::-webkit-scrollbar-thumb,
    .dex-scroll.is-scrolling::-webkit-scrollbar-thumb {
      background: var(--color-text-tertiary);
    }
    .dex-scroll::-webkit-scrollbar-thumb:hover {
      background: var(--color-text-tertiary);
    }
    .dex-scroll::-webkit-scrollbar-corner {
      background: transparent;
    }

    /* Reduce motion compliance */
    .reduce-motion * {
      animation-duration: 0ms !important;
      animation-delay: 0ms !important;
      transition-duration: 0ms !important;
      transition-delay: 0ms !important;
    }
    .reduce-motion .dex-game-canvas {
      /* Game canvas keeps animations as they are gameplay-essential */
      animation-duration: unset !important;
      transition-duration: unset !important;
    }

    /* Smooth font rendering */
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    h1, h2, h3, h4, h5, h6, .heading {
      text-rendering: geometricPrecision;
    }

    /* Image loading fade-in */
    img[data-loaded="false"] {
      opacity: 0;
    }
    img[data-loaded="true"] {
      opacity: 1;
      transition: opacity 0.2s ease;
    }

    /* Focus ring for keyboard nav */
    :focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    /* Window unfocus dim */
    .dex-window-blurred {
      opacity: 0.95;
      transition: opacity 0.2s ease;
    }
    .dex-window-focused {
      opacity: 1;
      transition: opacity 0.15s ease;
    }

    /* Performance audit overlay */
    .dex-perf-overlay {
      position: fixed;
      top: 4px;
      right: 4px;
      z-index: var(--z-drag-overlay, 10000);
      pointer-events: none;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 1.4;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(0,0,0,0.75);
      color: #30d158;
      backdrop-filter: blur(10px);
    }
    .dex-perf-overlay .warn { color: #ff9f0a; }
    .dex-perf-overlay .danger { color: #ff453a; }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// PERFORMANCE AUDIT
// ---------------------------------------------------------------------------

export class PerformanceAudit {
  private _enabled = false;
  private _overlay: HTMLDivElement | null = null;
  private _raf: number | null = null;
  private _frameTimes: number[] = [];
  private _lastFrame = 0;

  get enabled(): boolean { return this._enabled; }

  toggle(): void {
    if (this._enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    this._overlay = document.createElement('div');
    this._overlay.className = 'dex-perf-overlay';
    document.body.appendChild(this._overlay);
    this._lastFrame = performance.now();
    this._measure();
  }

  disable(): void {
    this._enabled = false;
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    this._frameTimes = [];
  }

  private _measure = (): void => {
    if (!this._enabled) return;
    const now = performance.now();
    const dt = now - this._lastFrame;
    this._lastFrame = now;
    this._frameTimes.push(dt);
    if (this._frameTimes.length > 60) this._frameTimes.shift();

    if (this._overlay && this._frameTimes.length >= 10) {
      const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
      const fps = Math.round(1000 / avg);
      const maxFrame = Math.max(...this._frameTimes);
      const jank = this._frameTimes.filter(t => t > 33).length;

      let fpsClass = '';
      if (fps < 30) fpsClass = 'danger';
      else if (fps < 55) fpsClass = 'warn';

      const mem = (performance as any).memory;
      const memStr = mem ? `${Math.round(mem.usedJSHeapSize / 1048576)}MB` : '--';

      this._overlay.innerHTML =
        `<span class="${fpsClass}">${fps} FPS</span> | ` +
        `Max: ${maxFrame.toFixed(1)}ms | ` +
        `Jank: <span class="${jank > 3 ? 'danger' : jank > 0 ? 'warn' : ''}">${jank}/60</span> | ` +
        `Heap: ${memStr}`;
    }

    this._raf = requestAnimationFrame(this._measure);
  };
}

export const perfAudit = new PerformanceAudit();

// ---------------------------------------------------------------------------
// WINDOW FOCUS/BLUR HANDLING
// ---------------------------------------------------------------------------

let motionCleanups: (() => void)[] = [];

export function initWindowFocusHandlers(): void {
  if (typeof window === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;

  const onFocus = () => {
    root.classList.remove('dex-window-blurred');
    root.classList.add('dex-window-focused');
  };
  const onBlur = () => {
    root.classList.remove('dex-window-focused');
    root.classList.add('dex-window-blurred');
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  motionCleanups.push(() => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
  });
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------

export function initMotionController(): void {
  // Tear down any previous listeners (hot-reload safety)
  destroyMotionController();

  initReduceMotion();
  injectScrollbarStyles();
  initWindowFocusHandlers();
  
  // Item 149: Auto-clear will-change after animations/transitions end globally
  // Prevents stale will-change properties from consuming compositor memory
  const onAnimEnd = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el?.style?.willChange && el.style.willChange !== 'auto') {
      el.style.willChange = 'auto';
    }
  };
  const onTransEnd = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el?.style?.willChange && el.style.willChange !== 'auto') {
      el.style.willChange = 'auto';
    }
  };
  document.addEventListener('animationend', onAnimEnd, { passive: true });
  document.addEventListener('transitionend', onTransEnd, { passive: true });
  motionCleanups.push(() => {
    document.removeEventListener('animationend', onAnimEnd);
    document.removeEventListener('transitionend', onTransEnd);
  });
}

export function destroyMotionController(): void {
  motionCleanups.forEach(fn => fn());
  motionCleanups = [];
}
