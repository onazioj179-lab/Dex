// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Spring Animation System
// Phase G: Visual Feedback (Items 376-395)
// Physics-based spring animations like iOS/macOS
// =============================================================================

// ---------------------------------------------------------------------------
// 376-380. Spring Core
// ---------------------------------------------------------------------------

interface SpringConfig {
  /** Mass of the object (affects momentum) */
  mass?: number;
  /** Stiffness of the spring (higher = faster) */
  stiffness?: number;
  /** Damping ratio (1 = critical, <1 = bouncy, >1 = overdamped) */
  damping?: number;
  /** Velocity threshold to consider animation complete */
  restThreshold?: number;
}

interface SpringState {
  value: number;
  velocity: number;
}

const DEFAULT_SPRING: Required<SpringConfig> = {
  mass: 1,
  stiffness: 100,
  damping: 10,
  restThreshold: 0.01,
};

// Preset spring configurations (iOS-inspired)
export const SPRING_PRESETS = {
  /** Default snappy spring */
  default: { mass: 1, stiffness: 170, damping: 26 },
  /** Gentle, smooth spring */
  gentle: { mass: 1, stiffness: 120, damping: 14 },
  /** Wobbly, playful spring */
  wobbly: { mass: 1, stiffness: 180, damping: 12 },
  /** Stiff, quick spring */
  stiff: { mass: 1, stiffness: 210, damping: 20 },
  /** Slow, heavy spring */
  slow: { mass: 1, stiffness: 280, damping: 60 },
  /** iOS-style spring */
  ios: { mass: 1, stiffness: 300, damping: 30 },
  /** macOS-style spring */
  macos: { mass: 1, stiffness: 250, damping: 25 },
  /** Modal appearance */
  modal: { mass: 1.2, stiffness: 200, damping: 25 },
  /** Dropdown menu */
  dropdown: { mass: 0.8, stiffness: 300, damping: 28 },
  /** Button press */
  press: { mass: 0.5, stiffness: 400, damping: 30 },
} as const;

/**
 * Calculate next spring state using numerical integration
 */
function stepSpring(
  state: SpringState,
  target: number,
  config: Required<SpringConfig>,
  deltaTime: number
): SpringState {
  const { mass, stiffness, damping } = config;
  
  // Spring force: F = -kx (Hooke's law)
  const displacement = state.value - target;
  const springForce = -stiffness * displacement;
  
  // Damping force: F = -cv
  const dampingForce = -damping * state.velocity;
  
  // Total acceleration: a = F/m
  const acceleration = (springForce + dampingForce) / mass;
  
  // Semi-implicit Euler integration
  const newVelocity = state.velocity + acceleration * deltaTime;
  const newValue = state.value + newVelocity * deltaTime;
  
  return { value: newValue, velocity: newVelocity };
}

/**
 * Check if spring has settled
 */
function isAtRest(state: SpringState, target: number, threshold: number): boolean {
  return (
    Math.abs(state.value - target) < threshold &&
    Math.abs(state.velocity) < threshold
  );
}

// ---------------------------------------------------------------------------
// 381-385. Spring Animation Controller
// ---------------------------------------------------------------------------

type SpringCallback = (value: number) => void;

interface SpringAnimation {
  start: () => void;
  stop: () => void;
  setTarget: (target: number | Point2D) => void;
  getValue: () => number;
  isAnimating: () => boolean;
}

/**
 * Create a spring animation
 */
export function createSpring(
  initial: number,
  target: number,
  config: SpringConfig,
  onUpdate: SpringCallback,
  onComplete?: () => void
): SpringAnimation {
  const springConfig = { ...DEFAULT_SPRING, ...config };
  let state: SpringState = { value: initial, velocity: 0 };
  let currentTarget = target;
  let animationFrame: number | null = null;
  let lastTime = 0;
  let running = false;

  const animate = (time: number) => {
    if (!running) return;

    const deltaTime = lastTime ? Math.min((time - lastTime) / 1000, 0.064) : 0.016;
    lastTime = time;

    state = stepSpring(state, currentTarget, springConfig, deltaTime);
    onUpdate(state.value);

    if (isAtRest(state, currentTarget, springConfig.restThreshold)) {
      state.value = currentTarget;
      state.velocity = 0;
      onUpdate(currentTarget);
      running = false;
      onComplete?.();
    } else {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      animationFrame = requestAnimationFrame(animate);
    },
    stop() {
      running = false;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    },
    setTarget(newTarget: number | Point2D) {
      if (typeof newTarget !== 'number') return;
      currentTarget = newTarget;
      if (!running) {
        this.start();
      }
    },
    getValue() {
      return state.value;
    },
    isAnimating() {
      return running;
    },
  };
}

// ---------------------------------------------------------------------------
// 386-390. Multi-dimensional Spring
// ---------------------------------------------------------------------------

interface Point2D {
  x: number;
  y: number;
}

interface Point3D extends Point2D {
  z: number;
}

/**
 * Create a 2D spring for x/y animations
 */
export function createSpring2D(
  initial: Point2D,
  target: Point2D,
  config: SpringConfig,
  onUpdate: (value: Point2D) => void,
  onComplete?: () => void
): SpringAnimation {
  let currentValue = { ...initial };
  let completed = { x: false, y: false };

  const springX = createSpring(
    initial.x,
    target.x,
    config,
    (x) => {
      currentValue.x = x;
      onUpdate(currentValue);
    },
    () => {
      completed.x = true;
      if (completed.y) onComplete?.();
    }
  );

  const springY = createSpring(
    initial.y,
    target.y,
    config,
    (y) => {
      currentValue.y = y;
      onUpdate(currentValue);
    },
    () => {
      completed.y = true;
      if (completed.x) onComplete?.();
    }
  );

  return {
    start() {
      completed = { x: false, y: false };
      springX.start();
      springY.start();
    },
    stop() {
      springX.stop();
      springY.stop();
    },
    setTarget(newTarget: Point2D | number) {
      if (typeof newTarget === 'number') return;
      springX.setTarget(newTarget.x);
      springY.setTarget(newTarget.y);
    },
    getValue() {
      return currentValue.x; // For compatibility
    },
    isAnimating() {
      return springX.isAnimating() || springY.isAnimating();
    },
  };
}

