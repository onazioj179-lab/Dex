// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Opt-in selective cloud backup policy
 * -----------------------------------------------------------------------------
 * The user explicitly chooses what gets backed up. Nothing leaves the device
 * unless the user ticks a category. Defaults are conservative (settings +
 * snippets only). Every category lists what it includes in plain English so
 * the consent screen has no surprises.
 *
 * Pure model. The cloud uploader reads `selectBackupItems()` to decide which
 * local artifacts to package, and respects `requireWifi`, `pauseOnMetered`,
 * `nightOnly`, and the per-category opt-in.
 */

// DEX v3.8.8 - opt-in selective backup

export type BackupCategory =
  | 'settings'
  | 'snippets'
  | 'notes'
  | 'plans'
  | 'nexus-graph'
  | 'media'
  | 'workspaces'
  | 'history';

export interface BackupCategoryInfo {
  id: BackupCategory;
  label: string;
  description: string;
  /** Approx bytes per typical install -- shown to set expectations. */
  typicalBytes: number;
  /** Whether this category is opted-in by default. */
  defaultOn: boolean;
}

export const BACKUP_CATEGORIES: readonly BackupCategoryInfo[] = [
  { id: 'settings',    label: 'Settings & preferences', description: 'Themes, hotkeys, layout, plugin choices.', typicalBytes: 64 * 1024, defaultOn: true },
  { id: 'snippets',    label: 'Snippets',               description: 'Saved commands and clipboard items you starred.', typicalBytes: 256 * 1024, defaultOn: true },
  { id: 'notes',       label: 'Notes',                  description: 'Notes you wrote inside DEX.', typicalBytes: 4 * 1024 * 1024, defaultOn: false },
  { id: 'plans',       label: 'Saved plans',            description: 'Approved UKI plans you keep for reuse.', typicalBytes: 128 * 1024, defaultOn: false },
  { id: 'nexus-graph', label: 'Nexus knowledge graph',  description: 'Embeddings and links between your items.', typicalBytes: 64 * 1024 * 1024, defaultOn: false },
  { id: 'media',       label: 'Screenshots & recordings', description: 'Captured images and clips.', typicalBytes: 512 * 1024 * 1024, defaultOn: false },
  { id: 'workspaces',  label: 'Workspaces',             description: 'Saved window layouts and pinned apps.', typicalBytes: 128 * 1024, defaultOn: false },
  { id: 'history',     label: 'Command history',        description: 'Recent commands you ran. Sensitive -- off by default.', typicalBytes: 1 * 1024 * 1024, defaultOn: false },
];

export interface BackupPolicy {
  /** Master switch. If false, nothing is uploaded ever. */
  enabled: boolean;
  /** Per-category opt-in. Missing keys default to false. */
  categories: Partial<Record<BackupCategory, boolean>>;
  /** Only upload when on Wi-Fi (not on metered/cellular). */
  requireWifi: boolean;
  /** Pause uploads when the OS reports the connection as metered. */
  pauseOnMetered: boolean;
  /** Only run between 23:00 and 06:00 local time (cuts daytime bandwidth). */
  nightOnly: boolean;
  /** End-to-end encryption with user passphrase. Off = encrypted with cloud key only. */
  e2eePassphraseSet: boolean;
}

export function defaultBackupPolicy(): BackupPolicy {
  const categories: Partial<Record<BackupCategory, boolean>> = {};
  for (const c of BACKUP_CATEGORIES) categories[c.id] = c.defaultOn;
  return {
    enabled: false,                  // master switch off until user turns it on
    categories,
    requireWifi: true,
    pauseOnMetered: true,
    nightOnly: false,
    e2eePassphraseSet: false,
  };
}

export interface NetworkState {
  online: boolean;
  isWifi: boolean;
  isMetered: boolean;
  /** Local hour 0..23 for nightOnly check. */
  hourLocal: number;
}

export interface BackupRunDecision {
  shouldRun: boolean;
  reason?: 'disabled' | 'offline' | 'no-wifi' | 'metered' | 'daytime' | 'no-categories';
}

export function shouldRunBackup(policy: BackupPolicy, net: NetworkState): BackupRunDecision {
  if (!policy.enabled) return { shouldRun: false, reason: 'disabled' };
  if (!net.online) return { shouldRun: false, reason: 'offline' };
  if (policy.requireWifi && !net.isWifi) return { shouldRun: false, reason: 'no-wifi' };
  if (policy.pauseOnMetered && net.isMetered) return { shouldRun: false, reason: 'metered' };
  if (policy.nightOnly && (net.hourLocal >= 6 && net.hourLocal < 23)) {
    return { shouldRun: false, reason: 'daytime' };
  }
  const anyOn = BACKUP_CATEGORIES.some((c) => policy.categories[c.id]);
  if (!anyOn) return { shouldRun: false, reason: 'no-categories' };
  return { shouldRun: true };
}

export function selectBackupItems(policy: BackupPolicy): BackupCategory[] {
  return BACKUP_CATEGORIES
    .filter((c) => policy.categories[c.id] === true)
    .map((c) => c.id);
}

export function estimateBackupSize(policy: BackupPolicy): number {
  return selectBackupItems(policy).reduce(
    (sum, id) => sum + (BACKUP_CATEGORIES.find((c) => c.id === id)?.typicalBytes ?? 0),
    0,
  );
}
