// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX command catalog -- the ONE canonical source of truth for "things DEX can
// do", shared by every surface that should expose them: the command palette,
// the keyboard layer, the in-app terminal (`dex <cmd>`), and UKI (the assistant).
//
// Design:
//   - App-launch commands DERIVE from APP_DEFINITIONS (passed in by the caller),
//     so the app list is never duplicated -- there is one source for apps.
//   - System / window / navigation commands are authored ONCE here.
//   - Every command is CROSS-PLATFORM: shortcuts carry both a Windows/Linux and
//     a macOS form; `resolveShortcut` picks the right one at display time.
//   - Maps only to DEX INNER APPS (no Apple/OS apps).
//   - Only the ERGONOMIC subset of the 1000 possible key-combos is assigned;
//     everything else stays unbound (see docs/SHORTCUTS.md for the triage).
//
// This module is pure (no DOM / React / IPC) so main, renderer, and tests can
// all consume it. It plugs into the existing `commands/registry.ts` via
// `toCommandRegistry` -- it does NOT introduce a parallel registry type.

import type { CommandRegistry, PaletteCommand } from './registry';

/** A keybinding in both desktop families. Either side may be omitted. */
export interface DexShortcut {
  /** Windows / Linux form, e.g. "Ctrl+1", "Ctrl+Shift+P". */
  win?: string;
  /** macOS form, e.g. "Cmd+1", "Cmd+Shift+P". */
  mac?: string;
}

/** Group buckets for sectioned palettes / help. */
export type DexCommandGroup =
  | 'Apps' | 'Creative' | 'System' | 'Window' | 'Navigation';

export interface DexCommand {
  /** Canonical id, namespaced: `app.notes`, `window.tileLeft`, `system.spotlight`. */
  id: string;
  /** Human label, e.g. "Open Notes". */
  label: string;
  group: DexCommandGroup;
  keywords?: string[];
  /** When set, the command launches this DEX inner app. */
  appId?: string;
  /**
   * When set (and no appId), the command performs a shell/window action. The
   * value is a stable action id a surface knows how to run (e.g. via a window
   * CustomEvent). Surfaces that can't run it should say so rather than fail.
   */
  action?: string;
  /** Cross-platform keybinding. */
  shortcut?: DexShortcut;
  /** Primary terminal alias -- invoked as `dex <terminal>`. */
  terminal: string;
  /** Natural-language phrases UKI matches against. */
  uki?: string[];
}

// ---------------------------------------------------------------------------
// Cross-platform shortcut helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a single platform-stamped shortcut string (as APP_DEFINITIONS
 * stores it for the CURRENT platform) into both desktop forms. e.g.
 *   "Ctrl+1"      -> { win: "Ctrl+1", mac: "Cmd+1" }
 *   "Cmd+Shift+P" -> { win: "Ctrl+Shift+P", mac: "Cmd+Shift+P" }
 *   "Alt+C"       -> { win: "Alt+C", mac: "Option+C" }
 */
export function crossPlatform(shortcut: string | undefined): DexShortcut | undefined {
  if (!shortcut) return undefined;
  const win = shortcut
    .replace(/\bCmd\b/g, 'Ctrl')
    .replace(/\bOption\b/g, 'Alt');
  const mac = shortcut
    .replace(/\bCtrl\b/g, 'Cmd')
    .replace(/\bAlt\b/g, 'Option');
  return { win, mac };
}

/** Pick the right shortcut string for the platform; '' when unbound. */
export function resolveShortcut(cmd: DexCommand, isMac: boolean): string {
  if (!cmd.shortcut) return '';
  return (isMac ? cmd.shortcut.mac : cmd.shortcut.win) ?? '';
}

// ---------------------------------------------------------------------------
// System / window / navigation commands (authored once)
// ---------------------------------------------------------------------------

