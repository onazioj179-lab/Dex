// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// One "Back" for the whole system (predictive back).
//
// Back means "the last place I was", and that is usually inside the app in
// front (the previous folder in Files, the previous page in Browser), not the
// previous app. Apps register a handler; the shell's Back (Alt+Left, the mouse
// side buttons, the edge swipe, the title-bar arrow) asks the front app first
// and only falls back to app history when the app has nowhere to go. The
// handler can also say where Back will land (`backLabel`) so the arrow's
// tooltip predicts it before you press it.

import { useEffect, useRef } from 'react';

export interface BackHandler {
  canGoBack: () => boolean;
  goBack: () => void;
  canGoForward?: () => boolean;
  goForward?: () => void;
  /** Where Back would go, for tooltips ("Documents"). */
  backLabel?: () => string | null;
}

const handlers = new Map<string, BackHandler>();

export function registerBackHandler(appId: string, handler: BackHandler): () => void {
  handlers.set(appId, handler);
  return () => { if (handlers.get(appId) === handler) handlers.delete(appId); };
}

/** Go back inside `appId` if it can. Returns true when the app handled it. */
export function tryAppBack(appId: string | null | undefined): boolean {
  const h = appId ? handlers.get(appId) : undefined;
  if (!h) return false;
  try {
    if (!h.canGoBack()) return false;
    h.goBack();
    return true;
  } catch {
    return false;
  }
}

export function tryAppForward(appId: string | null | undefined): boolean {
  const h = appId ? handlers.get(appId) : undefined;
  if (!h?.canGoForward || !h.goForward) return false;
  try {
    if (!h.canGoForward()) return false;
    h.goForward();
    return true;
  } catch {
    return false;
  }
}

/** Where Back would land inside `appId`, or null when it would leave the app. */
export function appBackLabel(appId: string | null | undefined): string | null {
  const h = appId ? handlers.get(appId) : undefined;
  try {
    return h && h.canGoBack() ? (h.backLabel?.() ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Register for the component's lifetime. The handler object may change every
 * render (it closes over state); the registration reads the latest one.
 */
export function useBackHandler(appId: string, handler: BackHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => registerBackHandler(appId, {
    canGoBack: () => ref.current.canGoBack(),
    goBack: () => ref.current.goBack(),
    canGoForward: () => ref.current.canGoForward?.() ?? false,
    goForward: () => ref.current.goForward?.(),
    backLabel: () => ref.current.backLabel?.() ?? null,
  }), [appId]);
}

/** MouseEvent.button for the side buttons most mice map to Back / Forward. */
export const MOUSE_BACK = 3;
export const MOUSE_FORWARD = 4;
