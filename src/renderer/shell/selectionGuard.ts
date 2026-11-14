// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Selection guard: Ctrl/Cmd+A outside a text field must not select the whole
// OS (menus, titles, labels) the way a web page would. Fields, editors and
// anything marked selectable keep the native select-all; apps that bind their
// own Ctrl+A (select all files, layers, clips) still get the key, since this
// only cancels the browser's default action and never stops propagation.

/** True when select-all inside `el` is real text selection the user wants. */
export function allowsSelectAll(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return !!el.closest('[contenteditable], .selectable, .select-text, [data-selectable], .xterm, pre, code');
}

export function installSelectionGuard(target: Window = window): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (e.key !== 'a' && e.key !== 'A') return;
    if (allowsSelectAll(e.target as Element | null)) return;
    e.preventDefault();
  };
  target.addEventListener('keydown', onKey, true);
  return () => target.removeEventListener('keydown', onKey, true);
}
