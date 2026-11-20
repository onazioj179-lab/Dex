// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Undo / redo for a controlled text editor.
 *
 * A textarea whose value the app rewrites itself (Tab, auto-indent, bracket
 * pairs, replace, UKI edits) loses the browser's own undo history, so Ctrl+Z
 * stops working. This keeps an app-side history instead: every change to
 * `value` is recorded (quick typing is grouped into one step), and
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk it. History is kept per document
 * (`docKey`, e.g. the editor tab) so switching tabs does not mix them.
 *
 * The history core is pure (createTextHistory) and unit-tested.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextHistory {
  /** Record that the text is now `next` (at time `now`). */
  record(next: string, now: number): void;
  undo(): string | null;
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
  current(): string;
}

export function createTextHistory(initial: string, groupMs = 700, limit = 300): TextHistory {
  const past: string[] = [];
  const future: string[] = [];
  let cur = initial;
  let lastAt = -Infinity;
  return {
    record(next, now) {
      if (next === cur) return;
      // Quick consecutive edits form one undo step (the snapshot before the run is kept).
      if (now - lastAt > groupMs || past.length === 0) {
        past.push(cur);
        if (past.length > limit) past.shift();
      }
      lastAt = now;
      cur = next;
      future.length = 0;
    },
    undo() {
      const prev = past.pop();
      if (prev === undefined) return null;
      future.push(cur);
      cur = prev;
      lastAt = -Infinity;
      return prev;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(cur);
      cur = next;
      lastAt = -Infinity;
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    current: () => cur,
  };
}

/** Where the two texts first differ: the caret goes there after undo/redo. */
export function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

export function isUndoKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}

export function useTextHistory(
  value: string,
  setValue: (v: string) => void,
  docKey: string,
  inputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
) {
  const stores = useRef(new Map<string, TextHistory>());
  const applying = useRef<string | null>(null);
  const [, bump] = useState(0);

  const store = useCallback((): TextHistory => {
    let h = stores.current.get(docKey);
    if (!h) { h = createTextHistory(value); stores.current.set(docKey, h); }
    return h;
  // value only seeds a new document's history
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useEffect(() => {
    const h = store();
    if (applying.current === value) { applying.current = null; return; }
    h.record(value, Date.now());
    bump(n => n + 1);
  }, [value, store]);

  const apply = useCallback((from: string, to: string | null) => {
    if (to === null) return false;
    applying.current = to;
    setValue(to);
    bump(n => n + 1);
    const el = inputRef?.current;
    if (el) {
      const at = firstDiff(from, to) + Math.max(0, to.length - from.length);
      requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = Math.min(at, to.length); el.focus(); } catch { /* detached */ } });
    }
    return true;
  }, [setValue, inputRef]);

  const undo = useCallback(() => { const h = store(); const from = h.current(); return apply(from, h.undo()); }, [store, apply]);
  const redo = useCallback(() => { const h = store(); const from = h.current(); return apply(from, h.redo()); }, [store, apply]);

  /** Call from the editor's onKeyDown; returns true when it handled the key. */
  const handleKey = useCallback((e: React.KeyboardEvent | KeyboardEvent): boolean => {
    const which = isUndoKey(e);
    if (!which) return false;
    e.preventDefault();
    if (which === 'undo') undo(); else redo();
    return true;
  }, [undo, redo]);

  return { undo, redo, handleKey, canUndo: store().canUndo(), canRedo: store().canRedo() };
}
