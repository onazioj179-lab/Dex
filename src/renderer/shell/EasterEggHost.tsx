// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Listens for the Konami code and shows the credits card for the shell-level
// easter eggs (see services/easterEggs.ts). Idle cost: one keydown listener.

import React, { useEffect, useRef, useState } from 'react';
import { CREATOR_CREDIT } from '../../shared/creator';
import { getDisplayVersion } from '../utils/appVersion';
import {
  EASTER_EGG_EVENT,
  EASTER_EGG_IDS,
  KONAMI,
  discoverEasterEgg,
  foundEasterEggs,
  konamiStep,
  type EasterEggId,
} from '../services/easterEggs';

const CARD_EGGS: ReadonlySet<string> = new Set<EasterEggId>(['konami', 'version-tap']);

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('.xterm');
}

export const EasterEggHost: React.FC = () => {
  const [card, setCard] = useState<{ id: string; isNew: boolean } | null>(null);
  const progress = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) { progress.current = 0; return; }
      progress.current = konamiStep(progress.current, e.key);
      if (progress.current === KONAMI.length) {
        progress.current = 0;
        discoverEasterEgg('konami');
      }
    };
    const onEgg = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; isNew: boolean }>).detail;
      if (d && CARD_EGGS.has(d.id)) setCard(d);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(EASTER_EGG_EVENT, onEgg);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(EASTER_EGG_EVENT, onEgg);
    };
  }, []);

  useEffect(() => {
    if (!card) return;
    const t = setTimeout(() => setCard(null), 6000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [card]);

  if (!card) return null;
  const found = foundEasterEggs().length;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setCard(null)}
      className="dex-liquid-glass dex-easter-card"
      style={{
        position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)',
        zIndex: 'var(--z-notification)' as unknown as number,
        minWidth: 280, maxWidth: 'calc(100vw - 32px)', padding: '20px 24px', borderRadius: 18,
        textAlign: 'center', cursor: 'default', userSelect: 'none',
        boxShadow: 'var(--pg-shadow-popover), 0 0 0 0.5px var(--color-border-subtle)',
      }}
    >
      <style>{`
        @keyframes dexEggIn { from { opacity: 0; transform: translate(-50%, -46%) scale(0.94); } 60% { transform: translate(-50%, -50.6%) scale(1.015); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        .dex-easter-card { animation: dexEggIn 320ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        @media (prefers-reduced-motion: reduce) { .dex-easter-card { animation: none; } }
      `}</style>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
        {card.isNew ? 'Easter egg found' : 'You found this one already'}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginTop: 8, color: 'var(--color-text-primary)', textWrap: 'balance' } as React.CSSProperties}>
        DEX {getDisplayVersion()}
      </div>
      <div style={{ fontSize: 13, marginTop: 4, color: 'var(--color-text-secondary)' }}>{CREATOR_CREDIT}</div>
      <div style={{ fontSize: 12, marginTop: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
        {found} of {EASTER_EGG_IDS.length} found
      </div>
    </div>
  );
};

export default EasterEggHost;
