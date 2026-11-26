// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Silent Learning -- live wiring
 * -----------------------------------------------------------------------------
 * `store/learningStore` is a full usage-pattern accumulator but nothing fed its
 * app-level signals -- the collectors (`trackAppOpen`) and the consumer
 * (`getAppSuggestions`) were orphaned. This subscribes to the running-apps store
 * so every app the user moves to is recorded (frequency, recency, time-of-day,
 * and app->app pairing), which is what powers the launcher's "Suggested" row.
 *
 * It subscribes to the STORE rather than ContextBus on purpose: ContextBus
 * throttles to one event per channel per frame, so two rapid app switches would
 * drop the second and skew the pairing graph. The store's `currentAppId` always
 * reflects the true focus, so transitions are captured exactly.
 *
 * Renderer-only and idempotent, so it is fully verifiable without the native
 * bridge.
 */

import { useRunningApps } from '../store/runningApps';
import { useLearningStore } from '../store/learningStore';

let started = false;

/** Begin feeding the silent learning store from app focus changes. Idempotent. */
export function initLearningWiring(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  let lastSeen = useRunningApps.getState().currentAppId;

  // Record the app that's already focused at boot (skips 'home' inside the store).
  try {
    useLearningStore.getState().trackAppOpen(lastSeen);
  } catch {
    /* store not ready -- the subscription below still captures later switches */
  }

  // Time in front: counted while DEX is visible, saved on switch and each minute.
  let since: number | null = document.hidden ? null : Date.now();
  const countTime = () => {
    const now = Date.now();
    if (since !== null && lastSeen) {
      try { useLearningStore.getState().addAppTime(lastSeen, now - since); } catch { /* non-fatal */ }
    }
    since = document.hidden ? null : now;
  };
  document.addEventListener('visibilitychange', countTime);
  window.addEventListener('pagehide', countTime);
  setInterval(countTime, 60_000);

  useRunningApps.subscribe((state) => {
    const id = state.currentAppId;
    if (id === lastSeen) return;
    countTime();
    lastSeen = id;
    try {
      useLearningStore.getState().trackAppOpen(id);
    } catch {
      /* learning disabled or store unavailable -- non-fatal */
    }
  });
}

export default initLearningWiring;
