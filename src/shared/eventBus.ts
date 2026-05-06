// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * eventBus -- lightweight typed event bus for cross-component communication.
 *
 * Replaces ad-hoc window.dispatchEvent / CustomEvent patterns with a
 * properly typed, memory-safe bus. Integrates with DisposableGroup for
 * automatic cleanup.
 *
 * W1#14: typed event bus
 */

import { type IDisposable } from './disposable';

export type EventMap = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export type Listener<T> = (payload: T) => void;

export class EventBus<TMap extends Record<string, any>> {
  private readonly _listeners = new Map<keyof TMap, Set<Listener<unknown>>>();

  on<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): IDisposable {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(listener as Listener<unknown>);
    return {
      dispose: () => {
        this._listeners.get(event)?.delete(listener as Listener<unknown>);
      },
    };
  }

  once<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): IDisposable {
    const wrapper: Listener<TMap[K]> = (p) => {
      sub.dispose();
      listener(p);
    };
    const sub = this.on(event, wrapper);
    return sub;
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    this._listeners.get(event)?.forEach(l => {
      try { (l as Listener<TMap[K]>)(payload); } catch (e) {
        console.warn(`[EventBus] listener threw on "${String(event)}"`, e);
      }
    });
  }

  off<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): void {
    this._listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  clear<K extends keyof TMap>(event?: K): void {
    if (event !== undefined) this._listeners.delete(event);
    else this._listeners.clear();
  }

  listenerCount<K extends keyof TMap>(event: K): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}

// ---------------------------------------------------------------------------
// DEX shared renderer bus
// ---------------------------------------------------------------------------
export interface DexRendererEvents {
  'app:focus-changed': { appId: string; focused: boolean };
  'app:lifecycle': { appId: string; state: 'launch' | 'suspend' | 'resume' | 'terminate' };
  'memory:pressure': { level: 'moderate' | 'high' | 'critical'; heapUsedMB: number };
  'theme:changed': { theme: string };
  'search:open': { query?: string };
  'search:close': void;
  'command-palette:open': { query?: string };
  'notification:new': { id: string; title: string; body?: string };
  'auth:lock': void;
  'auth:unlock': void;
  'heartbeat:freeze': { frozenMs: number };
  'diagnostics:snapshot': Record<string, unknown>;
}

/** Renderer-scoped event bus. Import this singleton across components. */
export const dexBus = new EventBus<DexRendererEvents & Record<string, unknown>>();
