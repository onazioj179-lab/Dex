// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 9 - Accessibility + collaboration hardening primitives.
 *
 * AriaContract: declarative validation for interactive widgets.
 * KeymapRegistry: collision-free keyboard map composition.
 * LWWRegister + ORSet: minimal CRDT primitives for local-first collaboration.
 */

export type AriaRole =
  | 'button' | 'link' | 'menu' | 'menuitem' | 'dialog' | 'alert'
  | 'list' | 'listitem' | 'tab' | 'tabpanel' | 'textbox' | 'checkbox'
  | 'radio' | 'switch' | 'slider' | 'progressbar' | 'tree' | 'treeitem';

export interface AriaContract {
  readonly role: AriaRole;
  readonly requiresLabel: boolean;
  readonly requiresKeyboardActivation: boolean;
  readonly requiredAttrs?: readonly string[];
}

export const ARIA_CONTRACTS: Readonly<Record<AriaRole, AriaContract>> = Object.freeze({
  button:      { role: 'button',      requiresLabel: true,  requiresKeyboardActivation: true },
  link:        { role: 'link',        requiresLabel: true,  requiresKeyboardActivation: true },
  menu:        { role: 'menu',        requiresLabel: true,  requiresKeyboardActivation: true },
  menuitem:    { role: 'menuitem',    requiresLabel: true,  requiresKeyboardActivation: true },
  dialog:      { role: 'dialog',      requiresLabel: true,  requiresKeyboardActivation: false, requiredAttrs: ['aria-modal'] },
  alert:       { role: 'alert',       requiresLabel: false, requiresKeyboardActivation: false, requiredAttrs: ['aria-live'] },
  list:        { role: 'list',        requiresLabel: false, requiresKeyboardActivation: false },
  listitem:    { role: 'listitem',    requiresLabel: false, requiresKeyboardActivation: false },
  tab:         { role: 'tab',         requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-selected'] },
  tabpanel:    { role: 'tabpanel',    requiresLabel: true,  requiresKeyboardActivation: false },
  textbox:     { role: 'textbox',     requiresLabel: true,  requiresKeyboardActivation: true },
  checkbox:    { role: 'checkbox',    requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-checked'] },
  radio:       { role: 'radio',       requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-checked'] },
  switch:      { role: 'switch',      requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-checked'] },
  slider:      { role: 'slider',      requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'] },
  progressbar: { role: 'progressbar', requiresLabel: true,  requiresKeyboardActivation: false, requiredAttrs: ['aria-valuenow'] },
  tree:        { role: 'tree',        requiresLabel: true,  requiresKeyboardActivation: true },
  treeitem:    { role: 'treeitem',    requiresLabel: true,  requiresKeyboardActivation: true,  requiredAttrs: ['aria-expanded'] },
});

export interface AriaAuditTarget {
  readonly role: AriaRole;
  readonly label?: string;
  readonly keyHandlers?: readonly string[];
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
}

export interface AriaAuditIssue {
  readonly code: 'missing-label' | 'missing-keyboard' | 'missing-attr';
  readonly detail: string;
}

export function auditAria(target: AriaAuditTarget): AriaAuditIssue[] {
  const contract = ARIA_CONTRACTS[target.role];
  const issues: AriaAuditIssue[] = [];
  if (!contract) return issues;
  if (contract.requiresLabel && !target.label) {
    issues.push({ code: 'missing-label', detail: `${target.role} needs accessible label` });
  }
  if (contract.requiresKeyboardActivation) {
    const keys = new Set((target.keyHandlers ?? []).map((k) => k.toLowerCase()));
    if (!keys.has('enter') && !keys.has(' ') && !keys.has('space')) {
      issues.push({ code: 'missing-keyboard', detail: `${target.role} needs Enter or Space handler` });
    }
  }
  for (const required of contract.requiredAttrs ?? []) {
    if (!target.attrs || !(required in target.attrs)) {
      issues.push({ code: 'missing-attr', detail: `${target.role} missing ${required}` });
    }
  }
  return issues;
}

export interface KeymapBinding {
  readonly id: string;
  readonly chord: string;
  readonly description?: string;
  readonly scope?: string;
}

export class KeymapRegistry {
  private readonly bindings = new Map<string, KeymapBinding>();
  private readonly byChordScope = new Map<string, string>();

  register(binding: KeymapBinding): void {
    if (this.bindings.has(binding.id)) throw new Error(`binding ${binding.id} exists`);
    const key = `${binding.scope ?? 'global'}|${normalizeChord(binding.chord)}`;
    if (this.byChordScope.has(key)) {
      throw new Error(`chord conflict: ${key} -> ${this.byChordScope.get(key)}`);
    }
    this.bindings.set(binding.id, binding);
    this.byChordScope.set(key, binding.id);
  }

  unregister(id: string): boolean {
    const b = this.bindings.get(id);
    if (!b) return false;
    this.byChordScope.delete(`${b.scope ?? 'global'}|${normalizeChord(b.chord)}`);
    this.bindings.delete(id);
    return true;
  }

  resolve(chord: string, scope: string = 'global'): KeymapBinding | null {
    const id = this.byChordScope.get(`${scope}|${normalizeChord(chord)}`);
    if (!id) return null;
    return this.bindings.get(id) ?? null;
  }

  list(): KeymapBinding[] { return Array.from(this.bindings.values()); }
  size(): number { return this.bindings.size; }
}

function normalizeChord(chord: string): string {
  return chord.toLowerCase().split('+').map((p) => p.trim()).sort().join('+');
}

// CRDT primitives -------------------------------------------------------

export interface LWWState<T> {
  readonly value: T | undefined;
  readonly timestamp: number;
  readonly siteId: string;
}

export class LWWRegister<T> {
  private state: LWWState<T>;

  constructor(siteId: string, initial?: T, timestamp: number = 0) {
    this.state = { value: initial, timestamp, siteId };
  }

  set(value: T, timestamp: number, siteId: string): boolean {
    if (this.beats(timestamp, siteId)) {
      this.state = { value, timestamp, siteId };
      return true;
    }
    return false;
  }

  get(): T | undefined { return this.state.value; }
  snapshot(): LWWState<T> { return { ...this.state }; }

  merge(other: LWWState<T>): boolean {
    return this.set(other.value as T, other.timestamp, other.siteId);
  }

  private beats(ts: number, siteId: string): boolean {
    if (ts > this.state.timestamp) return true;
    if (ts < this.state.timestamp) return false;
    return siteId > this.state.siteId;
  }
}

export interface ORSetOp {
  readonly value: string;
  readonly tag: string;
}

/** Observed-Removed Set CRDT. Concurrent add wins over remove of an unseen tag. */
export class ORSet {
  private readonly added = new Map<string, Set<string>>();
  private readonly removed = new Map<string, Set<string>>();

  add(value: string, tag: string): void {
    const s = this.added.get(value) ?? new Set();
    s.add(tag);
    this.added.set(value, s);
  }

  remove(value: string): ORSetOp[] {
    const tags = this.added.get(value);
    if (!tags) return [];
    const out: ORSetOp[] = [];
    const r = this.removed.get(value) ?? new Set();
    for (const t of tags) { r.add(t); out.push({ value, tag: t }); }
    this.removed.set(value, r);
    return out;
  }

  has(value: string): boolean {
    const a = this.added.get(value);
    if (!a || a.size === 0) return false;
    const r = this.removed.get(value);
    if (!r) return true;
    for (const t of a) if (!r.has(t)) return true;
    return false;
  }

  values(): string[] {
    const out: string[] = [];
    for (const v of this.added.keys()) if (this.has(v)) out.push(v);
    return out.sort();
  }

  mergeAdd(op: ORSetOp): void { this.add(op.value, op.tag); }

  mergeRemove(op: ORSetOp): void {
    const r = this.removed.get(op.value) ?? new Set();
    r.add(op.tag);
    this.removed.set(op.value, r);
  }
}
