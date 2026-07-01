// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AssistedTextarea — a drop-in <textarea> with silent, learn-as-you-type word
 * completion, usable across apps (DexCode, creative text fields, …).
 *
 * Reuses the in-memory prediction engine from Notes (WordTrie + BigramPredictor
 * via useWordSuggestions, run with no-op backends so it learns within the
 * session) but positions its popup with the real textarea caret coordinates
 * (utils/textareaCaret) instead of the contenteditable-only getSelection path —
 * so the suggestion popup lands ON the caret, not in the corner.
 *
 * Controlled like a normal textarea: pass value + onChange. Accepting a
 * suggestion (Tab / Enter / click) writes through the native value setter and
 * dispatches an input event, so the parent's onChange fires normally.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useWordSuggestions, getLastWord } from '../DEXAPPLICATIONS/notes/WordSuggestions';
import { getTextareaCaretRect } from '../utils/textareaCaret';

export interface AssistedTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  /** Turn the assist off entirely (renders a plain textarea). Default: on. */
  assist?: boolean;
}

const noopAsync = async () => { /* in-memory only; no backend persistence */ };

function setNativeTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const proto = window.HTMLTextAreaElement?.prototype;
  const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const AssistedTextarea = React.forwardRef<HTMLTextAreaElement, AssistedTextareaProps>(
  ({ assist = true, value, onChange, onKeyDown, onBlur, onScroll, style, ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = useCallback((el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }, [forwardedRef]);

    const { suggestions, handleTextChange, hideSuggestions } = useWordSuggestions(noopAsync, noopAsync);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [active, setActive] = useState(0);

    const open = assist && !!pos && suggestions.length > 0;

    const refresh = useCallback((el: HTMLTextAreaElement) => {
      if (!assist) return;
      const caret = el.selectionStart ?? el.value.length;
      handleTextChange(el.value, caret);
      // Position synchronously (no rAF — a paused/throttled rAF would stop the
      // popup from ever showing). Caret-accurate when the mirror measurement
      // lands inside the field; otherwise (auto-grow / flex / unusual CSS) fall
      // back to the field's bottom edge so the popup always hugs the field and
      // never drifts into empty space.
      const rect = getTextareaCaretRect(el, caret);
      const field = el.getBoundingClientRect();
      let top = rect.top + rect.height + 3;
      if (top < field.top || top > field.bottom + 14) top = field.bottom + 3;
      const left = Math.max(field.left, Math.min(rect.left, field.right - 48));
      setPos({ top, left });
      setActive(0);
    }, [assist, handleTextChange]);

    const close = useCallback(() => { setPos(null); hideSuggestions(); }, [hideSuggestions]);

    const accept = useCallback((word: string) => {
      const el = innerRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      const last = getLastWord(el.value, caret);
      // The trie stores lowercase; insert only the remainder past what's typed.
      const remainder = word.length > last.length ? word.slice(last.length) : '';
      if (!remainder) { close(); return; }
      const next = el.value.slice(0, caret) + remainder + el.value.slice(caret);
      setNativeTextareaValue(el, next);
      const newCaret = caret + remainder.length;
      requestAnimationFrame(() => { try { el.setSelectionRange(newCaret, newCaret); } catch { /* noop */ } });
      close();
    }, [close]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e);
      refresh(e.currentTarget);
    }, [onChange, refresh]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, suggestions.length - 1)); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const word = suggestions[active];
          if (word) { e.preventDefault(); accept(word); return; }
        }
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      }
      onKeyDown?.(e);
    }, [open, suggestions, active, accept, close, onKeyDown]);

    const popup = useMemo(() => {
      if (!open || !pos) return null;
      return (
        <div
          role="listbox"
          aria-label="Word suggestions"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            zIndex: 'var(--z-tooltip, 9000)' as unknown as number,
            display: 'flex', flexDirection: 'column', minWidth: 120, maxWidth: 260, maxHeight: 200, overflow: 'auto',
            backgroundColor: 'var(--color-bg-elevated, #1c1c1e)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--pg-shadow-popover, 0 10px 30px rgba(0,0,0,0.4))',
            padding: '4px 0',
          }}
        >
          {suggestions.map((w, i) => (
            <div
              key={w}
              role="option"
              aria-selected={i === active}
              onMouseDown={(ev) => { ev.preventDefault(); accept(w); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '5px 10px', fontSize: 12.5, cursor: 'pointer',
                color: i === active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: i === active ? 'var(--color-bg-hover)' : 'transparent',
              }}
            >
              {w}
            </div>
          ))}
        </div>
      );
    }, [open, pos, suggestions, active, accept]);

    return (
      <>
        <textarea
          {...rest}
          ref={setRefs}
          value={value}
          style={style}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={(e) => { onBlur?.(e); setTimeout(close, 120); }}
          onScroll={(e) => { onScroll?.(e); if (open) close(); }}
        />
        {popup}
      </>
    );
  },
);

AssistedTextarea.displayName = 'AssistedTextarea';

export default AssistedTextarea;
