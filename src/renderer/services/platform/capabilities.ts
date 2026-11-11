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
  'connection', 'networkHygiene', 'app', 'data', 'dialog',
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
  'backup', 'uki-chat',
  // Dev-platform subsystems (Tier 5), ported to dex_ipc (git.rs / env_manager.rs /
  // ssh.rs). system:killProcessTree rides under the already-native 'system'.
  'git', 'env', 'ssh', 'fs', 'projects', 'watch',
  // Analytics (pure-data, JSON-backed; port of AnalyticsManager.ts in analytics.rs).
  'analytics',
  // DEX Ledger (core/dex-ledger over its own ledger.db; ledger_ctl.rs).
  'ledger',
  // Browser downloads (download_ctl.rs).
  'download',
  // Focus/automation Modes (KV-backed CRUD + active-state; modes_dispatch in main.rs).
  'mode',
  // Workflow-ported clean subsystems (2026-06-19): KV/JSON CRUD + live-metric reads.
  // Heavy channels within these namespaces degrade to null (documented per module).
  'activity', 'duplicates', 'focus', 'memory', 'operations', 'perf', 'reader',
  'resource', 'rule', 'sessions', 'split', 'splitview', 'stability', 'startup',
  'systemHealth', 'tags', 'user', 'voiceNotes', 'logs', 'patterns', 'permissions',
  'notes',
  'accessibility', 'adaptive', 'advisory', 'api', 'archive', 'autofill', 'background-tasks', 'batch', 'battery', 'behavior', 'browser', 'budget', 'cli', 'cloudsync', 'code', 'connectors', 'containment', 'context', 'contract', 'controls', 'corepc', 'crash-reporter', 'creator', 'db-perf', 'deeplink', 'device', 'devplatform', 'documents', 'dtp', 'editor', 'embedding', 'encryption', 'enforce', 'engine', 'export', 'extensions', 'failure', 'features', 'folderrules', 'gallery', 'games', 'governance', 'gpu', 'guardrails', 'hardware', 'healing', 'history', 'hotkeys', 'http-transfer', 'idle', 'import', 'input', 'intelligence', 'ipc-perf', 'keys', 'largefile', 'launcher', 'learning', 'longevity', 'maintenance', 'mediaorg', 'mental', 'monitor', 'motion', 'multiuser', 'network', 'nextgen', 'nexus', 'observability', 'optimistic', 'performance', 'permission', 'phase1', 'pipeline', 'plugin-gate', 'plugins', 'prerender', 'privacy', 'pty', 'quickactions', 'recovery', 'reliability', 'render', 'renderer-health', 'resource-governor', 'scheduler', 'scripting', 'security', 'selftest', 'session', 'shutdown-sequencer', 'snapshot', 'softero', 'startup-sequencer', 'state', 'state-sync', 'store', 'sync', 'tagging', 'task-queue', 'tasks', 'thermal', 'timeline', 'transfer', 'trust', 'uki', 'undo', 'uninstall', 'update', 'update-service', 'updates', 'video', 'vinx', 'visual', 'voice', 'wake', 'watchdog', 'workflow', 'xenon',
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
