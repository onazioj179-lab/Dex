// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX -- NativeSpringBatch
// Batch spring physics bridge for the renderer.
// For high-frequency per-frame animation, use the existing SpringAnimator
// (which runs directly in the renderer with zero IPC overhead).
// NativeSpringBatch is for scenarios with many simultaneous springs
// (e.g., game entities, list reorder animations) where the Rust physics
// engine can tick all springs in a single IPC call.
// ===========================================================================

import { SpringConfig, SPRING_PRESETS, isReduceMotion } from './MotionController';

declare global {
  interface Window {
    dexAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}

interface BatchSpring {
  id: number;       // Rust-side ID, or -1 if fallback
  position: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
  mass: number;
  settled: boolean;
  onUpdate?: (value: number) => void;
  onComplete?: () => void;
}

/**
 * Manages a batch of springs through the Rust physics engine via IPC,
 * with a full JS fallback when native is unavailable.
 */
export class NativeSpringBatch {
  private springs: Map<number, BatchSpring> = new Map();
  private nextLocalId = 0;
  private raf: number | null = null;
  private lastTime = 0;
  private nativeAvailable: boolean | null = null;

  /**
   * Create a spring and return a local handle ID.
   */
  async createSpring(
    config: SpringConfig,
    initialValue = 0,
    target = 0,
  ): Promise<number> {
    const localId = this.nextLocalId++;

    let nativeId = -1;
    if (await this.checkNative()) {
      try {
        nativeId = (await window.dexAPI!.invoke(
          'native-core:physics-create',
          config.stiffness,
          config.damping,
          config.mass,
          initialValue,
          target,
        )) as number;
      } catch {
        nativeId = -1;
      }
    }

    this.springs.set(localId, {
      id: nativeId,
      position: initialValue,
      velocity: 0,
      target,
      stiffness: config.stiffness,
      damping: config.damping,
      mass: config.mass,
      settled: initialValue === target,
    });

    return localId;
  }

  /**
   * Set a new target for a spring.
   */
  async setTarget(localId: number, target: number): Promise<void> {
    const spring = this.springs.get(localId);
    if (!spring) return;

    if (isReduceMotion()) {
      spring.position = target;
      spring.target = target;
      spring.velocity = 0;
      spring.settled = true;
      spring.onUpdate?.(target);
      spring.onComplete?.();
      return;
    }

    spring.target = target;
    spring.settled = false;

    if (spring.id >= 0) {
      try {
        await window.dexAPI!.invoke('native-core:physics-set-target', spring.id, target);
      } catch {
        // Fall through to JS fallback
      }
    }

    this.ensureTicking();
  }

  /**
   * Register an update callback for a spring.
   */
  onUpdate(localId: number, fn: (value: number) => void): void {
    const spring = this.springs.get(localId);
    if (spring) spring.onUpdate = fn;
  }

  /**
   * Register a completion callback for a spring.
   */
  onComplete(localId: number, fn: () => void): void {
    const spring = this.springs.get(localId);
    if (spring) spring.onComplete = fn;
  }

  /**
   * Release a spring.
   */
  async release(localId: number): Promise<void> {
    const spring = this.springs.get(localId);
    if (!spring) return;

    if (spring.id >= 0) {
      try {
        await window.dexAPI!.invoke('native-core:physics-release', spring.id);
      } catch {
        // Ignore release errors
      }
    }
    this.springs.delete(localId);

    if (this.springs.size === 0) {
      this.stopTicking();
    }
  }

  /**
   * Release all springs and stop ticking.
   */
  async destroy(): Promise<void> {
    const ids = Array.from(this.springs.keys());
    for (const id of ids) {
      await this.release(id);
    }
    this.stopTicking();
  }

  /**
   * Get the current position of a spring.
   */
  getPosition(localId: number): number {
    return this.springs.get(localId)?.position ?? 0;
  }

  /**
   * Number of active (unsettled) springs.
   */
  get activeCount(): number {
    let count = 0;
    for (const s of this.springs.values()) {
      if (!s.settled) count++;
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async checkNative(): Promise<boolean> {
    if (this.nativeAvailable !== null) return this.nativeAvailable;
    if (!window.dexAPI?.invoke) {
      this.nativeAvailable = false;
      return false;
    }
    try {
      const available = await window.dexAPI.invoke('native-core:available');
      this.nativeAvailable = !!available;
    } catch {
      this.nativeAvailable = false;
    }
    return this.nativeAvailable;
  }

  private ensureTicking(): void {
    if (this.raf !== null) return;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopTicking(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private tick = (): void => {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.064) dt = 0.064;

    let anyActive = false;

    // JS fallback tick for all springs (works whether or not native is available)
    for (const spring of this.springs.values()) {
      if (spring.settled) continue;

      const displacement = spring.position - spring.target;
      const springForce = -spring.stiffness * displacement;
      const dampingForce = -spring.damping * spring.velocity;
      const acceleration = (springForce + dampingForce) / spring.mass;

      spring.velocity += acceleration * dt;
      spring.position += spring.velocity * dt;

      const atRest =
        Math.abs(spring.position - spring.target) < 0.001 &&
        Math.abs(spring.velocity) < 0.001;

      if (atRest) {
        spring.position = spring.target;
        spring.velocity = 0;
        spring.settled = true;
        spring.onUpdate?.(spring.position);
        spring.onComplete?.();
      } else {
        anyActive = true;
        spring.onUpdate?.(spring.position);
      }
    }

    if (anyActive) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = null;
    }
  };
}

/**
 * Convenience: create a batch with a single spring and return a Promise
 * that resolves when the spring settles.
 */
export function batchSpringTransition(
  config: SpringConfig,
  from: number,
  to: number,
  onUpdate: (value: number) => void,
): Promise<void> {
  if (isReduceMotion()) {
    onUpdate(to);
    return Promise.resolve();
  }

  return new Promise(async (resolve) => {
    const batch = new NativeSpringBatch();
    const id = await batch.createSpring(config, from, from);
    batch.onUpdate(id, onUpdate);
    batch.onComplete(id, () => {
      batch.destroy();
      resolve();
    });
    await batch.setTarget(id, to);
  });
}
