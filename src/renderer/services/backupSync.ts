// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Backup & Sync — encrypted, local-first export/import/restore of all DEX data.
 *
 * No server, no cloud account. A backup is the set of persisted `dex-*` / `dex.*`
 * localStorage keys, wrapped in a versioned envelope (schema + timestamp), then
 * encrypted client-side with the SAME real AES-GCM-256 + PBKDF2 module the cloud
 * uploader uses (src/shared/cloud/encryption). Lose the passphrase, lose the
 * data — the bytes on disk are unreadable without it.
 *
 * Restore supports two modes:
 *   - 'replace' — overwrite each key with the backup value.
 *   - 'merge'   — per key, keep the NEWER value using the shared conflictResolver
 *                 + a best-effort timestamp/version heuristic (versioning-style).
 *
 * Offline folder sync writes/reads `.dexbackup` files via the same FS bridge the
 * editor apps use (`dialog:showSaveDialog` / `dialog:showOpenDialog` / `fs:writeText`
 * / `fs:readText` / `fs:readdir`). When the bridge is absent (web preview), it
 * falls back to a Blob download and a file-input picker.
 */

import {
  buildEnvelope,
  validateEnvelope,
  deriveKekFromPassphrase,
  encryptWithKek,
  decryptWithKek,
  passphraseAcceptable,
  KDF_SALT_BYTES,
  type EncryptedEnvelope,
} from '../../shared/cloud/encryption';
import { resolveConflict, jsonEquals } from '../../shared/cloud/conflictResolver';

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

/** Bumped when the backup payload shape changes. Validated on import. */
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_FILE_EXT = 'dexbackup';
/** localStorage keys belonging to DEX use these prefixes. */
const DEX_KEY_PREFIXES = ['dex-', 'dex.'];
/** Local index of backups produced/restored on this device. */
const RECENT_BACKUPS_KEY = 'dex-backupsync-recent-v1';
const MAX_RECENT_BACKUPS = 25;
/** Synthetic accountId bound into the AES-GCM AAD for local (no-account) backups. */
const LOCAL_ACCOUNT_ID = 'dex-local-backup';

export interface BackupPayload {
  /** Marker so a foreign file is rejected fast. */
  __dex_backup: true;
  schema: number;
  /** App version string if discoverable, else 'unknown'. */
  appVersion: string;
  createdAt: number;
  /** Map of localStorage key -> raw string value. */
  data: Record<string, string>;
  /** Count of keys captured, for a quick integrity glance. */
  keyCount: number;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreChange {
  key: string;
  /** 'added' = key absent locally; 'updated' = overwritten; 'kept-local' = merge kept existing; 'unchanged' = identical. */
  action: 'added' | 'updated' | 'kept-local' | 'unchanged';
}

export interface RestoreSummary {
  mode: RestoreMode;
  added: number;
  updated: number;
  keptLocal: number;
  unchanged: number;
  failed: number;
  changes: RestoreChange[];
  errors: string[];
}

export interface RecentBackup {
  id: string;
  /** 'export' | 'restore' | 'sync-out' | 'sync-in' */
  kind: 'export' | 'restore' | 'sync-out' | 'sync-in';
  at: number;
  /** File name or path, when known. */
  location?: string;
  keyCount: number;
  /** Restore-only: short outcome line. */
  note?: string;
}

// ---------------------------------------------------------------------------
// FS bridge helpers (mirror dexCode/fileIO + project.ts contracts)
// ---------------------------------------------------------------------------

interface DexBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
}

function bridge(): DexBridge | null {
  try {
    const dex = (typeof window !== 'undefined' ? (window as any).dex : null) || null;
    return dex && typeof dex.invoke === 'function' ? dex : null;
  } catch {
    return null;
  }
}

export function hasNativeFs(): boolean {
  return bridge() !== null;
}

/** Join a folder root and an entry name using the root's own separator. */
function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.endsWith('\\') || root.endsWith('/') ? root + name : root + sep + name;
}

// ---------------------------------------------------------------------------
// App version (best-effort; never throws)
// ---------------------------------------------------------------------------

