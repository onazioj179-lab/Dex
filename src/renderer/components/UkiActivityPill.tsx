// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * What UKI is doing right now, in one pill at the top of DEX:
 * "UKI · DEX Code · Run the open file", then "Done" (or why it failed).
 * Several quick actions in a row update the same pill instead of stacking up.
 */
import React, { useEffect, useRef, useState } from 'react';
import { UKI_ACTIVITY_EVENT, type UkiActivity } from '../uki/activity';

const DONE_MS = 2400;
const FAILED_MS = 5000;

export const UkiActivityPill: React.FC = () => {
  const [a, setA] = useState<UkiActivity | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<UkiActivity>).detail;
      if (!next) return;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setA(next);
      if (next.phase !== 'start') {
        timer.current = setTimeout(() => setA((cur) => (cur && cur.id === next.id ? null : cur)), next.phase === 'failed' ? FAILED_MS : DONE_MS);
      }
    };
    window.addEventListener(UKI_ACTIVITY_EVENT, on);
    return () => { window.removeEventListener(UKI_ACTIVITY_EVENT, on); if (timer.current) clearTimeout(timer.current); };
  }, []);
  if (!a) return null;
  const failed = a.phase === 'failed';
  const done = a.phase === 'done';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`UKI ${failed ? 'could not finish' : done ? 'finished' : 'is working'} in ${a.appName}: ${a.label}`}
      className="dex-liquid-glass"
      style={{
        position: 'fixed', top: 46, left: '50%', transform: 'translateX(-50%)', zIndex: 'var(--z-toast, 9500)' as unknown as number,
        display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px 0 10px', borderRadius: 9999, maxWidth: 'min(560px, 90vw)',
        boxShadow: `0 0 0 1px ${failed ? 'var(--color-error)' : 'color-mix(in srgb, var(--color-accent) 45%, transparent)'}, 0 6px 18px rgba(0,0,0,0.22)`,
        fontSize: 12.5, color: 'var(--color-text-primary)', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}
    >
      <style>{`@keyframes dexUkiActPulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } } @media (prefers-reduced-motion: reduce) { .dex-uki-act-dot { animation: none !important } }`}</style>
      <span aria-hidden="true" className="dex-uki-act-dot" style={{
        width: 8, height: 8, borderRadius: 9999, flexShrink: 0,
        background: failed ? 'var(--color-error)' : done ? 'var(--color-success, #34c759)' : 'var(--color-accent)',
        animation: a.phase === 'start' ? 'dexUkiActPulse 1s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontWeight: 700 }}>UKI</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
      <span style={{ fontWeight: 600 }}>{a.appName}</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-secondary)' }}>
        {failed ? `Couldn't finish: ${a.detail || a.label}` : done ? `${a.label} · done` : `${a.label}…`}
      </span>
    </div>
  );
};

export default UkiActivityPill;
