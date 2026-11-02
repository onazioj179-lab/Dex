// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Live Activity Host
 * -----------------------------------------------------------------------------
 * Renders the system-wide live activities (store/liveActivityStore) as compact
 * progress cards in the top-right corner, under the top bar: downloads, file
 * copy/move, creative exports, transfers. Non-blocking: the host catches no
 * pointer events; only the cards do. Shows real progress only (indeterminate
 * when the task can't measure it), Cancel when the task supports it.
 *
 * Material: theme tokens on the shared glass surface, so it follows Interface
 * Transparency and reads correctly in light and dark mode.
 */

import React from 'react';
import { useLiveActivityStore, type LiveActivity } from '../store/liveActivityStore';
import DexIcon from './DexIcon';

const MAX_VISIBLE = 3;

const Card: React.FC<{ activity: LiveActivity }> = ({ activity }) => {
  const dismiss = useLiveActivityStore((s) => s.dismiss);
  const complete = useLiveActivityStore((s) => s.complete);
  const isError = activity.status === 'error';
  const isDone = activity.status === 'success';
  const running = !isDone && !isError;
  const indeterminate = activity.progress == null && running;
  const pct = Math.round((activity.progress ?? 0) * 100);
  const barColor = isError ? 'var(--color-error)' : 'var(--color-accent)';
  const cancelled = isError && activity.subtitle === 'Cancelled';
  const status = cancelled ? 'Cancelled' : isError ? 'Failed' : isDone ? 'Done' : indeterminate ? 'Working' : `${pct}%`;

  const onCancel = () => {
    try { activity.cancel?.(); } catch { /* the task's own cancel must not break the card */ }
    complete(activity.id, { status: 'error', subtitle: 'Cancelled' });
  };

  return (
    <div
      className="dex-live-activity dex-live-activity-in"
      role="status"
      aria-live="polite"
      aria-label={`${activity.title}: ${status}`}
    >
      <div className="dex-live-activity__icon" aria-hidden="true">
        <DexIcon name={activity.icon || 'files'} size={16} color="currentColor" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
          <span className="dex-live-activity__title">{activity.title}</span>
          <span className="dex-live-activity__status" style={isError ? { color: 'var(--color-error)' } : undefined}>{status}</span>
        </div>
        {activity.subtitle && !cancelled && <div className="dex-live-activity__subtitle">{activity.subtitle}</div>}
        <div className="dex-live-activity__track" aria-hidden="true">
          {indeterminate ? (
            <div className="dex-live-activity__bar is-indeterminate" style={{ background: barColor }} />
          ) : (
            <div className="dex-live-activity__bar" style={{ width: `${Math.max(0, Math.min(100, isDone ? 100 : pct))}%`, background: barColor }} />
          )}
        </div>
      </div>
      {running && activity.cancel ? (
        <button type="button" className="dex-live-activity__btn" onClick={onCancel} aria-label={`Cancel ${activity.title}`}>Cancel</button>
      ) : (
        <button type="button" className="dex-live-activity__close" onClick={() => dismiss(activity.id)} aria-label="Dismiss">
          <DexIcon name="close" size={11} color="currentColor" />
        </button>
      )}
    </div>
  );
};

const HOST_CSS = `
.dex-live-activity {
  pointer-events: auto; display: flex; align-items: center; gap: var(--space-3);
  width: min(340px, calc(100vw - 32px)); padding: 10px 12px; box-sizing: border-box;
  border-radius: var(--radius-lg, 14px); border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-glass-strong); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-md); color: var(--color-text-primary);
}
.dex-live-activity__icon {
  width: 30px; height: 30px; flex-shrink: 0; border-radius: var(--radius-md, 10px);
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent); color: var(--color-accent);
}
.dex-live-activity__title { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dex-live-activity__status { font-size: 11px; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.dex-live-activity__subtitle { font-size: 11px; color: var(--color-text-tertiary); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dex-live-activity__track { position: relative; height: 4px; margin-top: 6px; border-radius: 9999px; overflow: hidden; background: var(--color-bg-hover); }
.dex-live-activity__bar { height: 100%; border-radius: 9999px; transition: width 0.3s ease; }
.dex-live-activity__bar.is-indeterminate { position: absolute; top: 0; bottom: 0; width: 38%; animation: dexIndeterminate 1.3s ease-in-out infinite; }
.dex-live-activity__btn {
  flex-shrink: 0; height: 26px; padding: 0 10px; border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-border-subtle); background: var(--color-bg-surface); color: var(--color-text-primary);
  font: 500 12px var(--dex-font-ui); cursor: pointer;
}
.dex-live-activity__btn:hover, .dex-live-activity__close:hover { background: var(--color-bg-hover); }
.dex-live-activity__close {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 9999px; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; background: transparent; color: var(--color-text-secondary);
}
.dex-live-activity__btn:focus-visible, .dex-live-activity__close:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .dex-live-activity__bar { transition: none; }
  .dex-live-activity__bar.is-indeterminate { animation-duration: 2.6s; }
}
`;

export const LiveActivityHost: React.FC = () => {
  const activities = useLiveActivityStore((s) => s.activities);
  if (activities.length === 0) return null;
  const visible = activities.slice(-MAX_VISIBLE);
  const hidden = activities.length - visible.length;
  return (
    <div
      aria-label="Live activities"
      style={{
        position: 'fixed', top: 40, right: 12,
        zIndex: 'var(--z-notification, 9000)' as unknown as number,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
        pointerEvents: 'none',
      }}
    >
      <style>{HOST_CSS}</style>
      {visible.map((a) => (
        <Card key={a.id} activity={a} />
      ))}
      {hidden > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>+{hidden} more</span>
      )}
    </div>
  );
};

export default LiveActivityHost;