function appVersion(): string {
  try {
    const w = window as any;
    return (
      w?.dex?.appVersion ||
      w?.DEX_VERSION ||
      localStorage.getItem('dex-app-version') ||
      'unknown'
    );
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// 1. collectBackup — gather all persisted DEX state
// ---------------------------------------------------------------------------

function isDexKey(key: string): boolean {
  return DEX_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Snapshot every `dex-*` / `dex.*` localStorage key into a versioned payload.
 * Pure read; never mutates storage.
 */
export function collectBackup(): BackupPayload {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isDexKey(key)) continue;
      // Skip the recent-backups index itself — it's bookkeeping, not user data.
      if (key === RECENT_BACKUPS_KEY) continue;
      try {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      } catch {
        /* skip unreadable key */
      }
    }
  } catch (err) {
    console.warn('[backupSync] collectBackup: localStorage unavailable', err);
  }
  return {
    __dex_backup: true,
    schema: BACKUP_SCHEMA_VERSION,
    appVersion: appVersion(),
    createdAt: Date.now(),
    data,
    keyCount: Object.keys(data).length,
  };
}

// ---------------------------------------------------------------------------
// Crypto: encrypt / decrypt the backup blob via the shared cloud module
// ---------------------------------------------------------------------------

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return (globalThis as { btoa?: (s: string) => string }).btoa?.(s) ?? '';
}

/**
 * Encrypt an arbitrary string into a serialised EncryptedEnvelope JSON string.
 * Uses passphrase-derived KEK (PBKDF2-SHA256, 600k iters) + AES-GCM-256.
 */
async function encryptString(plaintext: string, passphrase: string): Promise<string> {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto || !crypto.subtle) throw new Error('Web Crypto is unavailable in this environment.');

  const salt = crypto.getRandomValues(new Uint8Array(KDF_SALT_BYTES));
  const kek = await deriveKekFromPassphrase(passphrase, salt);
  const ptBytes = new TextEncoder().encode(plaintext);
  const { nonce, ciphertext } = await encryptWithKek(ptBytes, kek, LOCAL_ACCOUNT_ID);

  // For passphrase E2EE the data key IS the KEK, so there is no separately
  // wrapped DEK; validateEnvelope only requires the field to be a non-empty
  // string, so we bind the salt there too (kept self-documenting).
  const env: EncryptedEnvelope = buildEnvelope({
    keySource: 'user-passphrase',
    saltB64: b64(salt),
    nonceB64: b64(nonce),
    wrappedDekB64: b64(salt), // non-empty; KEK == DEK for passphrase mode
    ciphertextB64: b64(ciphertext),
    plaintextBytes: ptBytes.length,
    accountId: LOCAL_ACCOUNT_ID,
  });
  return JSON.stringify(env);
}

/** Decrypt a serialised EncryptedEnvelope JSON string back to plaintext. */
async function decryptString(envText: string, passphrase: string): Promise<string> {
  let env: unknown;
  try {
    env = JSON.parse(envText);
  } catch {
    throw new Error('File is not a valid DEX backup (could not parse envelope).');
  }
  if (!validateEnvelope(env)) {
    throw new Error('File is not a valid DEX backup (unrecognised or unsupported envelope).');
  }
  if (env.keySource !== 'user-passphrase' || !env.saltB64) {
    throw new Error('This backup was not encrypted with a passphrase.');
  }
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto || !crypto.subtle) throw new Error('Web Crypto is unavailable in this environment.');

  const unb64 = (s: string): Uint8Array => {
    const atob = (globalThis as { atob?: (s: string) => string }).atob;
    const raw = atob ? atob(s) : '';
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  const salt = unb64(env.saltB64);
  const kek = await deriveKekFromPassphrase(passphrase, salt);
  let ptBytes: Uint8Array;
  try {
    ptBytes = await decryptWithKek(env, kek);
  } catch {
    // AES-GCM auth failure -> wrong passphrase or tampered file.
    throw new Error('Wrong passphrase, or the backup file is corrupt.');
  }
  return new TextDecoder().decode(ptBytes);
}

// ---------------------------------------------------------------------------
// 2. exportEncrypted — encrypt the backup and write/download a .dexbackup file
// ---------------------------------------------------------------------------

export interface ExportOutcome {
  success: boolean;
  /** File name or path written (when known). */
  location?: string;
  keyCount: number;
  error?: string;
}

function defaultBackupName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
  return `DEX-Backup-${stamp[0]}.${BACKUP_FILE_EXT}`;
}