export const CORE_DEX_COMMANDS: DexCommand[] = [
  // -- System -------------------------------------------------------------
  { id: 'system.spotlight', label: 'Search (Spotlight)', group: 'System',
    action: 'spotlight', shortcut: crossPlatform('Ctrl+K'), terminal: 'search',
    keywords: ['find', 'spotlight', 'open'], uki: ['search', 'find', 'open spotlight'] },
  { id: 'system.commandPalette', label: 'Command Palette', group: 'System',
    action: 'commandPalette', shortcut: crossPlatform('Ctrl+Shift+P'), terminal: 'commands',
    keywords: ['command', 'palette'], uki: ['command palette', 'show commands', 'run a command'] },
  { id: 'system.uki', label: 'Toggle UKI Assistant', group: 'System',
    action: 'uki', shortcut: crossPlatform('Ctrl+Shift+U'), terminal: 'uki',
    keywords: ['assistant', 'ai', 'copilot'], uki: ['open assistant', 'toggle uki', 'ask uki'] },
  { id: 'system.compact', label: 'Compact (Mini) Mode', group: 'System',
    action: 'compact', shortcut: crossPlatform('Ctrl+Shift+M'), terminal: 'compact',
    keywords: ['mini', 'pip', 'small'], uki: ['compact mode', 'mini window', 'shrink dex'] },
  { id: 'system.lock', label: 'Lock DEX', group: 'System',
    action: 'lock', shortcut: crossPlatform('Ctrl+Shift+L'), terminal: 'lock',
    keywords: ['lock', 'secure'], uki: ['lock', 'lock the screen'] },
  // -- Window -------------------------------------------------------------
  { id: 'window.close', label: 'Close Current App', group: 'Window',
    action: 'closeApp', shortcut: crossPlatform('Ctrl+W'), terminal: 'close',
    keywords: ['quit', 'close'], uki: ['close app', 'close this'] },
  { id: 'window.maximize', label: 'Maximize Window', group: 'Window',
    action: 'maximize', shortcut: crossPlatform('Ctrl+Up'), terminal: 'maximize',
    keywords: ['fullscreen', 'max'], uki: ['maximize', 'full screen'] },
  { id: 'window.tileLeft', label: 'Tile Window Left', group: 'Window',
    action: 'tileLeft', shortcut: crossPlatform('Ctrl+Alt+Left'), terminal: 'left',
    keywords: ['snap', 'tile', 'left'], uki: ['snap left', 'tile left'] },
  { id: 'window.tileRight', label: 'Tile Window Right', group: 'Window',
    action: 'tileRight', shortcut: crossPlatform('Ctrl+Alt+Right'), terminal: 'right',
    keywords: ['snap', 'tile', 'right'], uki: ['snap right', 'tile right'] },
  { id: 'window.split', label: 'Split Screen', group: 'Window',
    action: 'splitScreen', shortcut: crossPlatform('Ctrl+Shift+S'), terminal: 'split',
    keywords: ['split', 'columns'], uki: ['split screen', 'side by side'] },
  { id: 'window.arrangeAll', label: 'Arrange All Windows', group: 'Window',
    action: 'arrangeWindows', shortcut: crossPlatform('Ctrl+Shift+Z'), terminal: 'arrange',
    keywords: ['arrange', 'tidy', 'grid'], uki: ['arrange windows', 'tidy windows'] },
  // -- Navigation ---------------------------------------------------------
  { id: 'nav.back', label: 'Navigate Back', group: 'Navigation',
    action: 'navBack', shortcut: crossPlatform('Ctrl+Left'), terminal: 'back',
    keywords: ['back', 'previous'], uki: ['go back'] },
  { id: 'nav.forward', label: 'Navigate Forward', group: 'Navigation',
    action: 'navForward', shortcut: crossPlatform('Ctrl+Right'), terminal: 'forward',
    keywords: ['forward', 'next'], uki: ['go forward'] },
];

// ---------------------------------------------------------------------------
// App-launch commands (derived from APP_DEFINITIONS, never duplicated)
// ---------------------------------------------------------------------------

/** The subset of APP_DEFINITIONS fields this catalog needs. */
export interface AppDefLike {
  name: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  description?: string;
}

/** Stable, intuitive terminal alias for an app (lowercased name, no spaces). */
export function appTerminalAlias(appId: string, def: AppDefLike): string {
  const fromName = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return fromName || appId;
}

/** Build the app-launch commands from a map of app definitions. */
export function appCommandsFrom(appDefs: Record<string, AppDefLike>): DexCommand[] {
  const out: DexCommand[] = [];
  for (const [appId, def] of Object.entries(appDefs)) {
    const creative = def.category === 'creative';
    out.push({
      id: `app.${appId}`,
      label: `Open ${def.name}`,
      group: creative ? 'Creative' : 'Apps',
      appId,
      shortcut: crossPlatform(def.shortcut),
      terminal: appTerminalAlias(appId, def),
      keywords: [def.name, appId, def.category || '', ...(def.description ? [def.description] : [])],
      uki: [`open ${def.name}`, `launch ${def.name}`, `go to ${def.name}`],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Catalog assembly + lookups
// ---------------------------------------------------------------------------

/**
 * The full DEX command catalog: core (system/window/nav) + app launches.
 * De-duplicated by `id` (core wins on collision). Pass APP_DEFINITIONS in.
 */
export function buildDexCommands(appDefs: Record<string, AppDefLike>): DexCommand[] {
  const seen = new Set<string>();
  const out: DexCommand[] = [];
  for (const cmd of [...CORE_DEX_COMMANDS, ...appCommandsFrom(appDefs)]) {
    if (seen.has(cmd.id)) continue;
    seen.add(cmd.id);
    out.push(cmd);
  }
  return out;
}

/** Adapter to the existing palette registry -- no parallel registry type. */
export function toCommandRegistry(cmds: DexCommand[]): CommandRegistry {
  const commands: PaletteCommand[] = cmds.map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group,
    keywords: c.keywords,
  }));
  return { commands };
}

/**
 * Resolve a terminal line ("dex notes", "notes", "dex left", "search") to a
 * command + its trailing args. Matches the `terminal` alias OR the appId OR the
 * bare command id tail. Returns null when nothing matches.
 */
export function matchTerminalCommand(
  cmds: DexCommand[],
  line: string,
): { command: DexCommand; args: string[] } | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  // Allow an optional leading "dex" prefix.
  if (tokens[0].toLowerCase() === 'dex') tokens.shift();
  if (tokens.length === 0) return null;
  const key = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  for (const c of cmds) {
    if (
      c.terminal.toLowerCase() === key ||
      c.appId?.toLowerCase() === key ||
      c.id.toLowerCase() === key ||
      c.id.toLowerCase().split('.').pop() === key
    ) {
      return { command: c, args };
    }
  }
  return null;
}

/** Best natural-language match for UKI, or null. Cheap substring/keyword scan. */
export function findByUtterance(cmds: DexCommand[], text: string): DexCommand | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  let best: DexCommand | null = null;
  let bestScore = 0;
  for (const c of cmds) {
    let score = 0;
    for (const phrase of c.uki ?? []) {
      if (t === phrase) score = Math.max(score, 100);
      else if (t.includes(phrase)) score = Math.max(score, 60 + phrase.length);
    }
    if (c.label.toLowerCase() === t) score = Math.max(score, 90);
    for (const kw of c.keywords ?? []) {
      if (kw && t.includes(kw.toLowerCase())) score = Math.max(score, 30 + kw.length);
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore > 0 ? best : null;
}
