// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// CreatorAccessService — TS-side IPC bridge for the native creator_key
// module. Stores no secrets; all signing happens offline by the owner. The
// service simply mediates challenge/verify between the renderer and the
// native verifier, then persists the resulting unlock token in
// userData/creator-access.json so the surface stays unlocked across
// renderer reloads (but never across process restarts — the underlying
// HMAC secret is regenerated on every boot).
//
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface NativeCreatorBindings {
  creatorKeyStatus(): { configured: boolean; fingerprint?: string | null };
  creatorMakeChallenge(): { challenge: string; issuedAt: number; expiresAt: number };
  creatorVerifySignature(challenge: string, signatureHex: string): {
    ok: boolean;
    token?: string | null;
    expiresAt?: number | null;
    reason?: string | null;
  };
  creatorCheckToken(token: string): {
    valid: boolean;
    expiresAt?: number | null;
    reason?: string | null;
  };
}

let nativeRef: NativeCreatorBindings | null = null;
function loadNative(): NativeCreatorBindings | null {
  if (nativeRef) return nativeRef;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../native');
    if (typeof mod?.creatorKeyStatus === 'function') {
      nativeRef = mod as NativeCreatorBindings;
      return nativeRef;
    }
  } catch (err) {
    console.warn('[creator-access] native module unavailable:', err);
  }
  return null;
}

interface PersistedToken {
  token: string;
  expiresAt: number;
}

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'creator-access.json');
}

function loadPersisted(): PersistedToken | null {
  try {
    const raw = fs.readFileSync(tokenFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && typeof parsed.expiresAt === 'number') {
      return parsed;
    }
  } catch {
    /* missing / corrupt — ignore */
  }
  return null;
}

function persist(token: PersistedToken | null): void {
  try {
    if (!token) {
      try { fs.unlinkSync(tokenFile()); } catch { /* not present */ }
      return;
    }
    fs.writeFileSync(tokenFile(), JSON.stringify(token, null, 2), 'utf8');
  } catch (err) {
    console.warn('[creator-access] failed to persist token:', err);
  }
}

function safeString(v: unknown, max = 4096): string | null {
  if (typeof v !== 'string') return null;
  if (v.length === 0 || v.length > max) return null;
  return v;
}

export function registerCreatorAccessIpc(): void {
  ipcMain.handle('creator:status', () => {
    const native = loadNative();
    if (!native) {
      return { configured: false, fingerprint: null, available: false };
    }
    const s = native.creatorKeyStatus();
    return { ...s, available: true };
  });

  ipcMain.handle('creator:challenge', () => {
    const native = loadNative();
    if (!native) return null;
    return native.creatorMakeChallenge();
  });

  ipcMain.handle('creator:verify', (_evt, challenge: unknown, signature: unknown) => {
    const native = loadNative();
    if (!native) return { ok: false, reason: 'native-unavailable' };
    const c = safeString(challenge);
    const s = safeString(signature, 256);
    if (!c || !s) return { ok: false, reason: 'invalid-input' };
    const result = native.creatorVerifySignature(c, s);
    if (result.ok && result.token && result.expiresAt) {
      persist({ token: result.token, expiresAt: result.expiresAt });
    }
    return result;
  });

  ipcMain.handle('creator:current', () => {
    const native = loadNative();
    if (!native) return { unlocked: false, reason: 'native-unavailable' };
    const persisted = loadPersisted();
    if (!persisted) return { unlocked: false };
    const status = native.creatorCheckToken(persisted.token);
    if (!status.valid) {
      persist(null);
      return { unlocked: false, reason: status.reason ?? 'invalid' };
    }
    return { unlocked: true, expiresAt: status.expiresAt };
  });

  ipcMain.handle('creator:lock', () => {
    persist(null);
    return { unlocked: false };
  });
}
