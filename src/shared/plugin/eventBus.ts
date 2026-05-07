// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Typed event bus for plugins.
 *
 * Plugins publish + subscribe through a single bus so revoking a
 * permission also detaches every listener that plugin had.
 */

// DEX v3.8.9 - plugin event bus

export type EventHandler<P> = (payload: P) => void;

export class EventBus<TEventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TEventMap, Map<string, Set<EventHandler<unknown>>>>();

  on<K extends keyof TEventMap>(pluginId: string, event: K, handler: EventHandler<TEventMap[K]>): () => void {
    let perEvent = this.listeners.get(event);
    if (!perEvent) { perEvent = new Map(); this.listeners.set(event, perEvent); }
    let perPlugin = perEvent.get(pluginId);
    if (!perPlugin) { perPlugin = new Set(); perEvent.set(pluginId, perPlugin); }
    perPlugin.add(handler as EventHandler<unknown>);
    return () => { perPlugin!.delete(handler as EventHandler<unknown>); };
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): number {
    const perEvent = this.listeners.get(event);
    if (!perEvent) return 0;
    let n = 0;
    for (const set of perEvent.values()) {
      for (const fn of set) {
        try { (fn as EventHandler<TEventMap[K]>)(payload); n += 1; }
        catch { /* swallow plugin errors */ }
      }
    }
    return n;
  }

  detachPlugin(pluginId: string): number {
    let removed = 0;
    for (const perEvent of this.listeners.values()) {
      const set = perEvent.get(pluginId);
      if (set) { removed += set.size; perEvent.delete(pluginId); }
    }
    return removed;
  }

  listenerCount<K extends keyof TEventMap>(event: K): number {
    const perEvent = this.listeners.get(event);
    if (!perEvent) return 0;
    let n = 0;
    for (const set of perEvent.values()) n += set.size;
    return n;
  }
}
