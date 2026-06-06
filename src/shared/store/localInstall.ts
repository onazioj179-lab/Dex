// =============================================================================
// DEX Platform — Local install (developer sideload, full production gate)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure logic for installing a signed `.dexplug` envelope from local disk —
 * the path a developer uses to push their own build (e.g. Magnify) into DEX to
 * test the store, WITHOUT relaxing the gate. The main-process orchestration
 * (AppStoreService.installLocalEnvelope) composes this with the real validation
 * gate, then lays the files down and registers the install.
 *
 * Everything here is deterministic and side-effect-free so the security-
 * critical bits (untrusted file-path containment, gate-pass decision) are fully
 * unit-testable without Electron.
 */

import type { ValidationStatus } from './validationGate';

export type AppRuntime = 'web' | 'native';

/** A single file to lay down, relative to the app's install dir. */
export interface UnpackEntry {
  relPath: string;
  base64: string;
}

export type UnpackPlan =
  | { ok: true; entries: UnpackEntry[] }
  | { ok: false; reason: string };

/**
 * Reject any path that could escape the app's install directory. The envelope's
 * file keys are attacker-controlled, so this is the load-bearing containment
 * check before we ever touch the disk. Forward-slash relative paths only.
 */
export function isSafeRelPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.includes('\0')) return false;          // null byte
  if (p.includes('\\')) return false;          // backslash -> force forward slashes
  if (p.startsWith('/')) return false;         // absolute (posix)
  if (/^[a-zA-Z]:/.test(p)) return false;      // windows drive letter
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return false; // empty/cur/parent
  }
  return true;
}

/** Turn an envelope's { path -> base64 } map into a safe, ordered write plan. */
export function planUnpack(files: Record<string, string>): UnpackPlan {
  if (!files || typeof files !== 'object') return { ok: false, reason: 'no files in envelope' };
  const keys = Object.keys(files);
  if (keys.length === 0) return { ok: false, reason: 'envelope has no files' };
  const entries: UnpackEntry[] = [];
  for (const relPath of keys.sort()) {
    if (!isSafeRelPath(relPath)) return { ok: false, reason: `unsafe file path: ${relPath}` };
    const base64 = files[relPath];
    if (typeof base64 !== 'string') return { ok: false, reason: `non-string file content: ${relPath}` };
    entries.push({ relPath, base64 });
  }
  return { ok: true, entries };
}

/**
 * Decide how an installed app should run. Honours an explicit manifest
 * `runtime`/`entry`, else infers: an index.html (or any .html entry) means a
 * web app that runs inside DEX's webview; otherwise it is treated as a native
 * binary that DEX launches as a separate process. Deterministic.
 */
export function detectRuntime(
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): { runtime: AppRuntime; entry?: string } {
  const declaredRuntime = manifest?.runtime;
  const declaredEntry = typeof manifest?.entry === 'string' ? (manifest.entry as string)
    : typeof manifest?.main === 'string' ? (manifest.main as string)
      : undefined;

  if (declaredRuntime === 'web' || declaredRuntime === 'native') {
    return { runtime: declaredRuntime, entry: declaredEntry ?? defaultEntryFor(declaredRuntime, files) };
  }

  // Infer from the declared entry's extension first.
  if (declaredEntry) {
    return { runtime: /\.html?$/i.test(declaredEntry) ? 'web' : 'native', entry: declaredEntry };
  }

  // Infer from the file set: any index.html at root or one level deep => web.
  const html = fileKeys(files).find((k) => /(^|\/)index\.html?$/i.test(k));
  if (html) return { runtime: 'web', entry: html };

  // Nothing web-shaped: treat as a native binary launch.
  return { runtime: 'native', entry: undefined };
}

function defaultEntryFor(runtime: AppRuntime, files: Record<string, string>): string | undefined {
  if (runtime !== 'web') return undefined;
  return fileKeys(files).find((k) => /(^|\/)index\.html?$/i.test(k));
}

function fileKeys(files: Record<string, string>): string[] {
  return files && typeof files === 'object' ? Object.keys(files) : [];
}

/**
 * Full production gate: a local install is allowed ONLY when the validation
 * report is fully approved (signature trusted + publisher known + all block
 * checks pass). `pending` (warn-only) and `rejected` are both refused so the
 * local path is exactly as strict as publishing.
 */
export function canLocallyInstall(report: { status: ValidationStatus }): boolean {
  return report.status === 'approved';
}

/** Human-readable refusal headline for a non-approved report. */
export function refusalHeadline(status: ValidationStatus): string {
  return status === 'rejected'
    ? 'Rejected by the validation gate'
    : status === 'pending'
      ? 'Held: passes safety checks but is missing required store metadata'
      : 'Not approved';
}
