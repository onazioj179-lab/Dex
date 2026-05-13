// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight event bus (T6-031 IPC backpressure pattern, generic
 * pub/sub with type-safe channels).
 */

type Listener<P> = (payload: P) => void;

export class EventBus<TMap extends Record<string, unknown>> {
  private readonly map = new Map<keyof TMap, Set<Listener<unknown>>>();

  on<K extends keyof TMap>(channel: K, listener: Listener<TMap[K]>): () => void {
    let set = this.map.get(channel);
    if (!set) { set = new Set(); this.map.set(channel, set); }
    set.add(listener as Listener<unknown>);
    return () => { set!.delete(listener as Listener<unknown>); };
  }

  once<K extends keyof TMap>(channel: K, listener: Listener<TMap[K]>): () => void {
    const off = this.on(channel, (payload) => { off(); listener(payload); });
    return off;
  }

  emit<K extends keyof TMap>(channel: K, payload: TMap[K]): void {
    const set = this.map.get(channel);
    if (!set) return;
    for (const l of [...set]) {
      try { (l as Listener<TMap[K]>)(payload); }
      catch { /* listeners must not throw across the bus */ }
    }
  }

  listenerCount<K extends keyof TMap>(channel: K): number {
    return this.map.get(channel)?.size ?? 0;
  }

  clear(channel?: keyof TMap): void {
    if (channel === undefined) this.map.clear();
    else this.map.delete(channel);
  }
}
