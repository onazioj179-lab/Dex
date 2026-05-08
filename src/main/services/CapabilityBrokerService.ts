// =============================================================================
// DEX Platform — Phase 3 host: Capability Broker
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Wraps the in-memory CapabilityBroker with a process-wide singleton,
 * persistent audit log, and IPC channels.
 *
 *   capability:issue        (appId, capability) -> CapabilityToken | null
 *   capability:validate     (token, expect)     -> boolean
 *   capability:audit-tail   (count?)            -> AuditEvent[]
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';
import {
  CapabilityBroker,
  type AuditEvent,
  type AuditSink,
  type GrantLookup,
} from '../../shared/runtime/capabilityBroker';
import type {
  CapabilityToken,
  TokenVerifier,
} from '../../shared/runtime/capabilityToken';
import type { AppCapability } from '../../shared/runtime/appContainer';
import { getGrants } from './PermissionsService';

const AUDIT_FILE = (): string => path.join(app.getPath('userData'), 'capability-audit.log');
const MAX_AUDIT_LINES = 5_000;

let broker: CapabilityBroker | null = null;
const auditTail: AuditEvent[] = [];

const verifier: TokenVerifier = {
  computeHmac: (payload: string) => {
    const secret = getOrCreateSecret();
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  },
};

let secretCache: Buffer | null = null;
function getOrCreateSecret(): Buffer {
  if (secretCache) return secretCache;
  const p = path.join(app.getPath('userData'), 'capability-secret.bin');
  try {
    secretCache = fs.readFileSync(p);
    return secretCache;
  } catch { /* generate */ }
  secretCache = crypto.randomBytes(32);
  try { fs.writeFileSync(p, secretCache, { mode: 0o600 }); }
  catch (e) { log.warn('[Capability] persist secret failed', e); }
  return secretCache;
}

const grantLookup: GrantLookup = {
  isGranted: (appId, capability) => {
    return getGrants().some(g =>
      g.origin === appId &&
      String(g.capability) === String(capability) &&
      g.decision === 'allow' &&
      g.expiresAt > Date.now(),
    );
  },
};

const sink: AuditSink = {
  record: (e: AuditEvent) => {
    auditTail.push(e);
    if (auditTail.length > MAX_AUDIT_LINES) auditTail.shift();
    try { fs.appendFileSync(AUDIT_FILE(), JSON.stringify(e) + '\n'); }
    catch { /* best-effort */ }
  },
};

function getBroker(): CapabilityBroker {
  if (!broker) broker = new CapabilityBroker(grantLookup, verifier, sink);
  return broker;
}

export function issue(appId: string, capability: AppCapability): CapabilityToken | null {
  return getBroker().issue(appId, capability);
}

export function validate(token: CapabilityToken, expect: { appId: string; capability: AppCapability }): boolean {
  return getBroker().validate(token, expect);
}

export function auditTailSlice(count = 100): AuditEvent[] {
  return auditTail.slice(-count);
}

export function registerCapabilityBrokerIpc(): void {
  ipcMain.handle('capability:issue', (_e, appId: string, capability: AppCapability) => issue(appId, capability));
  ipcMain.handle('capability:validate', (_e, token: CapabilityToken, expect: { appId: string; capability: AppCapability }) => validate(token, expect));
  ipcMain.handle('capability:audit-tail', (_e, count?: number) => auditTailSlice(count ?? 100));
}
