// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
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

// ---------------------------------------------------------------------------
// Per-channel QoS policy
// ---------------------------------------------------------------------------
// Channels can opt into one of:
//   - coalesce: only the latest payload is delivered per microtask flush
//   - throttle: at most one delivery per N ms (leading edge)
//   - replay: cache last N payloads and deliver immediately to new subscribers
// Channels with no policy are delivered synchronously as before.

export interface ChannelPolicy {
  coalesce?: boolean;
  throttleMs?: number;
  replay?: number;          // keep last N payloads
  warnAtListeners?: number; // log once when listener count exceeds N
}

interface ChannelState {
  policy: ChannelPolicy;
  pendingPayload?: unknown;
  pendingScheduled?: boolean;
  lastEmitTs?: number;
  history?: unknown[];
  warned?: boolean;
}

export class EventBus<TMap extends Record<string, any>> {
  private readonly _listeners = new Map<keyof TMap, Set<Listener<unknown>>>();
  private readonly _channels = new Map<keyof TMap, ChannelState>();

  /** Configure per-channel QoS. Safe to call multiple times. */
  configureChannel<K extends keyof TMap>(event: K, policy: ChannelPolicy): void {
    const existing = this._channels.get(event);
    if (existing) {
      existing.policy = { ...existing.policy, ...policy };
    } else {
      this._channels.set(event, { policy });
    }
  }

  on<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): IDisposable {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(listener as Listener<unknown>);

    // Replay history immediately to the new subscriber if configured.
    const ch = this._channels.get(event);
    if (ch?.policy.replay && ch.history && ch.history.length > 0) {
      for (const p of ch.history) {
        try { (listener as Listener<TMap[K]>)(p as TMap[K]); }
        catch (e) { console.warn(`[EventBus] replay listener threw on "${String(event)}"`, e); }
      }
    }

    // Listener-count warning (one-shot per channel) -- catches leak patterns.
    const warnAt = ch?.policy.warnAtListeners;
    if (warnAt && !ch?.warned) {
      const count = this._listeners.get(event)!.size;
      if (count > warnAt) {
        if (ch) ch.warned = true;
        console.warn(`[EventBus] channel "${String(event)}" exceeded ${warnAt} listeners (now ${count}); possible subscription leak.`);
      }
    }

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

  private _deliver<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const ch = this._channels.get(event);
    if (ch?.policy.replay) {
      const cap = ch.policy.replay;
      ch.history = ch.history ?? [];
      ch.history.push(payload);
      if (ch.history.length > cap) ch.history.splice(0, ch.history.length - cap);
    }
    this._listeners.get(event)?.forEach(l => {
      try { (l as Listener<TMap[K]>)(payload); } catch (e) {
        console.warn(`[EventBus] listener threw on "${String(event)}"`, e);
      }
    });
  }

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const ch = this._channels.get(event);
    if (!ch || (!ch.policy.coalesce && !ch.policy.throttleMs)) {
      this._deliver(event, payload);
      return;
    }

    // Throttle: leading-edge, drop within window.
    if (ch.policy.throttleMs) {
      const now = Date.now();
      if (ch.lastEmitTs && now - ch.lastEmitTs < ch.policy.throttleMs) return;
      ch.lastEmitTs = now;
      this._deliver(event, payload);
      return;
    }

    // Coalesce: keep only the latest payload, flush on microtask.
    ch.pendingPayload = payload;
    if (!ch.pendingScheduled) {
      ch.pendingScheduled = true;
      queueMicrotask(() => {
        const p = ch.pendingPayload as TMap[K];
        ch.pendingPayload = undefined;
        ch.pendingScheduled = false;
        this._deliver(event, p);
      });
    }
  }

  off<K extends keyof TMap>(event: K, listener: Listener<TMap[K]>): void {
    this._listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  clear<K extends keyof TMap>(event?: K): void {
    if (event !== undefined) {
      this._listeners.delete(event);
      this._channels.delete(event);
    } else {
      this._listeners.clear();
      this._channels.clear();
    }
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
  'frame:budget-exceeded': { workMs: number; budgetMs: number; refreshHz: number };
}

/** Renderer-scoped event bus. Import this singleton across components. */
export const dexBus = new EventBus<DexRendererEvents & Record<string, unknown>>();

// Default per-channel QoS for known high-traffic / leak-prone channels.
// Coalesce: collapse rapid emissions to the latest value within a microtask.
// Throttle: leading-edge fire, drop the rest within window.
// warnAtListeners: one-shot subscription-leak detection.
dexBus.configureChannel('frame:budget-exceeded', { throttleMs: 200, warnAtListeners: 16 });
dexBus.configureChannel('memory:pressure', { coalesce: true, replay: 1, warnAtListeners: 32 });
dexBus.configureChannel('app:focus-changed', { coalesce: true, warnAtListeners: 64 });
dexBus.configureChannel('diagnostics:snapshot', { throttleMs: 500 });
dexBus.configureChannel('heartbeat:freeze', { throttleMs: 1000 });