/**
 * Collect, encrypt, and persist a backup. Uses the native save dialog when the
 * FS bridge is present, else triggers a Blob download.
 */
export async function exportEncrypted(passphrase: string): Promise<ExportOutcome> {
  if (!passphrase || passphrase.length < 8) {
    return { success: false, keyCount: 0, error: 'Enter a passphrase of at least 8 characters.' };
  }
  let payload: BackupPayload;
  let envText: string;
  try {
    payload = collectBackup();
    envText = await encryptString(JSON.stringify(payload), passphrase);
  } catch (err: any) {
    console.error('[backupSync] exportEncrypted: encrypt failed', err);
    return { success: false, keyCount: 0, error: err?.message || 'Encryption failed.' };
  }

  const fileName = defaultBackupName();
  const dex = bridge();

  // Native path: save dialog -> fs:writeText (atomic; failures are reported).
  if (dex) {
    try {
      const result = await dex.invoke('dialog:showSaveDialog', {
        defaultPath: fileName,
        filters: [
          { name: 'DEX Backup', extensions: [BACKUP_FILE_EXT] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!result || result.canceled || !result.filePath) {
        return { success: false, keyCount: payload.keyCount, error: 'Save cancelled.' };
      }
      const w = await dex.invoke('fs:writeText', result.filePath, envText);
      if (!w?.ok) return { success: false, keyCount: payload.keyCount, error: w?.error || 'Could not write the backup file.' };
      recordBackup({ kind: 'export', location: result.filePath, keyCount: payload.keyCount });
      return { success: true, location: result.filePath, keyCount: payload.keyCount };
    } catch (err: any) {
      console.error('[backupSync] exportEncrypted: native save failed', err);
      return { success: false, keyCount: payload.keyCount, error: err?.message || 'Could not write the backup file.' };
    }
  }

  // Web fallback: Blob download.
  try {
    const blob = new Blob([envText], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    recordBackup({ kind: 'export', location: fileName, keyCount: payload.keyCount });
    return { success: true, location: fileName, keyCount: payload.keyCount };
  } catch (err: any) {
    console.error('[backupSync] exportEncrypted: download failed', err);
    return { success: false, keyCount: payload.keyCount, error: err?.message || 'Could not download the backup.' };
  }
}

// ---------------------------------------------------------------------------
// 3. importEncrypted — decrypt + parse + validate
// ---------------------------------------------------------------------------

/**
 * Decrypt a `.dexbackup` file's text and validate the payload. Throws (caught by
 * the caller) with a human message on bad passphrase / corrupt / foreign file.
 */
export async function importEncrypted(fileText: string, passphrase: string): Promise<BackupPayload> {
  if (!fileText) throw new Error('The backup file is empty.');
  if (!passphrase) throw new Error('Enter the passphrase used to create this backup.');

  const plaintext = await decryptString(fileText, passphrase);

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error('Decrypted content is not valid JSON — the file may be damaged.');
  }
  const p = parsed as Partial<BackupPayload>;
  if (!p || p.__dex_backup !== true || typeof p.data !== 'object' || p.data === null) {
    throw new Error('This is not a DEX backup file.');
  }
  if (typeof p.schema !== 'number' || p.schema > BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema (v${String(p.schema)}). Update DEX to restore it.`);
  }
  return {
    __dex_backup: true,
    schema: p.schema,
    appVersion: typeof p.appVersion === 'string' ? p.appVersion : 'unknown',
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
    data: p.data as Record<string, string>,
    keyCount: typeof p.keyCount === 'number' ? p.keyCount : Object.keys(p.data as object).length,
  };
}

/** Open a file picker, read the chosen `.dexbackup`, and return its text + name. */
export async function pickBackupFile(): Promise<{ text: string; location: string } | null> {
  const dex = bridge();
  if (dex) {
    try {
      const result = await dex.invoke('dialog:showOpenDialog', {
        title: 'Open DEX Backup',
        properties: ['openFile'],
        filters: [
          { name: 'DEX Backup', extensions: [BACKUP_FILE_EXT] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!result || result.canceled || !result.filePaths?.length) return null;
      const path = result.filePaths[0];
      const r = await dex.invoke('fs:readText', path);
      if (!r?.ok) { console.error('[backupSync] pickBackupFile: read failed', r?.error); return null; }
      return { text: String(r.content), location: path };
    } catch (err) {
      console.error('[backupSync] pickBackupFile: native open failed', err);
      return null;
    }
  }
  // Web fallback: <input type=file>.
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `.${BACKUP_FILE_EXT},application/octet-stream`;
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return resolve(null);
        try {
          const text = await file.text();
          resolve({ text, location: file.name });
        } catch {
          resolve(null);
        }
      };
      input.click();
    } catch {
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// 4. restore — write keys back (merge | replace), guarded
// ---------------------------------------------------------------------------

/**
 * Pull a comparable "modified at" timestamp out of a stored value so merge can
 * prefer the newer side. Best-effort: looks at common fields, else 0.
 */
function valueTimestamp(raw: string): number {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw);
    const obj = Array.isArray(v) ? null : (v as Record<string, any>);
    if (obj) {
      for (const f of ['updatedAt', 'modifiedAt', 'savedAt', 'lastModified', 'timestamp', 'createdAt']) {
        const t = obj[f];
        if (typeof t === 'number' && Number.isFinite(t)) return t;
        if (typeof t === 'string') {
          const parsed = Date.parse(t);
          if (!Number.isNaN(parsed)) return parsed;
        }
      }
    }
  } catch {
    /* opaque/non-JSON value -> no timestamp */
  }
  return 0;
}

/**
 * Restore a validated backup into localStorage.
 *
 * - 'replace': every backed-up key overwrites the local value.
 * - 'merge':   per key, the shared conflictResolver decides. When both sides
 *              changed, the newer value (by embedded timestamp; backup's
 *              createdAt as a tiebreaker) wins, never silently losing the local
 *              copy without a recorded decision.
 *
 * Fully guarded: a single failing key is recorded and skipped, never aborts.
 */
export function restore(backup: BackupPayload, mode: RestoreMode): RestoreSummary {
  const summary: RestoreSummary = {
    mode,
    added: 0,
    updated: 0,
    keptLocal: 0,
    unchanged: 0,
    failed: 0,
    changes: [],
    errors: [],
  };

  if (!backup || backup.__dex_backup !== true || !backup.data) {
    summary.errors.push('Nothing to restore — invalid backup.');
    return summary;
  }

  for (const [key, incoming] of Object.entries(backup.data)) {
    // Guard: only ever touch DEX-owned keys.
    if (!isDexKey(key)) continue;
    try {
      const local = (() => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      })();

      if (local === null) {
        localStorage.setItem(key, incoming);
        summary.added++;
        summary.changes.push({ key, action: 'added' });
        continue;
      }

      if (jsonEquals(local, incoming)) {
        summary.unchanged++;
        summary.changes.push({ key, action: 'unchanged' });
        continue;
      }

      if (mode === 'replace') {
        localStorage.setItem(key, incoming);
        summary.updated++;
        summary.changes.push({ key, action: 'updated' });
        continue;
      }

      // merge: ask the shared resolver. base is unknown locally, so pass null;
      // a differing mine/theirs surfaces as a conflict we break by recency.
      const res = resolveConflict<string>(
        { base: null, mine: local, theirs: incoming },
        jsonEquals,
      );
      if (res.kind === 'no-conflict') {
        summary.unchanged++;
        summary.changes.push({ key, action: 'unchanged' });
      } else if (res.kind === 'auto-merged') {
        if (res.value !== local) {
          localStorage.setItem(key, res.value);
          summary.updated++;
          summary.changes.push({ key, action: 'updated' });
        } else {
          summary.unchanged++;
          summary.changes.push({ key, action: 'unchanged' });
        }
      } else {
        // Real conflict: keep the newer side.
        const localTs = valueTimestamp(local);
        const incomingTs = valueTimestamp(incoming) || backup.createdAt;
        if (incomingTs > localTs) {
          localStorage.setItem(key, incoming);
          summary.updated++;
          summary.changes.push({ key, action: 'updated' });
        } else {
          summary.keptLocal++;
          summary.changes.push({ key, action: 'kept-local' });
        }
      }
    } catch (err: any) {
      summary.failed++;
      summary.errors.push(`Couldn't restore "${key}": ${err?.message || 'write failed'}`);
    }
  }

  recordBackup({
    kind: 'restore',
    keyCount: Object.keys(backup.data).length,
    note: `${mode}: +${summary.added} ~${summary.updated} =${summary.unchanged}` +
      (summary.keptLocal ? ` keep ${summary.keptLocal}` : '') +
      (summary.failed ? ` fail ${summary.failed}` : ''),
  });

  return summary;
}

// ---------------------------------------------------------------------------
// Offline folder sync
// ---------------------------------------------------------------------------

export interface FolderBackupEntry {
  name: string;
  path: string;
}

/** Prompt for a folder; returns its path or null (native only). */
export async function pickSyncFolder(): Promise<string | null> {
  const dex = bridge();
  if (!dex) return null;
  try {
    const result = await dex.invoke('dialog:showOpenDialog', {
      title: 'Choose Sync Folder',
      properties: ['openDirectory'],
    });
    if (!result || result.canceled || !result.filePaths?.length) return null;
    return result.filePaths[0];
  } catch (err) {
    console.error('[backupSync] pickSyncFolder failed', err);
    return null;
  }
}

/** Write an encrypted backup file into a sync folder (native only). */
export async function syncOutToFolder(folder: string, passphrase: string): Promise<ExportOutcome> {
  const dex = bridge();
  if (!dex) return { success: false, keyCount: 0, error: 'Folder sync needs the desktop app.' };
  if (!passphrase || passphrase.length < 8) {
    return { success: false, keyCount: 0, error: 'Enter a passphrase of at least 8 characters.' };
  }
  try {
    const payload = collectBackup();
    const envText = await encryptString(JSON.stringify(payload), passphrase);
    const path = joinPath(folder, defaultBackupName());
    const w = await dex.invoke('fs:writeText', path, envText);
    if (!w?.ok) return { success: false, keyCount: payload.keyCount, error: w?.error || 'Could not write to the sync folder.' };
    recordBackup({ kind: 'sync-out', location: path, keyCount: payload.keyCount });
    return { success: true, location: path, keyCount: payload.keyCount };
  } catch (err: any) {
    console.error('[backupSync] syncOutToFolder failed', err);
    return { success: false, keyCount: 0, error: err?.message || 'Could not write to the sync folder.' };
  }
}

/** List `.dexbackup` files in a sync folder, newest-named last (native only). */
export async function listFolderBackups(folder: string): Promise<FolderBackupEntry[]> {
  const dex = bridge();
  if (!dex) return [];
  try {
    const names: string[] = (await dex.invoke('fs:readdir', folder)) || [];
    return names
      .filter((n) => typeof n === 'string' && n.toLowerCase().endsWith(`.${BACKUP_FILE_EXT}`))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, path: joinPath(folder, name) }));
  } catch (err) {
    console.error('[backupSync] listFolderBackups failed', err);
    return [];
  }
}

