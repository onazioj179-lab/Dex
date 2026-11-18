// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Now -- Current Context panel
 * -----------------------------------------------------------------------------
 * A user-invoked view of the live work context the Context Engine accumulates:
 * the active project / workspace / file, the apps you have open, and a recent-
 * activity stream. This is the consumer that turns the (previously orphaned)
 * Context Engine into a real, signature "what am I working on right now"
 * surface -- the same context UKI uses to ground its answers.
 *
 * Opt-in: opened via the `dex-open-context` event (command palette / shortcut).
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { contextEngine, type WorkContext } from '../../shared/uki/contextEngine';

function relTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const ContextNowPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<WorkContext | null>(null);

  const refresh = useCallback(() => setCtx(contextEngine.getContext()), []);

  useEffect(() => {
    const onOpen = () => { refresh(); setOpen(true); };
    window.addEventListener('dex-open-context', onOpen);
    return () => window.removeEventListener('dex-open-context', onOpen);
  }, [refresh]);

  // Keep the snapshot live while the panel is open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 1500);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.clearInterval(id); window.removeEventListener('keydown', onKey, true); };
  }, [open, refresh]);

  if (!open || !ctx) return null;

  const rows: Array<{ label: string; value: string }> = [];
  if (ctx.project) rows.push({ label: 'Project', value: ctx.project });
  if (ctx.workspace) rows.push({ label: 'Workspace', value: ctx.workspace });
  if (ctx.file) rows.push({ label: 'Active file', value: ctx.file });
  if (ctx.task) rows.push({ label: 'Task', value: ctx.task });

  const styles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' },
    panel: { width: '100%', maxWidth: '460px', background: 'var(--color-bg-elevated)', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' },
    head: { padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' },
    title: { fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' },
    sub: { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' },
    body: { padding: 'var(--space-3) var(--space-4)', overflow: 'auto' },
    row: { display: 'flex', gap: 'var(--space-3)', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid var(--color-border-subtle)' },
    rowLabel: { width: '90px', flexShrink: 0, color: 'var(--color-text-muted)' },
    rowValue: { color: 'var(--color-text-primary)', wordBreak: 'break-word' },
    sectionTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em', color: 'var(--color-text-muted)', margin: 'var(--space-3) 0 var(--space-2)' },
    chips: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
    chip: { padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', background: 'var(--color-bg-glass)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)' },
    activity: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '5px 0', fontSize: '12px' },
    actKind: { fontSize: '10px', fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em', color: 'var(--color-accent)', width: '54px', flexShrink: 0 },
    actTarget: { flex: 1, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    actTime: { color: 'var(--color-text-muted)', flexShrink: 0 },
    empty: { padding: '32px var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' },
    hint: { padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' },
  };

  const nothing = rows.length === 0 && ctx.openApps.length === 0 && ctx.recentActivity.length === 0;

  return (
    <div style={styles.overlay} onMouseDown={() => setOpen(false)}>
      <div style={styles.panel} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.head}>
          <div style={styles.title}>Now</div>
          <div style={styles.sub}>What you're working on — the context DEX tracks for you</div>
        </div>
        <div style={styles.body}>
          {nothing ? (
            <div style={styles.empty}>Nothing tracked yet. Open apps and files and they'll show up here.</div>
          ) : (
            <>
              {rows.map(r => (
                <div key={r.label} style={styles.row}>
                  <span style={styles.rowLabel}>{r.label}</span>
                  <span style={styles.rowValue}>{r.value}</span>
                </div>
              ))}

              {ctx.openApps.length > 0 && (
                <>
                  <div style={styles.sectionTitle}>Open apps</div>
                  <div style={styles.chips}>
                    {ctx.openApps.map(a => <span key={a} style={styles.chip}>{a}</span>)}
                  </div>
                </>
              )}

              {ctx.recentActivity.length > 0 && (
                <>
                  <div style={styles.sectionTitle}>Recent activity</div>
                  {ctx.recentActivity.slice(0, 12).map((a, i) => (
                    <div key={`${a.kind}-${a.at}-${i}`} style={styles.activity}>
                      <span style={styles.actKind}>{a.kind}</span>
                      <span style={styles.actTarget}>{a.target}</span>
                      <span style={styles.actTime}>{relTime(a.at)}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div style={styles.hint}>Esc to close</div>
      </div>
    </div>
  );
};

export default memo(ContextNowPanel);
