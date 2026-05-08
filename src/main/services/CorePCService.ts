// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// CorePCService -- "modular CorePC architecture" inspired integrity layer.
//
// Goal: separate the immutable core (main process bundle, preload, native
// addon) from mutable user data so that:
//   1. We can detect tampering / partial-uninstall corruption at boot.
//   2. We can fast-path updates by replacing only the core artifacts.
//   3. The renderer can refuse to load apps if the core is unsigned / changed
//      in an unexpected way (defence-in-depth alongside Electron's ASAR check).
//
// On boot we hash the known-immutable files under app.getAppPath() and compare
// against a snapshot stored in userData/core-integrity.json. The first run
// records the baseline; subsequent runs report which files changed (which is
// expected after an installer update, where we re-baseline automatically when
// app.getVersion() differs).
// =============================================================================

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

export interface CoreIntegritySnapshot {
  version: string;
  recordedAt: number;
  hashes: Record<string, string>;
}

export interface CoreIntegrityReport {
  status: 'baseline-recorded' | 'verified' | 'changed' | 'rebaselined' | 'error';
  appVersion: string;
  changedFiles: string[];
  missingFiles: string[];
  newFiles: string[];
  durationMs: number;
}

const CORE_FILES_GLOB_REL = [
  'dist/main/main.js',
  'dist/main/preload.js',
];

function snapshotPath(): string {
  return path.join(app.getPath('userData'), 'core-integrity.json');
}

function sha256OfFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readSnapshot(): CoreIntegritySnapshot | null {
  try {
    const raw = fs.readFileSync(snapshotPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.version === 'string' &&
      typeof parsed?.recordedAt === 'number' &&
      parsed?.hashes && typeof parsed.hashes === 'object'
    ) {
      return parsed as CoreIntegritySnapshot;
    }
  } catch {
    // Missing or corrupt -- treat as no baseline.
  }
  return null;
}

function writeSnapshot(snap: CoreIntegritySnapshot): void {
  try {
    fs.writeFileSync(snapshotPath(), JSON.stringify(snap, null, 2), 'utf8');
  } catch (err) {
    log.warn('[CorePC] writeSnapshot failed:', err);
  }
}

function collectCurrentHashes(): { hashes: Record<string, string>; missing: string[] } {
  const base = app.getAppPath();
  const hashes: Record<string, string> = {};
  const missing: string[] = [];
  for (const rel of CORE_FILES_GLOB_REL) {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    try {
      hashes[rel] = sha256OfFile(abs);
    } catch (err) {
      log.warn(`[CorePC] hash failed for ${rel}:`, err);
      missing.push(rel);
    }
  }
  return { hashes, missing };
}

export async function verifyCoreIntegrity(): Promise<CoreIntegrityReport> {
  const start = Date.now();
  const appVersion = app.getVersion();
  try {
    const { hashes: current, missing } = collectCurrentHashes();
    const snap = readSnapshot();

    // First run: record baseline.
    if (!snap) {
      writeSnapshot({ version: appVersion, recordedAt: Date.now(), hashes: current });
      return {
        status: 'baseline-recorded',
        appVersion,
        changedFiles: [],
        missingFiles: missing,
        newFiles: [],
        durationMs: Date.now() - start,
      };
    }

    // Version bumped: re-baseline silently (legitimate update).
    if (snap.version !== appVersion) {
      writeSnapshot({ version: appVersion, recordedAt: Date.now(), hashes: current });
      return {
        status: 'rebaselined',
        appVersion,
        changedFiles: [],
        missingFiles: missing,
        newFiles: [],
        durationMs: Date.now() - start,
      };
    }

    const changed: string[] = [];
    const newFiles: string[] = [];
    for (const [rel, hash] of Object.entries(current)) {
      const prev = snap.hashes[rel];
      if (!prev) newFiles.push(rel);
      else if (prev !== hash) changed.push(rel);
    }

    return {
      status: changed.length > 0 || missing.length > 0 ? 'changed' : 'verified',
      appVersion,
      changedFiles: changed,
      missingFiles: missing,
      newFiles,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    log.error('[CorePC] verifyCoreIntegrity failed:', err);
    return {
      status: 'error',
      appVersion,
      changedFiles: [],
      missingFiles: [],
      newFiles: [],
      durationMs: Date.now() - start,
    };
  }
}

export function registerCorePcIpc(): void {
  ipcMain.handle('corepc:verify', async () => verifyCoreIntegrity());
}
