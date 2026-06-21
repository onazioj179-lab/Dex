// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Context Engine -- live wiring
 * -----------------------------------------------------------------------------
 * `shared/uki/contextEngine.ts` is a pure, stateful accumulator of "what the
 * user is working on" but nothing fed it -- it was orphaned. This wires it to
 * ContextBus so it tracks the active project, workspace, file, open apps, and a
 * recent-activity stream in real time, then exposes it on
 * `window.__dexContextEngine` for the Now panel (and UKI tools) to read.
 *
 * Renderer-only (ContextBus is in-renderer), so it is fully verifiable without
 * the native bridge.
 */

import { contextEngine } from '../../shared/uki/contextEngine';
import { ContextBus } from './ContextBus';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useStageStore } from '../store/stageStore';

let started = false;

function appName(appId: string): string {
  return APP_DEFINITIONS[appId]?.name || appId;
}

function refreshOpenApps(): void {
  try {
    const apps = useRunningApps.getState().runningApps.map((a) => appName(a.id));
    contextEngine.setOpenApps(apps);
  } catch { /* store not ready */ }
}

function stageName(stageId: string): string {
  try {
    const st = useStageStore.getState() as unknown as { stages?: Array<{ id: string; name?: string }> };
    return st.stages?.find((s) => s.id === stageId)?.name || stageId;
  } catch { return stageId; }
}

/** Begin feeding the shared Context Engine from ContextBus. Idempotent. */
export function startContextEngine(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  (window as unknown as { __dexContextEngine?: typeof contextEngine }).__dexContextEngine = contextEngine;

  // Open-apps is driven by a DIRECT store subscription, not ContextBus: the bus
  // throttles to one event per channel per ~frame, so two rapid app opens would
  // drop the second event and leave the set stale. The store subscription always
  // reflects the true running set. ContextBus app:opened is used only for the
  // (best-effort) activity log.
  useRunningApps.subscribe(() => refreshOpenApps());
  ContextBus.on('app:opened', ({ appId }) => { contextEngine.recordActivity('app', appName(appId)); });
  // setFile / setProject record their own activity entry on change.
  ContextBus.on('file:opened', ({ path }) => { if (path) contextEngine.setFile(path); });
  ContextBus.on('file:saved', ({ path }) => { if (path) contextEngine.setFile(path); });
  ContextBus.on('note:opened', ({ id, title }) => { contextEngine.recordActivity('note', title || id); });
  ContextBus.on('task:created', ({ title }) => { contextEngine.recordActivity('task', title); });
  ContextBus.on('continuity:project', ({ projectId }) => { contextEngine.setProject(projectId); });
  ContextBus.on('continuity:stage', ({ stageId }) => { contextEngine.setWorkspace(stageName(stageId)); });

  refreshOpenApps();
}
