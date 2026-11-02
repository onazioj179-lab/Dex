// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workspace Time Machine overlay.
 * Scrub back through the automatic layout timeline and restore the whole desktop
 * to how it looked at an earlier moment. Opened via `dex-open-workspace-timeline`;
 * restore/snapshot/changes flow through AppManager via CustomEvents.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { APP_DEFINITIONS } from '../store/runningApps';
import { listTimeline, deleteTimelineSnapshot, type TimelineSnapshot } from './workspaceTimelineStore';

function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function appNames(snap: TimelineSnapshot): string {
  const names = snap.windows.map(w => APP_DEFINITIONS[w.appId]?.name || w.appId);
  return names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '');
}

export const WorkspaceTimeline: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [snaps, setSnaps] = useState<TimelineSnapshot[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => { setSnaps(listTimeline()); setNow(Date.now()); }, []);

  useEffect(() => {
    const onOpen = () => { refresh(); setOpen(true); };
    const onChanged = () => refresh();
    window.addEventListener('dex-open-workspace-timeline', onOpen);
    window.addEventListener('dex-workspace-timeline-changed', onChanged);
    return () => {
      window.removeEventListener('dex-open-workspace-timeline', onOpen);
      window.removeEventListener('dex-workspace-timeline-changed', onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const restore = (id: string) => { window.dispatchEvent(new CustomEvent('dex-workspace-timeline-restore', { detail: { id } })); setOpen(false); };
  const remove = (id: string) => { deleteTimelineSnapshot(id); refresh(); };
  const snapshotNow = () => { window.dispatchEvent(new CustomEvent('dex-workspace-snapshot-now')); setTimeout(refresh, 60); };

  return (
    <div
      onMouseDown={() => setOpen(false)}
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)' as any, background: 'var(--color-scrim, rgba(0,0,0,0.75))', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        className="dex-liquid-glass"
        role="dialog"
        aria-label="Workspace Time Machine"
        style={{ width: 'min(560px, calc(100vw - 48px))', maxHeight: '70vh', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Workspace Time Machine</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Restore your desktop layout to an earlier moment</div>
          </div>
          <button onClick={snapshotNow} style={{ padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--color-accent, #0A84FF)', background: 'rgba(10,132,255,0.15)', color: 'var(--color-accent, #4A9EFF)' }}>Snapshot now</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {snaps.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              No snapshots yet. Open a few windows — DEX captures your layout automatically, or use “Snapshot now”.
            </div>
          ) : snaps.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, transition: 'background 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.05))'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{relativeTime(s.createdAt, now)} · {s.windows.length} window{s.windows.length === 1 ? '' : 's'}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appNames(s)}</div>
              </div>
              <button onClick={() => restore(s.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--color-border)', background: 'var(--color-bg-glass, rgba(255,255,255,0.06))', color: 'var(--color-text-primary)' }}>Restore</button>
              <button onClick={() => remove(s.id)} aria-label="Delete snapshot" style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceTimeline;
