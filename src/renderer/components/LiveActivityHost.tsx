// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Live Activity Host
 * -----------------------------------------------------------------------------
 * Renders the system-wide live activities (store/liveActivityStore) as premium
 * glass progress cards near the top-centre of the screen -- the DEX loading
 * language for file copy/move/share, creative export, and other long tasks.
 * Non-blocking: the host catches no pointer events; only the cards do.
 *
 * Material: the shared `.dex-liquid-glass` (borderless frosted glass) with a
 * faint DEX-blue wash and a blue (`--color-accent`) progress bar, so every long
 * operation reads the same and matches the rest of the shell.
 */

import React from 'react';
import { useLiveActivityStore, type LiveActivity } from '../store/liveActivityStore';
import DexIcon from './DexIcon';

const ACCENT = 'var(--color-accent, #4A9EFF)';

const Card: React.FC<{ activity: LiveActivity }> = ({ activity }) => {
  const dismiss = useLiveActivityStore((s) => s.dismiss);
  const indeterminate = activity.progress == null;
  const pct = Math.round(((activity.progress ?? 0) * 100));
  const isError = activity.status === 'error';
  const isDone = activity.status === 'success';

  const label = isError ? 'Failed' : isDone ? 'Complete' : (activity.subtitle && /\bof\b/.test(activity.subtitle) ? 'Working' : 'Working');
  const barColor = isError ? 'var(--color-error, #ff453a)' : ACCENT;

  return (
    <div
      className="dex-liquid-glass dex-live-activity-in"
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: 'auto',
        width: 'min(420px, calc(100vw - 32px))',
        padding: 16,
        borderRadius: 'var(--radius-2xl, 18px)',
        // Faint DEX-blue wash layered over the glass for the reference look.
        backgroundImage:
          'linear-gradient(180deg, rgba(74,158,255,0.10), rgba(74,158,255,0.02)), linear-gradient(180deg, rgba(44,44,54,0.28), rgba(14,14,20,0.42))',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(activity.id)}
        style={{
          position: 'absolute', top: 12, right: 12, width: 24, height: 24,
          borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.10)', color: 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.12s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
      >
        <DexIcon name="close" size={12} color="currentColor" />
      </button>

      {/* Header: icon tile (+ badge) and the title/subtitle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 28 }}>
        <div
          aria-hidden="true"
          style={{
            position: 'relative', width: 54, height: 54, flexShrink: 0,
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg, rgba(74,158,255,0.30), rgba(74,158,255,0.12))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            color: ACCENT,
          }}
        >
          <DexIcon name={activity.icon || 'files'} size={26} color="currentColor" />
          {activity.badge && (
            <span
              style={{
                position: 'absolute', bottom: -6, left: -6,
                fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
                padding: '2px 5px', borderRadius: 6, color: '#fff',
                background: 'rgba(20,22,30,0.72)', border: '1px solid rgba(255,255,255,0.14)',
              }}
            >
              {activity.badge}
            </span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activity.title}
          </div>
          {activity.subtitle && (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {activity.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Progress row inside a recessed track, like the reference. */}
      <div
        style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 14,
          background: 'rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {!isDone && !isError && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: 'dexSpin 0.9s linear infinite' }} aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.2-8.6" />
              </svg>
            )}
            {isDone && <DexIcon name="check" size={14} color={ACCENT} />}
            {label}
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary, #fff)', letterSpacing: '-0.01em' }}>
            {indeterminate && !isDone && !isError ? '' : `${pct}%`}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 9999, background: 'rgba(255,255,255,0.10)', overflow: 'hidden', position: 'relative' }}>
          {indeterminate && !isDone && !isError ? (
            <div
              style={{
                position: 'absolute', top: 0, bottom: 0, width: '38%', borderRadius: 9999,
                background: barColor, animation: 'dexIndeterminate 1.3s ease-in-out infinite',
              }}
            />
          ) : (
            <div
              style={{
                height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 9999,
                background: barColor, boxShadow: `0 0 12px ${isError ? 'rgba(255,69,58,0.5)' : 'rgba(74,158,255,0.5)'}`,
                transition: 'width 0.3s ease',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const LiveActivityHost: React.FC = () => {
  const activities = useLiveActivityStore((s) => s.activities);
  if (activities.length === 0) return null;
  return (
    <div
      aria-label="Live activities"
      style={{
        position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)',
        zIndex: 'var(--z-notification, 9000)' as unknown as number,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        pointerEvents: 'none', maxWidth: '100vw',
      }}
    >
      {activities.map((a) => (
        <Card key={a.id} activity={a} />
      ))}
    </div>
  );
};

export default LiveActivityHost;
