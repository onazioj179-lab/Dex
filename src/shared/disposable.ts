// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Disposable -- explicit resource lifecycle management.
 *
 * DEX owns hundreds of long-lived objects (timers, listeners, workers, native
 * handles). Without explicit teardown, these silently accumulate and cause
 * memory pressure and ghost-event bugs.
 *
 * This module provides a minimal, zero-dependency interface to track resources
 * so they can be cleaned up in the correct order at the correct time.
 *
 * Usage (main or renderer):
 *
 *   const group = new DisposableGroup();
 *   group.add(() => clearInterval(timer));
 *   group.add(subscription);   // any object with .dispose() or .unsubscribe()
 *   group.add(abortController); // or .abort()
 *
 *   // On destroy:
 *   group.dispose();  // calls teardowns in LIFO order, never throws
 */

export type TeardownFn = () => void;
export interface IDisposable {
  dispose(): void;
}

/** Anything we can tear down. */
export type AnyDisposable =
  | TeardownFn
  | IDisposable
  | { unsubscribe(): void }
  | { abort(): void }
  | { destroy(): void }
  | { close(): void };

/**
 * Normalize any disposable shape to a plain TeardownFn.
 */
export function toTeardown(d: AnyDisposable): TeardownFn {
  if (typeof d === 'function') return d;
  if ('dispose' in d && typeof d.dispose === 'function') return () => d.dispose();
  if ('unsubscribe' in d && typeof (d as any).unsubscribe === 'function') return () => (d as any).unsubscribe();
  if ('abort' in d && typeof (d as any).abort === 'function') return () => (d as any).abort();
  if ('destroy' in d && typeof (d as any).destroy === 'function') return () => (d as any).destroy();
  if ('close' in d && typeof (d as any).close === 'function') return () => (d as any).close();
  return () => { /* no-op */ };
}

/**
 * A group of resources that are all disposed together.
 * Dispose is idempotent and runs teardowns in LIFO order.
 * Any individual teardown error is swallowed (logged to console.warn) so
 * the remaining teardowns always run.
 */
export class DisposableGroup implements IDisposable {
  private readonly _teardowns: TeardownFn[] = [];
  private _disposed = false;

  get isDisposed(): boolean { return this._disposed; }

  add(d: AnyDisposable): this {
    if (this._disposed) {
      // Group already disposed — run teardown immediately.
      try { toTeardown(d)(); } catch (e) { console.warn('[DisposableGroup] late-add teardown failed', e); }
      return this;
    }
    this._teardowns.push(toTeardown(d));
    return this;
  }

  /** Register a timer id (returned by setInterval / setTimeout). */
  addInterval(id: ReturnType<typeof setInterval>): this {
    return this.add(() => clearInterval(id));
  }

  addTimeout(id: ReturnType<typeof setTimeout>): this {
    return this.add(() => clearTimeout(id));
  }

  /** Register a DOM EventListener. */
  addListener<K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): this {
    target.addEventListener(type as string, handler, options);
    return this.add(() => target.removeEventListener(type as string, handler, options));
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    // LIFO
    for (let i = this._teardowns.length - 1; i >= 0; i--) {
      try { this._teardowns[i](); } catch (e) { console.warn('[DisposableGroup] teardown error', e); }
    }
    this._teardowns.length = 0;
  }

  /** Alias for React useEffect cleanup compatibility. */
  readonly cleanup = () => this.dispose();
}

/**
 * Simple single-use disposable token.
 */
export function makeDisposable(teardown: TeardownFn): IDisposable {
  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try { teardown(); } catch (e) { console.warn('[Disposable] teardown error', e); }
    },
  };
}
