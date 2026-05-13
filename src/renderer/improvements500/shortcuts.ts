// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Keyboard shortcut registry + remap + cheat-sheet data
 * (T9-003, T9-015, T9-021).
 *
 * Stores user remaps in localStorage; matches KeyboardEvent against bindings.
 */

export interface ShortcutDef {
  /** Stable id, e.g. "shell.toggleDock". */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Default binding string, e.g. "Ctrl+K" or "Ctrl+Shift+P". Use "Cmd" for meta on mac. */
  defaultBinding: string;
  /** Optional category for cheat-sheet grouping. */
  category?: string;
  run: (e: KeyboardEvent) => void;
}

const REMAP_KEY = 'dex:shortcuts:remap';
const registry = new Map<string, ShortcutDef>();

function loadRemap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(REMAP_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}

function saveRemap(map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(REMAP_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

export function registerShortcut(s: ShortcutDef): () => void {
  registry.set(s.id, s);
  return () => { registry.delete(s.id); };
}

export function getBinding(id: string): string | undefined {
  const remap = loadRemap();
  if (remap[id]) return remap[id];
  return registry.get(id)?.defaultBinding;
}

export function setBinding(id: string, binding: string): void {
  const remap = loadRemap();
  remap[id] = binding;
  saveRemap(remap);
}

export function resetBinding(id: string): void {
  const remap = loadRemap();
  delete remap[id];
  saveRemap(remap);
}

/** Cheat-sheet data grouped by category. */
export function cheatSheet(): Array<{ category: string; items: Array<{ id: string; description: string; binding: string }> }> {
  const groups = new Map<string, Array<{ id: string; description: string; binding: string }>>();
  for (const s of registry.values()) {
    const cat = s.category ?? 'General';
    const list = groups.get(cat) ?? [];
    list.push({ id: s.id, description: s.description, binding: getBinding(s.id) ?? s.defaultBinding });
    groups.set(cat, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, items: items.sort((a, b) => a.description.localeCompare(b.description)) }));
}

/** Parse "Ctrl+Shift+K" / "Cmd+P" / "Alt+ArrowUp" into a normalized struct. */
export interface BindingParts { ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; key: string; }

export function parseBinding(binding: string): BindingParts {
  const parts = binding.split('+').map((p) => p.trim());
  const out: BindingParts = { ctrl: false, meta: false, shift: false, alt: false, key: '' };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') out.ctrl = true;
    else if (lower === 'cmd' || lower === 'meta' || lower === 'super') out.meta = true;
    else if (lower === 'shift') out.shift = true;
    else if (lower === 'alt' || lower === 'option') out.alt = true;
    else out.key = p;
  }
  return out;
}

export function matchesEvent(binding: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; key: string }): boolean {
  const p = parseBinding(binding);
  return p.ctrl === e.ctrlKey && p.meta === e.metaKey && p.shift === e.shiftKey && p.alt === e.altKey
    && p.key.toLowerCase() === e.key.toLowerCase();
}

/** Dispatch a KeyboardEvent through the registry. Returns true if handled. */
export function dispatch(e: KeyboardEvent): boolean {
  for (const s of registry.values()) {
    const binding = getBinding(s.id) ?? s.defaultBinding;
    if (matchesEvent(binding, e)) {
      s.run(e);
      return true;
    }
  }
  return false;
}

/** Test helper. */
export function _reset(): void {
  registry.clear();
  if (typeof localStorage !== 'undefined') localStorage.removeItem(REMAP_KEY);
}
