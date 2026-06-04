// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Keyboard-shortcut conflict detection (SHL-092). Apps register shortcuts
 * independently and the central manager's conflict capability is unused, so two
 * actions can silently claim the same chord. This pure helper normalizes chords
 * and reports collisions *within the same scope* (global chords also collide
 * with everything). UI/registration layers consume the report.
 *
 * Pure: no DOM, no state.
 */

export interface ShortcutBinding {
  id: string;
  /** Human chord, any order/casing: "Ctrl+Shift+Z", "cmd k", "Meta+ Z". */
  keys: string;
  /** Scope the chord is active in. 'global' collides with every scope. */
  scope?: string;
  label?: string;
}

export interface ShortcutConflict {
  /** Canonical chord the bindings collide on. */
  chord: string;
  scope: string;
  bindings: ShortcutBinding[];
}

const MOD_ALIASES: Record<string, string> = {
  cmd: 'meta', command: 'meta', win: 'meta', super: 'meta', meta: 'meta',
  control: 'ctrl', ctrl: 'ctrl',
  option: 'alt', opt: 'alt', alt: 'alt',
  shift: 'shift',
};

const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta'];

/**
 * Canonicalize a chord so "Shift+Ctrl+Z", "ctrl shift z", and "CTRL+SHIFT+Z"
 * all compare equal: lowercased, split on +/whitespace, modifiers sorted into a
 * fixed order, single main key last.
 */
export function canonicalizeChord(keys: string): string {
  const parts = keys
    .toLowerCase()
    .split(/[+\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const mods = new Set<string>();
  const main: string[] = [];
  for (const p of parts) {
    const alias = MOD_ALIASES[p];
    if (alias) mods.add(alias);
    else main.push(p);
  }

  const orderedMods = MOD_ORDER.filter((m) => mods.has(m));
  return [...orderedMods, ...main.sort()].join('+');
}

/**
 * Find conflicts: bindings that share a canonical chord in the same scope.
 * A binding in scope 'global' conflicts with any binding using the same chord
 * in any scope.
 */
export function findShortcutConflicts(bindings: readonly ShortcutBinding[]): ShortcutConflict[] {
  // chord -> scope -> bindings
  const byChord = new Map<string, Map<string, ShortcutBinding[]>>();
  for (const b of bindings) {
    const chord = canonicalizeChord(b.keys);
    if (!chord) continue;
    const scope = b.scope ?? 'global';
    let scopes = byChord.get(chord);
    if (!scopes) { scopes = new Map(); byChord.set(chord, scopes); }
    const list = scopes.get(scope) ?? [];
    list.push(b);
    scopes.set(scope, list);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [chord, scopes] of byChord) {
    const globals = scopes.get('global') ?? [];
    for (const [scope, list] of scopes) {
      // Within-scope collision (≥2 bindings on the chord).
      const merged = scope === 'global' ? list : [...globals, ...list];
      if (merged.length >= 2) {
        // Avoid double-reporting the pure-global bucket against itself twice.
        if (scope === 'global' && globals.length < 2) continue;
        conflicts.push({ chord, scope, bindings: merged });
      }
    }
    // Pure-global collisions (global chord used by ≥2 global bindings).
    if (globals.length >= 2 && !conflicts.some((c) => c.chord === chord && c.scope === 'global')) {
      conflicts.push({ chord, scope: 'global', bindings: globals });
    }
  }
  return conflicts;
}

/** True when the set of bindings has at least one conflict. */
export function hasShortcutConflicts(bindings: readonly ShortcutBinding[]): boolean {
  return findShortcutConflicts(bindings).length > 0;
}
