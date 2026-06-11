// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * WhatsNewModal -- Shown once per version on app launch.
 * Reads 'dex-last-seen-version' from localStorage; if it differs from
 * WHATSNEW_VERSION, the modal is displayed. On dismiss, the current
 * version is written back to localStorage.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';
import { POLICY_REPOSITORY_URL } from '../../shared/policies';

// Full changelog lives on the repository's releases page.
const CHANGELOG_URL = `${POLICY_REPOSITORY_URL}/releases`;

// Pulled from package.json at build time via vite.config.ts ('define' block).
const WHATSNEW_VERSION = (import.meta.env.VITE_APP_VERSION as string) || 'current';
const STORAGE_KEY = 'dex-last-seen-version';

interface ChangelogEntry {
  title: string;
  body: string;
}

const ENTRIES: ChangelogEntry[] = [
  {
    title: 'DEX is now 100% free',
    body: 'Every feature on every tier is unlocked - the full creative suite, automation, multi-window and more. No trial, no quotas, no payment.',
  },
  {
    title: 'Compact mode',
    body: 'Press Ctrl+Shift+M to shrink DEX to a small always-on-top pill in the corner, with quick actions for Notes, Timer and Clipboard. Your apps keep running underneath.',
  },
  {
    title: 'Workspace recovery',
    body: 'If a session ends unexpectedly, DEX offers to restore your workspace. Crashed apps recover on their own, and the window remembers its size and position.',
  },
  {
    title: 'A sharper, more alive system',
    body: 'Crisper corners everywhere, a reimagined Nexus, better note-taking with wiki-links and an outline, a high-contrast theme, and controls that respond to every press.',
  },
];

const WhatsNewModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    let lastSeen: string | null = null;
    try { lastSeen = localStorage.getItem(STORAGE_KEY); } catch { lastSeen = null; }
    if (lastSeen !== WHATSNEW_VERSION) setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, WHATSNEW_VERSION); } catch { /* intentional: dismiss-flag persistence is best-effort; modal will simply re-show next session */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max, 9999)' as React.CSSProperties['zIndex'],
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: 'calc(100vw - 40px)',
          background: 'var(--pg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-md)',
          padding: 24,
          color: 'var(--color-text-primary)',
          backdropFilter: 'var(--blur-lg) saturate(160%)',
          WebkitBackdropFilter: 'var(--blur-lg) saturate(160%)',
        }}
      >
        <h2
          id="whats-new-title"
          style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 4 }}
        >
          What's new in DEX {WHATSNEW_VERSION}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
          Highlights from this release
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {ENTRIES.map(entry => (
            <div key={entry.title}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {entry.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {entry.body}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            onClick={() =>
              (window as any).electron?.invoke?.('shell:openExternal', CHANGELOG_URL) ||
              window.open(CHANGELOG_URL, '_blank', 'noopener,noreferrer')
            }
            aria-label="Open the full changelog on the DEX releases page"
            style={{
              background: 'none', border: 'none',
              color: 'var(--color-accent)', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, padding: 0,
            }}
          >
            View full changelog
          </button>
          <button
            onClick={close}
            autoFocus
            style={{
              background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-lg)',
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
