// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React, { memo, useEffect, useState } from 'react';

interface DexBootScreenProps {
  onComplete: () => void;
}

const BOOT_STAGES = [
  { code: '01', label: 'System integrity', detail: 'Verifying runtime and storage' },
  { code: '02', label: 'Workspace state', detail: 'Restoring windows and projects' },
  { code: '03', label: 'DEX services', detail: 'Connecting search, UKI, and transfer services' },
] as const;

/**
 * Branded cold-start bridge. It prevents the shell, wallpaper, and lazy app
 * manager from flashing in separately while the first composited frame settles.
 * The screen is deliberately short and uses transform/opacity-only motion.
 */
export const DexBootScreen = memo<DexBootScreenProps>(({ onComplete }) => {
  const [stage, setStage] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const start = performance.now();

    timers.push(window.setTimeout(() => { if (!cancelled) setStage(1); }, 180));
    timers.push(window.setTimeout(() => { if (!cancelled) setStage(2); }, 420));

    const settle = async () => {
      try {
        await Promise.all([
          document.fonts?.ready ?? Promise.resolve(),
          new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        ]);
      } catch {
        // Fonts API may be unavailable; the frame barrier is sufficient.
      }
      const remaining = Math.max(0, 760 - (performance.now() - start));
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setLeaving(true);
        timers.push(window.setTimeout(() => { if (!cancelled) onComplete(); }, 220));
      }, remaining));
    };

    void settle();
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [onComplete]);

  return (
    <div
      className={`dex-boot-screen${leaving ? ' dex-boot-screen--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`DEX is starting. ${BOOT_STAGES[stage].label}`}
      aria-busy={!leaving}
    >
      <style>{BOOT_CSS}</style>
      <div className="dex-boot-frame">
        <div className="dex-boot-header">
          <span>DEX / MONOLITH</span>
          <span>BOOT SEQUENCE</span>
        </div>
        <div className="dex-boot-main">
          <div className="dex-boot-core" aria-hidden="true">
            <svg className="dex-boot-mark" viewBox="0 0 96 96" fill="none">
              <path d="M18 8H51C74 8 88 23 88 48S74 88 51 88H18V8Z" stroke="currentColor" strokeWidth="3" />
              <path d="M31 23H50C64 23 74 32 74 48S64 73 50 73H31V23Z" stroke="currentColor" strokeWidth="2" opacity="0.65" />
              <path d="M8 18L18 8M8 78L18 88M78 8L88 18M78 88L88 78" stroke="currentColor" strokeWidth="2" />
              <path d="M40 39H56V55H40Z" fill="currentColor" />
            </svg>
          </div>
          <div className="dex-boot-copy">
            <div className="dex-boot-wordmark">DEX</div>
            <div className="dex-boot-subtitle">PERSONAL COMPUTING ENVIRONMENT</div>
            <div className="dex-boot-status" key={stage}>
              <span className="dex-boot-code">{BOOT_STAGES[stage].code}</span>
              <span>
                <strong>{BOOT_STAGES[stage].label}</strong>
                <small>{BOOT_STAGES[stage].detail}</small>
              </span>
            </div>
          </div>
        </div>
        <div className="dex-boot-progress" aria-hidden="true">
          {BOOT_STAGES.map((item, index) => <span key={item.code} data-complete={index <= stage} />)}
        </div>
        <div className="dex-boot-footer">
          <span>LOCAL-FIRST SYSTEM</span>
          <span>{Math.round(((stage + 1) / BOOT_STAGES.length) * 100)}%</span>
        </div>
      </div>
    </div>
  );
});

DexBootScreen.displayName = 'DexBootScreen';

const BOOT_CSS = `
  .dex-boot-screen {
    position: fixed;
    inset: 0;
    z-index: var(--z-emergency, 2147483647);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    box-sizing: border-box;
    overflow: hidden;
    color: var(--color-text-primary, #fff);
    background: #08090a;
    opacity: 1;
    transition: opacity 200ms var(--dex-ease, ease);
  }
  .dex-boot-screen--leaving { opacity: 0; pointer-events: none; }
  .dex-boot-frame {
    width: min(640px, 100%);
    border: 1px solid rgba(255,255,255,0.18);
    background: #0d0f10;
    clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
  }
  .dex-boot-header, .dex-boot-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    color: #85888b;
    font: 600 9px/1 var(--dex-font-mono, monospace);
    letter-spacing: 0.15em;
  }
  .dex-boot-header { border-bottom: 1px solid rgba(255,255,255,0.09); }
  .dex-boot-footer { border-top: 1px solid rgba(255,255,255,0.09); }
  .dex-boot-main { display: grid; grid-template-columns: 144px 1fr; align-items: center; min-height: 224px; }
  .dex-boot-core { height: 100%; display: grid; place-items: center; border-right: 1px solid rgba(255,255,255,0.09); }
  .dex-boot-mark { width: 88px; height: 88px; color: #f2f2f2; }
  .dex-boot-copy { padding: 28px 32px; }
  .dex-boot-wordmark { font-size: 34px; font-weight: 600; letter-spacing: 0.3em; text-indent: 0.3em; }
  .dex-boot-subtitle { margin-top: 7px; color: #777a7d; font: 600 9px/1 var(--dex-font-mono, monospace); letter-spacing: 0.16em; }
  .dex-boot-status { display: flex; align-items: center; gap: 12px; margin-top: 32px; min-height: 36px; }
  .dex-boot-code { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid rgba(255,255,255,0.22); color: #f2f2f2; font: 600 10px/1 var(--dex-font-mono, monospace); }
  .dex-boot-status strong, .dex-boot-status small { display: block; }
  .dex-boot-status strong { color: #e4e4e4; font-size: 12px; font-weight: 550; letter-spacing: 0.02em; }
  .dex-boot-status small { margin-top: 4px; color: #777a7d; font-size: 10px; }
  .dex-boot-progress { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 0 14px 12px; }
  .dex-boot-progress span { height: 2px; background: rgba(255,255,255,0.1); }
  .dex-boot-progress span[data-complete="true"] { background: #f2f2f2; }
  @media (max-width: 520px) {
    .dex-boot-screen { padding: 16px; }
    .dex-boot-main { grid-template-columns: 1fr; }
    .dex-boot-core { height: 120px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.09); }
    .dex-boot-mark { width: 68px; height: 68px; }
    .dex-boot-copy { padding: 24px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dex-boot-screen { transition: none; }
  }
`;

export default DexBootScreen;
