// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * File version history. Keep last N versions per file.
 */

// DEX v3.8.9 - versioning

export interface FileVersion {
  versionId: string;
  parentVersionId?: string;
  bytes: number;
  contentId: string;        // SHA-256
  createdAt: number;
  authorId?: string;
  comment?: string;
}

export interface VersionedFile {
  fileId: string;
  versions: FileVersion[];      // newest last
  keep: number;                 // retention count
}

export const DEFAULT_KEEP = 20;

export function createVersionedFile(fileId: string, keep: number = DEFAULT_KEEP): VersionedFile {
  return { fileId, versions: [], keep };
}

export function pushVersion(f: VersionedFile, v: Omit<FileVersion, 'createdAt'> & { createdAt?: number }): VersionedFile {
  const created = v.createdAt ?? Date.now();
  const next = [...f.versions, { ...v, createdAt: created } as FileVersion];
  // Trim to retention count, but always keep at least one version.
  while (next.length > f.keep && next.length > 1) next.shift();
  return { ...f, versions: next };
}

export function currentVersion(f: VersionedFile): FileVersion | undefined {
  return f.versions[f.versions.length - 1];
}

export function rollback(f: VersionedFile, versionId: string, now: number = Date.now()): VersionedFile {
  const target = f.versions.find((v) => v.versionId === versionId);
  if (!target) return f;
  // Rollback creates a NEW version that points back to the target, preserving history.
  return pushVersion(f, {
    versionId: `rb-${now.toString(36)}`,
    parentVersionId: target.versionId,
    bytes: target.bytes,
    contentId: target.contentId,
    comment: `rollback to ${versionId}`,
    createdAt: now,
  });
}

export function totalBytesInHistory(f: VersionedFile): number {
  return f.versions.reduce((s, v) => s + v.bytes, 0);
}
