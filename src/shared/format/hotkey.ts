// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hotkey display formatting (Settings shortcut editor, menus, tooltips, the UKI
 * shortcut cheat-sheet). Turns a chord string into a platform-appropriate label
 * — macOS symbols (⌘⌥⌃⇧) or Windows/Linux words (Ctrl+Alt+Shift). Pairs with
 * `shortcutConflicts.canonicalizeChord`. Pure: no DOM, no IO.
 */

const MOD_ALIASES: Record<string, string> = {
  cmd: 'meta', command: 'meta', win: 'meta', super: 'meta', meta: 'meta',
  control: 'ctrl', ctrl: 'ctrl', option: 'alt', opt: 'alt', alt: 'alt', shift: 'shift',
};

const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta'];

const MAC_SYMBOLS: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };
const WIN_WORDS: Record<string, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };

const KEY_LABELS: Record<string, string> = {
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  enter: '↵', escape: 'Esc', esc: 'Esc', ' ': 'Space', space: 'Space',
  backspace: '⌫', delete: 'Del', tab: '⇥',
};

function labelKey(key: string): string {
  const k = key.toLowerCase();
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

/** Format a chord ("ctrl+shift+k") for the platform. macOS omits the joiner. */
export function formatHotkey(chord: string, isMac = false): string {
  const parts = chord.toLowerCase().split(/[+\s]+/).map((p) => p.trim()).filter(Boolean);
  const mods = new Set<string>();
  const keys: string[] = [];
  for (const p of parts) {
    const alias = MOD_ALIASES[p];
    if (alias) mods.add(alias);
    else keys.push(p);
  }

  const orderedMods = MOD_ORDER.filter((m) => mods.has(m));
  if (isMac) {
    const m = orderedMods.map((mod) => MAC_SYMBOLS[mod]).join('');
    const k = keys.map(labelKey).join('');
    return m + k;
  }
  return [...orderedMods.map((mod) => WIN_WORDS[mod]), ...keys.map(labelKey)].join('+');
}
