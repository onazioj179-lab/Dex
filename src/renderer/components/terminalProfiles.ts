// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Terminal profiles (pure): which shell and folder each pane starts in, the
 * default shell for new tabs, the text size, and requests from other apps to
 * open a terminal in a folder.
 *
 * A pane's shell and folder are fixed when the pane is created. Changing the
 * default shell later only affects new tabs; a running session is never
 * restarted behind the user's back.
 */

export interface ShellInfo {
  id: string;
  label: string;
  /** Absolute path, accepted as-is by `pty:spawn`. */
  path: string;
  /** The shell DEX starts when none is chosen. */
  default?: boolean;
}

export interface PaneProfile {
  shell?: string;
  cwd?: string;
}

export interface TermSettings {
  fontSize: number;
  /** Path of the shell for new tabs; null = the system default. */
  defaultShell: string | null;
}

export const SETTINGS_KEY = 'dex.terminal.settings.v1';
export const PANE_PROFILES_KEY = 'dex.terminal.paneProfiles.v1';

export const FONT_MIN = 9;
export const FONT_MAX = 24;
export const FONT_DEFAULT = 13;

export function clampFontSize(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : FONT_DEFAULT;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, v));
}

export function defaultSettings(): TermSettings {
  return { fontSize: FONT_DEFAULT, defaultShell: null };
}

export function parseSettings(raw: string | null): TermSettings {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<TermSettings>) : null;
    if (!o || typeof o !== 'object') return defaultSettings();
    return {
      fontSize: clampFontSize(o.fontSize),
      defaultShell: typeof o.defaultShell === 'string' && o.defaultShell ? o.defaultShell : null,
    };
  } catch {
    return defaultSettings();
  }
}

/** Read stored pane profiles, keeping only panes that still exist. */
export function parsePaneProfiles(raw: string | null, livePanes: readonly string[]): Record<string, PaneProfile> {
  const out: Record<string, PaneProfile> = {};
  try {
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!o || typeof o !== 'object') return out;
    for (const id of livePanes) {
      const p = o[id] as PaneProfile | undefined;
      if (!p || typeof p !== 'object') continue;
      const shell = typeof p.shell === 'string' && p.shell ? p.shell : undefined;
      const cwd = typeof p.cwd === 'string' && p.cwd ? p.cwd : undefined;
      if (shell || cwd) out[id] = { shell, cwd };
    }
  } catch { /* unreadable: start clean */ }
  return out;
}

/** Drop profiles of panes that no longer exist. Returns the same object when nothing changed. */
export function prunePaneProfiles(profiles: Record<string, PaneProfile>, livePanes: readonly string[]): Record<string, PaneProfile> {
  const live = new Set(livePanes);
  const keys = Object.keys(profiles);
  if (keys.every((k) => live.has(k))) return profiles;
  const out: Record<string, PaneProfile> = {};
  for (const k of keys) if (live.has(k)) out[k] = profiles[k];
  return out;
}

/**
 * The shell a new tab should start: the saved default when it is still
 * installed, otherwise undefined (the native side picks). A default that was
 * uninstalled is ignored instead of failing every new tab.
 */
export function shellForNewTab(settings: TermSettings, shells: readonly ShellInfo[]): string | undefined {
  if (!settings.defaultShell) return undefined;
  const wanted = settings.defaultShell.toLowerCase();
  return shells.find((s) => s.path.toLowerCase() === wanted)?.path;
}

/** Short name for a shell path, for labels ("pwsh", "bash"). */
export function shellBaseName(path: string | undefined): string {
  if (!path) return '';
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.exe$/i, '');
}

/** Last folder name of a path, for a tab title. */
export function folderLabel(cwd: string): string {
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || cwd;
}

// ---------------------------------------------------------------------------
// "Open in Terminal" requests from other apps (Files, DexCode).
// The Terminal app may not be mounted yet when the request is made, so
// requests wait in a queue and the Terminal drains it on mount and on the event.
// ---------------------------------------------------------------------------
export const OPEN_EVENT = 'dex-terminal-open';
const pending: string[] = [];

/** Ask the Terminal app to open a new tab in `cwd`. The caller opens the app. */
export function requestTerminalAt(cwd: string): void {
  const dir = cwd.trim();
  if (!dir) return;
  pending.push(dir);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Take every waiting request (each is handled once). */
export function takeTerminalRequests(): string[] {
  return pending.splice(0, pending.length);
}
