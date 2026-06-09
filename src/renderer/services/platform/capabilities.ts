// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-shell capability detection — the "blend" layer.
 *
 * DEX runs the SAME renderer under two shells: Electron (full ~2,400-handler
 * backend via the real preload) and Tauri (native `dex_ipc` for the ported
 * subsystems + graceful degrade). This module lets feature code ask "is this
 * backend available in the shell I'm running in?" so the UI is operable
 * everywhere — full under Electron, native-where-ported under Tauri, and
 * localStorage-only on the web/preview.
 */

import { detectShell, type ShellKind } from './index';

/**
 * IPC namespaces with a real native `dex_ipc` handler under Tauri. Keep in sync
 * with `src-tauri/src/main.rs` as subsystems are ported. (Everything not listed
 * still *works* under Tauri — it just degrades to `null`/empty rather than a
 * native implementation.)
 */
export const TAURI_NATIVE_SUBSYSTEMS: readonly string[] = [
  'window', 'files', 'fileSearch', 'search', 'fileIntel',
  'system', 'power', 'os', 'shell', 'media', 'audio',
  'clipboard', 'vault', 'capability', 'storage', 'automation',
  'health', 'diagnostics', 'crashReporter',
  'connection', 'networkHygiene', 'app', 'data',
  // Notification center + SQLite-backed subsystems (shared dex.db), routed
  // natively through dex_ipc -> db_dispatch in src-tauri/src/main.rs.
  'notifications',
  'activity-feed', 'changelog', 'color-labels', 'dashboard', 'goal-system',
  'help', 'journal', 'layout', 'licensing', 'read-later', 'recycle-bin',
  'time-tracking', 'word-count',
  'content-expiry', 'daily-note', 'feedback', 'relationship-graph', 'reminder',
  'scratchpad', 'search-history', 'smart-grouping', 'smart-rename',
  'snapshot-comparison', 'stats-dashboard', 'version-history',
  'bulk-metadata', 'daily-briefing', 'dependencies', 'duplication-detector',
  'project-archiver', 'project-comparison', 'export-bundle', 'project-health',
  'project-linker', 'project-lock', 'project-timeline', 'voice-memo',
  'dexnotes', 'nl-task', 'theme-schedule', 'session-replay', 'media-library',
  'vinx-presentation', 'i18n', 'keyboard-nav',
  'notification-center', 'localization', 'global-search', 'fts', 'multiwindow',
  'multimonitor', 'migration', 'link-preview', 'live-collab', 'file-watcher',
  'backup',
];

const TAURI_SET = new Set(TAURI_NATIVE_SUBSYSTEMS);

export interface Capabilities {
  /** Which desktop shell is hosting the renderer. */
  shell: ShellKind;
  /** True under Electron — the entire backend is available. */
  full: boolean;
  /** Native subsystems available in this shell (`['*']` under Electron). */
  nativeSubsystems: string[];
  /** Is a given `window.dex.<namespace>` backed by a real native handler here? */
  has: (namespace: string) => boolean;
}

/** Report what the current shell can do. Cheap; call it wherever you branch. */
export function getCapabilities(): Capabilities {
  const shell = detectShell();
  if (shell === 'electron') {
    return { shell, full: true, nativeSubsystems: ['*'], has: () => true };
  }
  if (shell === 'tauri') {
    return {
      shell,
      full: false,
      nativeSubsystems: [...TAURI_NATIVE_SUBSYSTEMS],
      has: (ns) => TAURI_SET.has(ns),
    };
  }
  // web / headless preview: only localStorage-backed features work.
  return { shell, full: false, nativeSubsystems: [], has: () => false };
}

/** Convenience: is `namespace` natively backed in the current shell? */
export function hasNative(namespace: string): boolean {
  return getCapabilities().has(namespace);
}