/** Read + decrypt a specific folder backup, returning the validated payload. */
export async function syncInFromFile(path: string, passphrase: string): Promise<BackupPayload> {
  const dex = bridge();
  if (!dex) throw new Error('Folder sync needs the desktop app.');
  let text: string;
  try {
    const r = await dex.invoke('fs:readText', path);
    if (!r?.ok) throw new Error(r?.error || 'Could not read the backup file.');
    text = String(r.content);
  } catch (err: any) {
    throw new Error(err?.message || 'Could not read the backup file.');
  }
  const payload = await importEncrypted(text, passphrase);
  recordBackup({ kind: 'sync-in', location: path, keyCount: payload.keyCount });
  return payload;
}

// ---------------------------------------------------------------------------
// Recent-backups index (local bookkeeping)
// ---------------------------------------------------------------------------

export function getRecentBackups(): RecentBackup[] {
  try {
    const raw = localStorage.getItem(RECENT_BACKUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordBackup(entry: Omit<RecentBackup, 'id' | 'at'>): void {
  try {
    const rec: RecentBackup = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      ...entry,
    };
    const next = [rec, ...getRecentBackups()].slice(0, MAX_RECENT_BACKUPS);
    localStorage.setItem(RECENT_BACKUPS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[backupSync] recordBackup failed', err);
  }
}

export function clearRecentBackups(): void {
  try {
    localStorage.removeItem(RECENT_BACKUPS_KEY);
  } catch {
    /* ignore */
  }
}

/** Re-export so the UI can nudge the user toward a strong passphrase. */
export { passphraseAcceptable };
