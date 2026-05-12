// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI structured data schemas — versioned, expandable, JSON-safe.
 *
 * Bump `SCHEMA_VERSION` when an incompatible change is made and add a
 * migration in `migrate()`. UKI never silently throws away user data.
 */

export const SCHEMA_VERSION = 1;

export interface UkiVersioned {
  schemaVersion: number;
}

/** A single conversational turn between user and UKI. */
export interface UkiTurnRecord extends UkiVersioned {
  id: string;
  ts: number;
  user: string;
  ukiResponse: string;
  intent?: string;
  thoughtSteps?: readonly string[];
  appContext?: { foregroundAppId?: string; openAppIds?: readonly string[] };
}

/** A snapshot of UKI's view of the desktop at a moment in time. */
export interface UkiContextSnapshotRecord extends UkiVersioned {
  ts: number;
  foregroundAppId?: string;
  openAppIds?: readonly string[];
  workspaceId?: string;
  recentFiles?: readonly string[];
  workflowTags?: readonly string[];
}

/** A user-defined or learned workflow recipe. */
export interface UkiWorkflowRecord extends UkiVersioned {
  id: string;
  title: string;
  steps: readonly string[];
  triggers?: readonly string[];
  createdTs: number;
  updatedTs: number;
}

/** Cached fact retrieved from a free API. */
export interface UkiFactRecord extends UkiVersioned {
  source: 'wikipedia' | 'open-meteo' | 'worldtime' | 'duckduckgo' | 'local';
  key: string;
  payload: unknown;
  fetchedTs: number;
  expiresTs: number;
}

/** Permission grant the user has approved for UKI. */
export interface UkiPermissionRecord extends UkiVersioned {
  capability:
    | 'screen-read' | 'file-read' | 'file-write'
    | 'shell' | 'network' | 'clipboard'
    | 'microphone' | 'camera' | 'notifications';
  scope: 'session' | 'persistent';
  grantedTs: number;
  expiresTs?: number;
}

/** Generic migration entry point — extend as schema evolves. */
export function migrate<T extends UkiVersioned>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  if (record.schemaVersion === SCHEMA_VERSION) return record;
  // Future migrations chain here.
  return { ...record, schemaVersion: SCHEMA_VERSION };
}

export function freshTurn(user: string, ukiResponse: string, extras: Partial<UkiTurnRecord> = {}): UkiTurnRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    user,
    ukiResponse,
    ...extras,
  };
}
