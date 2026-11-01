// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ask UKI about the selection — "AI everywhere".
 *
 * Mounted once in the shell. Whenever the user selects text in ANY app/surface,
 * a small floating "Ask UKI" chip appears by the selection; clicking it (or
 * Ctrl/Cmd+Shift+U) hands the selected text to the agent loop via the canonical
 * `dex-uki-ask` bridge. No per-app wiring needed — this gives every text surface
 * a real "ask the assistant about this" affordance.
 */

import React, { useCallback, useEffect, useState } from 'react';

interface SelInfo { text: string; x: number; y: number; }

const MIN_LEN = 5;
const MAX_LEN = 4000;

const AskUkiSelection: React.FC = () => {
  const [sel, setSel] = useState<SelInfo | null>(null);

  const ask = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      window.dispatchEvent(new CustomEvent('dex-uki-ask', {
        detail: { query: `About this selection:\n"""${t.slice(0, MAX_LEN)}"""` },
      }));
    } catch { /* never throw from the affordance */ }
    setSel(null);
    try { window.getSelection()?.removeAllRanges(); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const capture = () => {
      try {
        const s = window.getSelection();
        const text = s?.toString().trim() ?? '';
        if (!s || s.rangeCount === 0 || text.length < MIN_LEN || text.length > MAX_LEN) { setSel(null); return; }
        const rect = s.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) { setSel(null); return; }
        setSel({ text, x: rect.left + rect.width / 2, y: rect.top });
      } catch { setSel(null); }
    };
    const onMouseUp = () => { window.setTimeout(capture, 10); };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'u') {
        const text = window.getSelection()?.toString().trim();
        if (text && text.length >= MIN_LEN) ask(text);
      }
    };
    const onScroll = () => setSel(null);
    const onSelChange = () => { if (!window.getSelection()?.toString().trim()) setSel(null); };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('selectionchange', onSelChange);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('selectionchange', onSelChange);
    };
  }, [ask]);

  if (!sel) return null;
  const left = Math.max(8, Math.min(sel.x - 44, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 100));
  const top = Math.max(8, sel.y - 40);

  return (
    <button
      // preventDefault on mousedown so clicking the chip doesn't collapse the selection before onClick
      onMouseDown={e => e.preventDefault()}
      onClick={() => ask(sel.text)}
      title="Ask UKI about the selected text (Ctrl+Shift+U)"
      aria-label="Ask UKI about the selected text"
      style={{
        position: 'fixed', left, top, zIndex: 2147483000,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 10,
        background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, fontFamily: 'var(--dex-font-ui)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Ask UKI
    </button>
  );
};

export default AskUkiSelection;