// ---------------------------------------------------------------------------
// 391-395. Animation Utilities
// ---------------------------------------------------------------------------

/**
 * Animate element transform using spring physics
 */
export function springTransform(
  element: HTMLElement,
  from: { x?: number; y?: number; scale?: number; rotate?: number },
  to: { x?: number; y?: number; scale?: number; rotate?: number },
  config: SpringConfig = SPRING_PRESETS.default
): Promise<void> {
  return new Promise((resolve) => {
    const current = {
      x: from.x ?? 0,
      y: from.y ?? 0,
      scale: from.scale ?? 1,
      rotate: from.rotate ?? 0,
    };

    const target = {
      x: to.x ?? current.x,
      y: to.y ?? current.y,
      scale: to.scale ?? current.scale,
      rotate: to.rotate ?? current.rotate,
    };

    let completedProps = 0;
    const totalProps = Object.keys(to).length;

    const updateTransform = () => {
      element.style.transform = `translate(${current.x}px, ${current.y}px) scale(${current.scale}) rotate(${current.rotate}deg)`;
    };

    const onPropComplete = () => {
      completedProps++;
      if (completedProps >= totalProps) {
        resolve();
      }
    };

    if (to.x !== undefined || to.y !== undefined) {
      createSpring2D(
        { x: current.x, y: current.y },
        { x: target.x, y: target.y },
        config,
        (value) => {
          current.x = value.x;
          current.y = value.y;
          updateTransform();
        },
        onPropComplete
      ).start();
    }

    if (to.scale !== undefined) {
      createSpring(
        current.scale,
        target.scale,
        config,
        (value) => {
          current.scale = value;
          updateTransform();
        },
        onPropComplete
      ).start();
    }

    if (to.rotate !== undefined) {
      createSpring(
        current.rotate,
        target.rotate,
        config,
        (value) => {
          current.rotate = value;
          updateTransform();
        },
        onPropComplete
      ).start();
    }
  });
}

/**
 * Quick spring animation for a single value
 */
export function animateValue(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  config: SpringConfig = SPRING_PRESETS.default
): Promise<void> {
  return new Promise((resolve) => {
    createSpring(from, to, config, onUpdate, resolve).start();
  });
}

/**
 * Spring-based scroll to position
 */
export function springScrollTo(
  element: HTMLElement | Window,
  targetY: number,
  config: SpringConfig = SPRING_PRESETS.gentle
): Promise<void> {
  const isWindow = element === window;
  const getScrollTop = () => isWindow 
    ? window.scrollY 
    : (element as HTMLElement).scrollTop;
  const setScrollTop = (v: number) => {
    if (isWindow) {
      window.scrollTo(0, v);
    } else {
      (element as HTMLElement).scrollTop = v;
    }
  };

  return animateValue(getScrollTop(), targetY, setScrollTop, config);
}

/**
 * Bounce animation (press feedback)
 */
export function bounce(
  element: HTMLElement,
  scale = 0.95,
  config: SpringConfig = SPRING_PRESETS.press
): Promise<void> {
  return springTransform(
    element,
    { scale: 1 },
    { scale },
    config
  ).then(() => springTransform(
    element,
    { scale },
    { scale: 1 },
    config
  ));
}

/**
 * Shake animation (error feedback)
 */
export async function shake(
  element: HTMLElement,
  intensity = 10,
  config: SpringConfig = SPRING_PRESETS.stiff
): Promise<void> {
  await springTransform(element, { x: 0 }, { x: intensity }, config);
  await springTransform(element, { x: intensity }, { x: -intensity }, config);
  await springTransform(element, { x: -intensity }, { x: intensity / 2 }, config);
  await springTransform(element, { x: intensity / 2 }, { x: 0 }, config);
}

/**
 * Pop animation (appear from center)
 */
export function pop(
  element: HTMLElement,
  config: SpringConfig = SPRING_PRESETS.wobbly
): Promise<void> {
  element.style.transform = 'scale(0)';
  return springTransform(element, { scale: 0 }, { scale: 1 }, config);
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * React hook for spring animations
 */
export function useSpring(
  target: number,
  config: SpringConfig = SPRING_PRESETS.default
): number {
  const [value, setValue] = useState(target);
  const springRef = useRef<SpringAnimation | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setValue(target);
      return;
    }

    if (springRef.current) {
      springRef.current.setTarget(target);
    } else {
      springRef.current = createSpring(value, target, config, setValue);
      springRef.current.start();
    }

    return () => {
      springRef.current?.stop();
    };
  }, [target]);

  return value;
}

/**
 * React hook for spring 2D animations
 */
export function useSpring2D(
  target: Point2D,
  config: SpringConfig = SPRING_PRESETS.default
): Point2D {
  const [value, setValue] = useState(target);
  const springRef = useRef<SpringAnimation | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setValue(target);
      return;
    }

    if (springRef.current) {
      springRef.current.setTarget(target);
    } else {
      springRef.current = createSpring2D(value, target, config, (v: Point2D) => setValue(v));
      springRef.current.start();
    }

    return () => {
      springRef.current?.stop();
    };
  }, [target.x, target.y]);

  return value;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default createSpring;
