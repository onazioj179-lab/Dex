// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Flow -- Send-to Picker
 * -----------------------------------------------------------------------------
 * A lightweight, global "Send to..." overlay. Opened by dispatching
 * `dex-flow-open`:
 *   - with `detail.payload` (e.g. a clip from the Omni Clipboard), or
 *   - with no payload, in which case it resolves the current text selection,
 *     falling back to the most recent clipboard entry.
 *
 * It then shows kind-appropriate destination apps and routes the content there
 * via DEX Flow. Fully opt-in; never appears on its own.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useOverlay } from '../services/overlayStack';
import { getFlowTargets, sendFlow, type FlowPayload } from '../services/FlowTransfer';
import { useClipboardStore, detectClipKind } from '../store/clipboardStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';

function currentSource(): string | undefined {
  try { return useRunningApps.getState().currentAppId || undefined; } catch { return undefined; }
}

/** Resolve a payload from the current selection, else the latest clip. */
function resolvePayload(): FlowPayload | null {
  try {
    const sel = window.getSelection?.()?.toString().trim();
    if (sel) {
      const { kind } = detectClipKind(sel);
      return { kind, content: sel, source: currentSource() };
    }
  } catch { /* selection unavailable */ }
  const top = useClipboardStore.getState().entries[0];
  if (top) return { kind: top.kind, content: top.content, source: top.sourceAppId };
  return null;
}

const KIND_LABEL: Record<string, string> = {
  text: 'Text', snippet: 'Snippet', code: 'Code', link: 'Link', color: 'Color',
  email: 'Email', path: 'Path', number: 'Number', image: 'Image', file: 'File',
};

export const FlowSendMenu: React.FC = () => {
  const [payload, setPayload] = useState<FlowPayload | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ payload?: FlowPayload }>).detail;
      const p = detail?.payload ?? resolvePayload();
      if (!p || !p.content.trim()) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Copy or select something to send' } }));
        return;
      }
      setPayload(p);
    };
    window.addEventListener('dex-flow-open', onOpen as EventListener);
    return () => window.removeEventListener('dex-flow-open', onOpen as EventListener);
  }, []);

  const close = useCallback(() => setPayload(null), []);

  const onPick = useCallback((appId: string) => {
    if (payload) void sendFlow(appId, payload);
    setPayload(null);
  }, [payload]);

  // Escape goes through the shared overlay stack: only the top overlay closes.
  useOverlay(!!payload, close, { dismissOnOutside: false });

  if (!payload) return null;

  const targets = getFlowTargets(payload);
  const preview = payload.kind === 'image' ? 'Image' : payload.content.replace(/\s+/g, ' ').trim().slice(0, 120);
  const kindLabel = payload.kind === 'code'
    ? 'Code'
    : (KIND_LABEL[payload.kind] ?? 'Text');

  const styles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '18vh' },
    panel: { width: '100%', maxWidth: '440px', background: 'var(--color-bg-elevated)', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' },
    head: { padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' },
    title: { fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' },
    preview: { fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    kindTag: { display: 'inline-block', fontSize: '10px', fontWeight: 600, color: 'var(--color-accent)', marginRight: '6px', textTransform: 'none', letterSpacing: '0.01em' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: 'var(--space-3)' },
    target: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: '10px', border: '1px solid var(--color-border-subtle)', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
    swatch: { width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0 },
    targetName: { fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 500 },
    hint: { padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' },
  };

  return (
    <div style={styles.overlay} onMouseDown={close}>
      <div style={styles.panel} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.head}>
          <div style={styles.title}>Send to…</div>
          <div style={styles.preview}><span style={styles.kindTag}>{kindLabel}</span>{preview || '(empty)'}</div>
        </div>
        <div style={styles.grid}>
          {targets.map(t => (
            <button key={t.id} style={styles.target} onClick={() => onPick(t.id)}>
              <span style={{ ...styles.swatch, background: t.color || 'var(--color-accent)' }} />
              <span style={styles.targetName}>{APP_DEFINITIONS[t.id]?.name ?? t.name}</span>
            </button>
          ))}
        </div>
        <div style={styles.hint}>Esc to cancel</div>
      </div>
    </div>
  );
};

export default memo(FlowSendMenu);
