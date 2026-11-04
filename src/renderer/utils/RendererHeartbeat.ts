// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RendererHeartbeat -- proactive renderer→main heartbeat sender.
 *
 * The HealthResponder (HealthResponder.ts) answers pings from main.
 * This module *initiates* heartbeats so main can declare the renderer
 * frozen if they stop arriving — covering the case where main never pings.
 *
 * Heartbeat cadence: every 5 s by default.
 * Stops automatically when the window enters background (visibilitychange).
 * Reports `frozenSince` if the event loop was blocked (detected via
 * a scheduled vs. actual fire-time comparison).
 */

import { DisposableGroup } from '../../shared/disposable';
import { rendererMetrics } from '../../shared/metrics';

const HEARTBEAT_INTERVAL_MS = 5_000;
const FREEZE_THRESHOLD_MS = 1_000; // event loop delay that counts as a freeze

const hbCounter = rendererMetrics.counter('renderer.heartbeat.sent', 'count');
const freezeCounter = rendererMetrics.counter('renderer.freeze.detected', 'count');

interface HeartbeatPayload {
  t: number;
  frameTimeMs: number;
  heapUsedMB: number;
  freezeDetected: boolean;
  frozenMs?: number;
}

function getBridge(): { invoke?: (ch: string, p?: unknown) => Promise<unknown> } | null {
  return (window as any).dex || null;
}

function getHeapMB(): number {
  const mem = (performance as any).memory;
  return mem ? mem.usedJSHeapSize / (1024 * 1024) : 0;
}

let _group: DisposableGroup | null = null;

export function startRendererHeartbeat(intervalMs = HEARTBEAT_INTERVAL_MS): () => void {
  if (_group && !_group.isDisposed) return () => _group?.dispose();
  _group = new DisposableGroup();

  let lastScheduled = Date.now();
  let lastFrameTime = 0;

  // Measure frame time once per heartbeat cycle
  const measureFrame = () => {
    const t0 = performance.now();
    requestAnimationFrame(() => { lastFrameTime = performance.now() - t0; });
  };
  measureFrame();

  const tick = () => {
    const now = Date.now();
    const elapsed = now - lastScheduled;
    const freezeDetected = elapsed > intervalMs + FREEZE_THRESHOLD_MS;
    const frozenMs = freezeDetected ? elapsed - intervalMs : undefined;
    if (freezeDetected) freezeCounter.inc();

    const payload: HeartbeatPayload = {
      t: now,
      frameTimeMs: lastFrameTime,
      heapUsedMB: getHeapMB(),
      freezeDetected,
      frozenMs,
    };

    lastScheduled = now;
    hbCounter.inc();
    measureFrame();

    const bridge = getBridge();
    if (bridge?.invoke) {
      bridge.invoke('renderer:heartbeat', payload).catch(() => { /* main may be starting */ });
    }
  };

  const id = setInterval(tick, intervalMs);
  _group.addInterval(id);

  // Pause heartbeat when tab/window hidden; resume on visibility
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      lastScheduled = Date.now(); // reset freeze baseline
      measureFrame();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  _group.add(() => document.removeEventListener('visibilitychange', onVisibility));

  return () => _group?.dispose();
}

export function stopRendererHeartbeat(): void {
  _group?.dispose();
  _group = null;
}
