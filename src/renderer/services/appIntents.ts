// =============================================================================
// DEX Platform — App intents (launch actions)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The delivery half of the app registry's quick actions ("New Note", "New
// Transaction", "New Tab"…). A launcher, search result or context menu asks
// for an action; the shell opens the app and hands the action here. The app,
// once mounted, registers a handler that performs it. An action that arrives
// before the app has mounted waits (briefly) until its handler registers.
//
// Actions are only ever ADVERTISED for apps whose code registers a handler
// for them (see appRegistry.ts) — nothing here fakes an action.

export type IntentHandler = (action: string, payload?: unknown) => boolean | void;

interface Pending { action: string; payload?: unknown; at: number }

const handlers = new Map<string, IntentHandler>();
const pending = new Map<string, Pending[]>();
const PENDING_TTL_MS = 15_000;

function deliver(appId: string, handler: IntentHandler, p: Pending): boolean {
  try {
    return handler(p.action, p.payload) !== false;
  } catch (e) {
    console.warn(`[appIntents] ${appId} failed to run ${p.action}`, e);
    return false;
  }
}

/**
 * Register the handler for an app's actions. Returns the unregister function
 * (use it as an effect cleanup). Queued actions for the app are delivered now.
 */
export function registerAppIntentHandler(appId: string, handler: IntentHandler): () => void {
  handlers.set(appId, handler);
  const queue = pending.get(appId);
  if (queue?.length) {
    pending.delete(appId);
    const now = Date.now();
    // Defer one tick so the app finishes mounting before it acts.
    setTimeout(() => {
      for (const p of queue) if (now - p.at < PENDING_TTL_MS) deliver(appId, handler, p);
    }, 0);
  }
  return () => {
    if (handlers.get(appId) === handler) handlers.delete(appId);
  };
}

/** Deliver now if the app is mounted, otherwise queue until it registers. */
export function dispatchAppIntent(appId: string, action: string, payload?: unknown): void {
  const h = handlers.get(appId);
  const p: Pending = { action, payload, at: Date.now() };
  if (h) {
    deliver(appId, h, p);
    return;
  }
  const q = pending.get(appId) || [];
  q.push(p);
  pending.set(appId, q.slice(-5));
  setTimeout(() => {
    const cur = pending.get(appId);
    if (!cur) return;
    const left = cur.filter(x => Date.now() - x.at < PENDING_TTL_MS);
    if (left.length < cur.length) {
      try {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'The app did not open in time to run that action.' } }));
      } catch { /* non-DOM */ }
    }
    if (left.length) pending.set(appId, left); else pending.delete(appId);
  }, PENDING_TTL_MS + 50);
}

export function hasAppIntentHandler(appId: string): boolean {
  return handlers.has(appId);
}

/** Test helper. */
export function __resetAppIntents(): void {
  handlers.clear();
  pending.clear();
}
