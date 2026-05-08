// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// PermissionsService
//
// Owns the persisted permission grant store and exposes a consolidated API
// to the renderer. Applies permissionsPolicy decisions, persists to
// userData/permission-grants.json, prunes expired entries on load, and
// surfaces IPC for request / list / revoke flows.
// =============================================================================

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import {
  type PermissionGrant,
  type PermissionRequest,
  type PermissionDecision,
  type PermissionCapability,
  decidePermission,
  batchPrompts,
  buildGrant,
  pruneExpired,
  isPermissionCapability,
} from '../../shared/permissions/permissionsPolicy';

const STORE_FILENAME = 'permission-grants.json';

let cache: PermissionGrant[] | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILENAME);
}

function loadGrants(): PermissionGrant[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter(isValidGrant);
      cache = pruneExpired(filtered);
      return cache;
    }
  } catch {
    // First run or corrupt file — start fresh.
  }
  cache = [];
  return cache;
}

function isValidGrant(g: unknown): g is PermissionGrant {
  if (!g || typeof g !== 'object') return false;
  const o = g as Record<string, unknown>;
  return (
    isPermissionCapability(o.capability) &&
    typeof o.origin === 'string' &&
    (o.decision === 'allow' || o.decision === 'deny') &&
    typeof o.grantedAt === 'number' &&
    typeof o.expiresAt === 'number'
  );
}

function persist(): void {
  if (!cache) return;
  try {
    fs.writeFileSync(storePath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    log.warn('[Permissions] persist failed:', err);
  }
}

export function getGrants(): PermissionGrant[] {
  return [...loadGrants()];
}

export function recordDecision(
  request: PermissionRequest,
  decision: 'allow' | 'deny',
  fromGroup: boolean = false
): PermissionGrant {
  const grants = loadGrants();
  // Replace any existing grant for the same (capability, origin) tuple so
  // a fresh user choice always supersedes the older one.
  const filtered = grants.filter(
    (g) => !(g.capability === request.capability && g.origin === request.origin)
  );
  const fresh = buildGrant(request, decision, Date.now(), fromGroup);
  cache = [...filtered, fresh];
  persist();
  return fresh;
}

export function revokeGrant(capability: PermissionCapability, origin: string): boolean {
  const grants = loadGrants();
  const next = grants.filter(
    (g) => !(g.capability === capability && g.origin === origin)
  );
  if (next.length === grants.length) return false;
  cache = next;
  persist();
  return true;
}

export function revokeAll(): void {
  cache = [];
  persist();
}

export function decide(request: PermissionRequest): PermissionDecision {
  return decidePermission(loadGrants(), request);
}

export function planBatch(requests: PermissionRequest[]) {
  return batchPrompts(loadGrants(), requests);
}

export function registerPermissionsIpc(): void {
  ipcMain.handle('permissions:list', () => getGrants());
  ipcMain.handle('permissions:decide', (_evt, request: PermissionRequest) => {
    if (!isValidRequest(request)) return 'deny';
    return decide(request);
  });
  ipcMain.handle('permissions:plan-batch', (_evt, requests: PermissionRequest[]) => {
    if (!Array.isArray(requests) || !requests.every(isValidRequest)) {
      return { allowed: [], denied: [], batches: {} };
    }
    return planBatch(requests);
  });
  ipcMain.handle(
    'permissions:record',
    (_evt, request: PermissionRequest, decision: 'allow' | 'deny', fromGroup?: boolean) => {
      if (!isValidRequest(request)) return null;
      if (decision !== 'allow' && decision !== 'deny') return null;
      return recordDecision(request, decision, !!fromGroup);
    }
  );
  ipcMain.handle('permissions:revoke', (_evt, capability: unknown, origin: unknown) => {
    if (!isPermissionCapability(capability)) return false;
    if (typeof origin !== 'string' || origin.length === 0) return false;
    return revokeGrant(capability, origin);
  });
  ipcMain.handle('permissions:revoke-all', () => {
    revokeAll();
    return true;
  });
}

function isValidRequest(r: unknown): r is PermissionRequest {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return (
    isPermissionCapability(o.capability) &&
    typeof o.origin === 'string' && o.origin.length > 0 &&
    typeof o.reason === 'string' && o.reason.length > 0 &&
    (o.ttlMs === undefined || (typeof o.ttlMs === 'number' && o.ttlMs >= 0))
  );
}
