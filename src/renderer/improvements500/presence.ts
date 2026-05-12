// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Presence store (T4-001, T4-039, T4-040).
 *
 * Local in-renderer presence registry. Tracks own status + remote peers.
 * Decoupled from any specific transport — Nexus / Collab Hub feed into it.
 */

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'offline';

export interface PresenceRecord {
  userId: string;
  displayName: string;
  status: PresenceStatus;
  /** Optional custom status text (max 80 chars). */
  customText?: string;
  /** Timezone identifier, e.g. "Africa/Lagos". */
  timezone?: string;
  /** Last activity unix ms. */
  lastSeen: number;
  /** Avatar url (optional). */
  avatarUrl?: string;
}

const peers = new Map<string, PresenceRecord>();
let self: PresenceRecord | null = null;
const listeners = new Set<() => void>();

const IDLE_AFTER_MS = 5 * 60_000;

function notify(): void { listeners.forEach((fn) => { try { fn(); } catch { /* noop */ } }); }

export function setSelf(record: Omit<PresenceRecord, 'lastSeen'> & { lastSeen?: number }): void {
  self = { ...record, lastSeen: record.lastSeen ?? Date.now() };
  notify();
}

export function getSelf(): PresenceRecord | null { return self; }

export function setStatus(status: PresenceStatus): void {
  if (!self) return;
  self = { ...self, status, lastSeen: Date.now() };
  notify();
}

export function setCustomText(text: string): void {
  if (!self) return;
  const clipped = text.slice(0, 80);
  self = { ...self, customText: clipped, lastSeen: Date.now() };
  notify();
}

export function upsertPeer(record: PresenceRecord): void {
  peers.set(record.userId, record);
  notify();
}

export function removePeer(userId: string): void {
  if (peers.delete(userId)) notify();
}

export function listPeers(): PresenceRecord[] {
  return Array.from(peers.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Recompute idle/away based on lastSeen relative to now. */
export function pruneIdle(now: number = Date.now()): void {
  let changed = false;
  for (const [id, rec] of peers) {
    if (rec.status === 'online' && now - rec.lastSeen > IDLE_AFTER_MS) {
      peers.set(id, { ...rec, status: 'idle' });
      changed = true;
    }
  }
  if (self && self.status === 'online' && now - self.lastSeen > IDLE_AFTER_MS) {
    self = { ...self, status: 'idle' };
    changed = true;
  }
  if (changed) notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test helper. */
export function _reset(): void {
  peers.clear();
  self = null;
  listeners.clear();
}
