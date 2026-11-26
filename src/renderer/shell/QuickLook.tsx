// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Quick Look
 * Spacebar or force-touch preview for any selected item.
 * Renders centered preview panel with backdrop blur.
 */

import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { formatBytes } from '../../shared/format/units';
import { openLocalFile } from '../services/media/localMedia';
import DexIcon from '../components/DexIcon';
import { LocalAudioPreview } from '../components/LocalAudioPreview';
import { QuickLookVideo } from '../components/VideoPreview';
import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type QuickLookItemType = 'note' | 'image' | 'video' | 'audio' | 'code' | 'folder' | 'task' | 'contact' | 'pdf' | 'unknown';

export interface QuickLookItem {
  type: QuickLookItemType;
  title: string;
  /** URL, text content, or path depending on type */
  content: string;
  path?: string;
  size?: number;
  loading?: boolean;
  error?: string;
  truncated?: boolean;
  /** Source element bounding rect for animation origin */
  originRect?: DOMRect | null;
}

interface QuickLookProps {
  item: QuickLookItem | null;
  position?: { index: number; total: number };
  onDismiss: () => void;
  onStep?: (delta: number) => void;
}

export function QuickLook({ item: currentItem, position, onDismiss, onStep }: QuickLookProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const active = !!currentItem;

  useLayoutEffect(() => {
    if (!active) return;
    const origin = document.activeElement;
    panelRef.current?.focus();
    return () => { if (origin instanceof HTMLElement && origin.isConnected) origin.focus(); };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest?.('button, input, select, textarea, a, video, audio, iframe, [contenteditable="true"]');
      if (event.key === 'Escape' || (event.key === ' ' && !event.repeat && !interactive)) {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      } else if (!interactive && position && position.total > 1 &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        event.stopPropagation();
        onStep?.(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Tab') {
        const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), video[controls], audio[controls], iframe'));
        const first = controls[0];
        const last = controls.at(-1);
        const focused = document.activeElement;
        if (first && (focused === panel || !panel.contains(focused) || (event.shiftKey ? focused === first : focused === last))) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active, position, onStep, onDismiss]);

  if (!currentItem) return null;

  const origin = currentItem.originRect;
  const transformOrigin = origin
    ? `${origin.left + origin.width / 2}px ${origin.top + origin.height / 2}px`
    : 'center center';

  return (
    <div
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quicklook-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.80)',
        animation: isReduceMotion() ? 'none' : 'fadeIn 0.15s ease-out',
        cursor: 'default',
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 85vw)',
          maxHeight: '80vh',
          borderRadius: 10,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--pg-shadow-popover)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: isReduceMotion() ? 'none' : 'quickLookIn 0.2s ease-out',
          transformOrigin,
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TypeIcon type={currentItem.type} />
            <span id="quicklook-title" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {currentItem.title}
            </span>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close preview"
            style={{
              width: 24, height: 24, borderRadius: 4,
              background: 'var(--color-bg-hover)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)',
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-4)',
          minHeight: 200,
        }}>
          <QuickLookContent key={currentItem.path ?? currentItem.title} item={currentItem} />
        </div>

        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '8px 16px', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 12 }}>
          <span>{currentItem.truncated ? 'First 256 KiB shown' : currentItem.size !== undefined && currentItem.type !== 'folder' ? formatBytes(currentItem.size) : currentItem.type === 'folder' ? 'Folder' : ''}</span>
          {position && position.total > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => onStep?.(-1)} disabled={position.index === 0} aria-label="Previous file"><DexIcon name="chevron-left" size={14} /></button>
            <span>{position.index + 1} / {position.total}</span>
            <button type="button" onClick={() => onStep?.(1)} disabled={position.index === position.total - 1} aria-label="Next file"><DexIcon name="chevron-right" size={14} /></button>
          </div>}
        </footer>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CONTENT RENDERERS
// ---------------------------------------------------------------------------

const QuickLookContent: React.FC<{ item: QuickLookItem }> = ({ item }) => {
  const [failed, setFailed] = useState(false);
  const [externalError, setExternalError] = useState('');
  const open = () => {
    if (!item.path) return;
    setExternalError('');
    void openLocalFile(item.path).catch(error => setExternalError(error.message));
  };
  if (item.loading) return <p role="status">Loading preview…</p>;
  if (item.error || failed || item.type === 'unknown') return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: 28 }}>
      <span role="status">{item.error || (failed ? 'This file could not be previewed.' : 'No preview available')}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {item.path && <button onClick={open}>Open file</button>}
      </div>
      {externalError && <span role="alert">{externalError}</span>}
    </div>
  );
  switch (item.type) {
    case 'image':
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <img
            src={item.content}
            alt={item.title}
            onError={() => setFailed(true)}
            style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 6, objectFit: 'contain' }}
          />
        </div>
      );

    case 'video':
      return (
        <QuickLookVideo url={item.content} path={item.path} onOpen={open} openError={externalError} />
      );

    case 'audio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-8) 0' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <LocalAudioPreview url={item.content} path={item.path} title={item.title} />
        </div>
      );

    case 'note':
    case 'code':
      return (
        <div style={{
          whiteSpace: 'pre-wrap',
          fontFamily: item.type === 'code' ? 'var(--font-mono, monospace)' : 'var(--font-family)',
          fontSize: item.type === 'code' ? 12 : 14,
          lineHeight: 1.6,
          color: 'var(--color-text-primary)',
          background: item.type === 'code' ? 'var(--color-bg-inset, rgba(0,0,0,0.3))' : 'transparent',
          borderRadius: item.type === 'code' ? 8 : 0,
          padding: item.type === 'code' ? 16 : 0,
          overflowX: 'auto',
        }}>
          {item.content}
        </div>
      );

    case 'folder':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 'var(--space-3)' }}>
          {item.content.split('\n').filter(Boolean).map((name, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 'var(--space-2)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center', wordBreak: 'break-all' }}>{name}</span>
            </div>
          ))}
        </div>
      );

    case 'task':
      return (
        <div style={{ padding: 'var(--space-2)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>{item.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{item.content}</div>
        </div>
      );

    case 'contact':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--color-accent-light, rgba(74,158,255,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 600, color: 'var(--color-accent)',
          }}>
            {item.title.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.title}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{item.content}</div>
          </div>
        </div>
      );

    case 'pdf':
      return (
        <iframe
          src={item.content}
          title={item.title}
          style={{ width: '100%', height: '65vh', border: 'none', borderRadius: 6, background: '#fff' }}
        />
      );

    default:
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-10)', color: 'var(--color-text-muted)', fontSize: 14 }}>
          No preview available
        </div>
      );
  }
};

// ---------------------------------------------------------------------------
// TYPE ICON
// ---------------------------------------------------------------------------

const TypeIcon: React.FC<{ type: QuickLookItemType }> = ({ type }) => {
  const stroke = 'var(--color-text-muted)';
  switch (type) {
    case 'image':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
    case 'video':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>;
    case 'audio':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
    case 'note':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'code':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case 'folder':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case 'task':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    default:
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  }
};
