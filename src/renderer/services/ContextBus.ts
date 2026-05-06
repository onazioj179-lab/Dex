// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX ContextBus
 * -----------------------------------------------------------------------------
 * Typed in-renderer pub/sub. One bus, throttled per-channel, with a small
 * replay ring buffer so late subscribers can catch up.
 *
 * Why: replaces ad-hoc `window.dispatchEvent(new CustomEvent(...))` calls and
 * gives UKI / Rewind / Ambient daemon a single source of cross-app activity.
 */

// ---------------------------------------------------------------------------
// Event taxonomy (extend as needed; keep payloads small + serializable)
// ---------------------------------------------------------------------------

export interface ContextEventMap {
  'app:opened':       { appId: string; ts: number };
  'app:closed':       { appId: string; ts: number };
  'app:focused':      { appId: string; ts: number };
  'selection:changed':{ appId: string; kind: 'text' | 'file' | 'object'; sample?: string };
  'clipboard:updated':{ kind: 'text' | 'image' | 'file'; size?: number };
  'file:saved':       { appId: string; path?: string; size?: number };
  'file:opened':      { appId: string; path?: string };
  'task:created':     { id: string; title: string; due?: number };
  'task:completed':   { id: string };
  'note:opened':      { id: string; title?: string };
  'note:saved':       { id: string };
  'workflow:trigger': { id: string; reason: string };
  'idle:enter':       { afterMs: number };
  'idle:exit':        { idleMs: number };
  'ambient:hint':     { id: string; text: string; severity?: 'info' | 'warn' };
}

export type ContextChannel = keyof ContextEventMap;
type Handler<C extends ContextChannel> = (payload: ContextEventMap[C]) => void;

// ---------------------------------------------------------------------------
// Throttle + ring buffer config
// ---------------------------------------------------------------------------

const DEFAULT_THROTTLE_MS = 16; // one event per channel per frame by default
const RING_BUFFER_SIZE = 200;    // last N events for replay/crash inspection
let throttleMs = DEFAULT_THROTTLE_MS;

interface BufferedEvent {
  channel: ContextChannel;
  payload: unknown;
  ts: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const handlers = new Map<ContextChannel, Set<Handler<ContextChannel>>>();
const lastEmitAt = new Map<ContextChannel, number>();
const ring: BufferedEvent[] = [];
let ringHead = 0;

function pushRing(ev: BufferedEvent): void {
  if (ring.length < RING_BUFFER_SIZE) {
    ring.push(ev);
  } else {
    ring[ringHead] = ev;
    ringHead = (ringHead + 1) % RING_BUFFER_SIZE;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ContextBus = {
  /** Subscribe to a channel. Returns an unsubscribe function. */
  on<C extends ContextChannel>(channel: C, handler: Handler<C>): () => void {
    let set = handlers.get(channel);
    if (!set) {
      set = new Set();
      handlers.set(channel, set);
    }
    set.add(handler as Handler<ContextChannel>);
    return () => { set!.delete(handler as Handler<ContextChannel>); };
  },

  /** One-shot subscribe. */
  once<C extends ContextChannel>(channel: C, handler: Handler<C>): () => void {
    const off = this.on(channel, (p) => { off(); handler(p); });
    return off;
  },

  /** Emit. Throttled to one event per channel per ~frame; coalesces duplicates. */
  emit<C extends ContextChannel>(channel: C, payload: ContextEventMap[C]): void {
    const now = Date.now();
    const last = lastEmitAt.get(channel) || 0;
    if (throttleMs > 0 && now - last < throttleMs) return;
    lastEmitAt.set(channel, now);

    pushRing({ channel, payload, ts: now });

    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    set.forEach((h) => {
      try { (h as Handler<C>)(payload); }
      catch (err) { console.error('[ContextBus]', channel, err); }
    });
  },

  /** Replay the last N events for a channel (or all channels). */
  replay<C extends ContextChannel>(channel?: C): BufferedEvent[] {
    const ordered = ring.length < RING_BUFFER_SIZE
      ? ring.slice()
      : ring.slice(ringHead).concat(ring.slice(0, ringHead));
    return channel ? ordered.filter((e) => e.channel === channel) : ordered;
  },

  /** Subscribe AND immediately receive the most recent buffered event (catch-up). */
  onWithReplay<C extends ContextChannel>(channel: C, handler: Handler<C>): () => void {
    const off = this.on(channel, handler);
    const prior = this.replay(channel);
    if (prior.length > 0) {
      try { handler(prior[prior.length - 1].payload as ContextEventMap[C]); }
      catch (err) { console.error('[ContextBus replay]', channel, err); }
    }
    return off;
  },

  /** For tests / DevTools panel. */
  _stats(): { channels: number; subscribers: number; buffered: number } {
    let subs = 0;
    handlers.forEach((s) => { subs += s.size; });
    return { channels: handlers.size, subscribers: subs, buffered: ring.length };
  },

  /** Clear all subscribers + buffer (use only in tests / HMR teardown). */
  _reset(): void {
    handlers.clear();
    lastEmitAt.clear();
    ring.length = 0;
    ringHead = 0;
    throttleMs = DEFAULT_THROTTLE_MS;
  },

  /** Override throttle window (ms). 0 disables throttling. Tests / debug only. */
  _setThrottle(ms: number): void {
    throttleMs = Math.max(0, ms);
  },
};

export default ContextBus;
