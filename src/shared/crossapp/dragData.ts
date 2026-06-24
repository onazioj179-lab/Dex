// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-app drag-and-drop data model (DEX_FEATURE_BACKLOG 09).
 *
 * Mirrors the WHATWG HTML Drag-and-Drop `DataTransfer` contract so inner apps can
 * drag typed payloads between each other through one shell-mediated channel:
 * a MIME-keyed drag data store (ordered `types`, get/set/clear by type) plus the
 * `effectAllowed` ⇄ `dropEffect` negotiation that decides whether a drop copies,
 * moves, or links. Pure: no DOM — the shell's drag layer wires real pointer events
 * to this, which keeps the (otherwise fiddly) effect-negotiation rules testable.
 */

/** Source-declared set of permitted operations (HTML `effectAllowed`). */
export type EffectAllowed =
  | 'none' | 'copy' | 'copyLink' | 'copyMove'
  | 'link' | 'linkMove' | 'move' | 'all' | 'uninitialized';

/** The single operation a drop performs (HTML `dropEffect`). */
export type DropEffect = 'none' | 'copy' | 'link' | 'move';

/** Which concrete dropEffects each effectAllowed value permits. */
const ALLOWED: Record<EffectAllowed, ReadonlyArray<DropEffect>> = {
  none: [],
  copy: ['copy'],
  link: ['link'],
  move: ['move'],
  copyLink: ['copy', 'link'],
  copyMove: ['copy', 'move'],
  linkMove: ['link', 'move'],
  all: ['copy', 'link', 'move'],
  uninitialized: ['copy', 'link', 'move'], // unset = all permitted
};

export function permittedDropEffects(effectAllowed: EffectAllowed): ReadonlyArray<DropEffect> {
  return ALLOWED[effectAllowed] ?? [];
}

export function isDropEffectAllowed(effectAllowed: EffectAllowed, dropEffect: DropEffect): boolean {
  if (dropEffect === 'none') return true; // "no drop" is always representable
  return permittedDropEffects(effectAllowed).includes(dropEffect);
}

/**
 * Resolve the actual dropEffect: honour the requested one if `effectAllowed`
 * permits it; otherwise fall back to the first permitted effect, or 'none' when
 * nothing is allowed. This is the rule a drop target applies on dragover.
 */
export function resolveDropEffect(effectAllowed: EffectAllowed, requested: DropEffect): DropEffect {
  if (requested !== 'none' && isDropEffectAllowed(effectAllowed, requested)) return requested;
  const permitted = permittedDropEffects(effectAllowed);
  return permitted.length > 0 ? permitted[0] : 'none';
}

/** Normalise a MIME type the way the spec does: trimmed + lowercased. */
export function normalizeType(type: string): string {
  return (type || '').trim().toLowerCase();
}

/**
 * The drag data store: MIME-keyed items with insertion-ordered `types`. Models
 * `DataTransfer.setData/getData/clearData/types`, including the spec rule that
 * setting an existing type replaces in place (order preserved).
 */
export class DragDataStore {
  private items = new Map<string, string>();

  setData(type: string, data: string): void {
    this.items.set(normalizeType(type), data);
  }

  getData(type: string): string {
    return this.items.get(normalizeType(type)) ?? '';
  }

  hasType(type: string): boolean {
    return this.items.has(normalizeType(type));
  }

  /** Insertion-ordered list of types currently in the store. */
  types(): string[] {
    return [...this.items.keys()];
  }

  clearData(type?: string): void {
    if (type === undefined) this.items.clear();
    else this.items.delete(normalizeType(type));
  }

  /** Snapshot the payload for handing across the shell drag boundary. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.items);
  }

  static fromSnapshot(snap: Record<string, string>): DragDataStore {
    const s = new DragDataStore();
    for (const [t, d] of Object.entries(snap)) s.setData(t, d);
    return s;
  }
}
