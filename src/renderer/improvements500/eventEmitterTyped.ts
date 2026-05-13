// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Strongly typed event emitter. Listener signatures are derived from a
 * user-supplied event-map type, eliminating string-key typos at the call site.
 */

export type EventMap = Record<string, unknown>;

export type Listener<T> = (payload: T) => void;

export class TypedEventEmitter<E extends EventMap> {
  private readonly map: Map<keyof E, Set<Listener<E[keyof E]>>> = new Map();

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    let bucket = this.map.get(event);
    if (!bucket) {
      bucket = new Set();
      this.map.set(event, bucket);
    }
    bucket.add(listener as Listener<E[keyof E]>);
    return () => this.off(event, listener);
  }

  once<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    const wrap: Listener<E[K]> = (payload) => {
      this.off(event, wrap);
      listener(payload);
    };
    return this.on(event, wrap);
  }

  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    const bucket = this.map.get(event);
    if (!bucket) return;
    bucket.delete(listener as Listener<E[keyof E]>);
    if (bucket.size === 0) this.map.delete(event);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const bucket = this.map.get(event);
    if (!bucket) return;
    for (const listener of Array.from(bucket)) {
      try {
        (listener as Listener<E[K]>)(payload);
      } catch {
        // Listeners must not break sibling listeners.
      }
    }
  }

  listenerCount<K extends keyof E>(event: K): number {
    const bucket = this.map.get(event);
    return bucket ? bucket.size : 0;
  }

  removeAllListeners(event?: keyof E): void {
    if (event === undefined) this.map.clear();
    else this.map.delete(event);
  }
}
