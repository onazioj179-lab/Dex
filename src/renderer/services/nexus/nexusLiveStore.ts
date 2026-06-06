// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus live store (ROADMAP-600 #502). The renderer adapter that makes the
 * Nexus memory graph *live*: it subscribes to ContextBus, maps each event to a
 * pure `IngestEvent`, and applies it to a shared `NexusModel` via `ingestEvent`.
 *
 * Mapping + model mutation stay pure (shared/nexus); only the subscription glue
 * lives here. `installNexusIngest()` is idempotent and back-fills from the
 * ContextBus replay ring so opening Nexus catches up on recent activity.
 */

import ContextBus, { type ContextChannel, type ContextEventMap } from '../ContextBus';
import { NexusModel } from '../../../shared/nexus/model';
import { ingestEvent, type IngestEvent } from '../../../shared/nexus/ingest';

let model: NexusModel | null = null;
let installed = false;
let lastProjectRef: string | null = null;
const offs: Array<() => void> = [];
const changeListeners = new Set<() => void>();

export function getNexusModel(): NexusModel {
  if (!model) model = new NexusModel();
  return model;
}

export function onNexusChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

function notify(): void {
  changeListeners.forEach((fn) => { try { fn(); } catch { /* listener error */ } });
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function parentProject(): IngestEvent['parent'] {
  return lastProjectRef ? { kind: 'project', ref: lastProjectRef } : undefined;
}

/**
 * Pure-ish mapping table: ContextBus payload -> IngestEvent (or null to skip).
 * Exported for unit testing the mapping without ContextBus.
 */
export const NEXUS_ROUTES: {
  [C in ContextChannel]?: (payload: ContextEventMap[C], now: number) => IngestEvent | null;
} = {
  'continuity:project': (p, now) => {
    lastProjectRef = p.projectId;
    return { kind: 'project', ref: p.projectId, label: p.projectId, ts: now };
  },
  'file:opened': (p, now) => {
    const ref = p.path || p.appId;
    return { kind: 'file', ref, label: baseName(ref), ts: now, parent: parentProject() };
  },
  'file:saved': (p, now) => {
    const ref = p.path || p.appId;
    return { kind: 'file', ref, label: baseName(ref), ts: now, parent: parentProject() };
  },
  'note:opened': (p, now) => ({
    kind: 'idea', ref: `note:${p.id}`, label: p.title || p.id, ts: now, parent: parentProject(),
  }),
  'app:opened': (p, now) => ({
    kind: 'session', ref: `app:${p.appId}`, label: p.appId, ts: p.ts || now,
  }),
  'continuity:assetFocus': (p, now) => ({
    kind: 'asset', ref: p.assetId, label: p.assetId, ts: now, tags: [p.kind],
  }),
};

function applyRoute<C extends ContextChannel>(channel: C, payload: ContextEventMap[C]): void {
  const route = NEXUS_ROUTES[channel];
  if (!route) return;
  const ev = route(payload, Date.now());
  if (!ev) return;
  ingestEvent(getNexusModel(), ev);
  notify();
}

/**
 * Subscribe ContextBus → NexusModel. Idempotent. Returns an uninstall fn.
 * When `backfill` is true (default) it first replays the ContextBus ring so a
 * freshly opened Nexus reflects recent activity.
 */
export function installNexusIngest(backfill = true): () => void {
  if (installed) return uninstallNexusIngest;
  installed = true;

  const channels = Object.keys(NEXUS_ROUTES) as ContextChannel[];

  if (backfill) {
    for (const ev of ContextBus.replay()) {
      if ((NEXUS_ROUTES as Record<string, unknown>)[ev.channel]) {
        applyRoute(ev.channel, ev.payload as ContextEventMap[ContextChannel]);
      }
    }
  }

  for (const channel of channels) {
    offs.push(ContextBus.on(channel, (payload) => applyRoute(channel, payload)));
  }
  return uninstallNexusIngest;
}

export function uninstallNexusIngest(): void {
  offs.forEach((off) => off());
  offs.length = 0;
  installed = false;
}

/** Test helper: clear model + subscriptions + remembered project. */
export function _resetNexusLive(): void {
  uninstallNexusIngest();
  model = null;
  lastProjectRef = null;
  changeListeners.clear();
}
