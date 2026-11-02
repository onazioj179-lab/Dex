// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Quick Actions ("Click-To-Do")
 * -----------------------------------------------------------------------------
 * A small, context-aware action menu over the current text selection (or the
 * latest clip if nothing is selected). It is the coordinator the brief calls
 * for: it reads the current context and offers the relevant DEX actions, reusing
 * the OS-level features already built — Omni Clipboard, DEX Flow, and Spotlight/
 * Browser — rather than reimplementing them.
 *
 * Opt-in: opened via the `dex-open-quick-actions` event (the Quick Actions
 * command). Actions are filtered by the detected content kind.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useClipboardStore, detectClipKind, type ClipKind } from '../store/clipboardStore';
import { useRunningApps } from '../store/runningApps';

interface QAContext {
  kind: ClipKind;
  content: string;
  source?: string;
}

function resolveContext(): QAContext | null {
  try {
    const sel = window.getSelection?.()?.toString().trim();
    if (sel) {
      const src = (() => { try { return useRunningApps.getState().currentAppId || undefined; } catch { return undefined; } })();
      return { kind: detectClipKind(sel).kind, content: sel, source: src };
    }
  } catch { /* selection unavailable */ }
  const top = useClipboardStore.getState().entries[0];
  if (top) return { kind: top.kind, content: top.content, source: top.sourceAppId };
  return null;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  return t;
}

interface QAAction { id: string; label: string; run: () => void; }

export const QuickActionsMenu: React.FC = () => {
  const [ctx, setCtx] = useState<QAContext | null>(null);

  useEffect(() => {
    const onOpen = () => {
      const c = resolveContext();
      if (!c || !c.content.trim()) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Select or copy something to act on' } }));
        return;
      }
      setCtx(c);
    };
    window.addEventListener('dex-open-quick-actions', onOpen);
    return () => window.removeEventListener('dex-open-quick-actions', onOpen);
  }, []);

  const close = useCallback(() => setCtx(null), []);

  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ctx, close]);

  if (!ctx) return null;

  const toast = (message: string) => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message } }));

  const actions: QAAction[] = [];
  if (ctx.kind === 'link') {
    actions.push({ id: 'open', label: 'Open link in Browser', run: () => {
      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: 'browser', contextId: normalizeUrl(ctx.content) } }));
    } });
  }
  actions.push({ id: 'copy', label: 'Copy', run: () => {
    try { void navigator.clipboard?.writeText(ctx.content); } catch { /* blocked */ }
    try { useClipboardStore.getState().add(ctx.content, { sourceAppId: ctx.source }); } catch { /* optional */ }
    toast('Copied');
  } });
  actions.push({ id: 'send', label: 'Send to app…', run: () => {
    window.dispatchEvent(new CustomEvent('dex-flow-open', { detail: { payload: { kind: ctx.kind, content: ctx.content, source: ctx.source } } }));
  } });
  if (ctx.kind !== 'link') {
    actions.push({ id: 'search', label: 'Search the web', run: () => {
      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: 'browser', contextId: `https://www.google.com/search?q=${encodeURIComponent(ctx.content.slice(0, 400))}` } }));
    } });
  }

  const onPick = (a: QAAction) => { a.run(); close(); };
  const preview = ctx.content.replace(/\s+/g, ' ').trim().slice(0, 90);

  const styles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20vh' },
    panel: { width: '100%', maxWidth: '360px', borderRadius: '14px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' },
    head: { padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)' },
    title: { fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' },
    preview: { fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' },
    list: { padding: 'var(--space-2)' },
    item: { display: 'block', width: '100%', textAlign: 'left', padding: 'var(--space-2) var(--space-3)', borderRadius: '10px', border: 'none', background: 'transparent', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer' },
    hint: { padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' },
  };

  return (
    <div style={styles.overlay} onMouseDown={close}>
      <div className="dex-liquid-glass" style={styles.panel} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.head}>
          <div style={styles.title}>Quick Actions</div>
          <div style={styles.preview}>{preview}</div>
        </div>
        <div style={styles.list}>
          {actions.map(a => (
            <button
              key={a.id}
              style={styles.item}
              onClick={() => onPick(a)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >{a.label}</button>
          ))}
        </div>
        <div style={styles.hint}>Esc to close</div>
      </div>
    </div>
  );
};

export default memo(QuickActionsMenu);
