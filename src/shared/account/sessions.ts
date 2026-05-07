// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sessions and trusted devices.
 *
 * Pure model: a list of active sessions per account, with revoke + step-up
 * gating for destructive actions. The renderer drives the IPC; this file
 * only knows about the data shape and rules.
 */

// DEX v3.8.9 - sessions

export interface DeviceSession {
  id: string;
  deviceName: string;
  platform: 'win' | 'mac' | 'linux' | 'web' | 'ios' | 'android';
  fingerprint: string;          // opaque hash of stable device traits
  ipHash: string;               // SHA-256(IP) — never raw IP
  geoCoarse?: string;           // "US-CA", never lat/long
  createdAt: number;
  lastSeenAt: number;
  trusted: boolean;
  current: boolean;
}

export interface SessionStore {
  sessions: DeviceSession[];
}

export function createSessionStore(): SessionStore {
  return { sessions: [] };
}

export function addSession(store: SessionStore, s: Omit<DeviceSession, 'createdAt' | 'lastSeenAt'>, now: number = Date.now()): SessionStore {
  if (store.sessions.some((x) => x.id === s.id)) return store;
  return { sessions: [...store.sessions, { ...s, createdAt: now, lastSeenAt: now }] };
}

export function touchSession(store: SessionStore, id: string, now: number = Date.now()): SessionStore {
  return { sessions: store.sessions.map((s) => s.id === id ? { ...s, lastSeenAt: now } : s) };
}

export function revokeSession(store: SessionStore, id: string): SessionStore {
  return { sessions: store.sessions.filter((s) => s.id !== id) };
}

export function revokeAllExcept(store: SessionStore, currentId: string): SessionStore {
  return { sessions: store.sessions.filter((s) => s.id === currentId) };
}

export function trustDevice(store: SessionStore, id: string): SessionStore {
  return { sessions: store.sessions.map((s) => s.id === id ? { ...s, trusted: true } : s) };
}

export type StepUpReason = 'delete-account' | 'change-email' | 'rotate-recovery-codes' | 'export-data' | 'add-heir' | 'change-payment';

/** Step-up policy: untrusted devices must always re-auth; trusted devices re-auth only after a window. */
export function requiresStepUp(args: {
  session: DeviceSession;
  reason: StepUpReason;
  lastStepUpAt?: number;
  now?: number;
  trustedWindowMs?: number;     // default 15 minutes
}): boolean {
  const trustedWindowMs = args.trustedWindowMs ?? 15 * 60 * 1000;
  if (!args.session.trusted) return true;
  if (args.reason === 'delete-account' || args.reason === 'rotate-recovery-codes') return true;
  if (args.lastStepUpAt === undefined) return true;
  const now = args.now ?? Date.now();
  return now - args.lastStepUpAt > trustedWindowMs;
}

/** Detect concurrent sign-in from a NEW geo while another session is still active. */
export function detectSuspicious(store: SessionStore, candidate: { geoCoarse?: string; fingerprint: string }, withinMs: number = 60 * 60 * 1000, now: number = Date.now()): boolean {
  const recent = store.sessions.filter((s) => now - s.lastSeenAt < withinMs);
  if (recent.length === 0) return false;
  if (recent.some((s) => s.fingerprint === candidate.fingerprint)) return false;
  if (!candidate.geoCoarse) return false;
  return recent.some((s) => s.geoCoarse && s.geoCoarse !== candidate.geoCoarse);
}
