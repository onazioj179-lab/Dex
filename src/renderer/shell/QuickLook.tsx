// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Quick Look
 * Spacebar or force-touch preview for any selected item.
 * Renders centered preview panel with backdrop blur.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  /** Source element bounding rect for animation origin */
  originRect?: DOMRect | null;
}

interface QuickLookProps {
  item: QuickLookItem | null;
  /** List of all previewable items for left/right navigation */
  items?: QuickLookItem[];
  onDismiss: () => void;
  onNavigate?: (item: QuickLookItem) => void;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const QuickLook: React.FC<QuickLookProps> = ({
  item,
  items = [],
  onDismiss,
  onNavigate,
}) => {
  const [currentItem, setCurrentItem] = useState<QuickLookItem | null>(item);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentItem(item);
  }, [item]);

  // Keyboard navigation
  useEffect(() => {
    if (!currentItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (items.length > 1) {
        const idx = items.findIndex(i => i.title === currentItem.title && i.type === currentItem.type);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = items[(idx + 1) % items.length];
          setCurrentItem(next);
          onNavigate?.(next);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = items[(idx - 1 + items.length) % items.length];
          setCurrentItem(prev);
          onNavigate?.(prev);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentItem, items, onDismiss, onNavigate]);

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
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 85vw)',
          maxHeight: '80vh',
          borderRadius: 14,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: isReduceMotion() ? 'none' : 'quickLookIn 0.2s ease-out',
          transformOrigin,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TypeIcon type={currentItem.type} />
            <span id="quicklook-title" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {currentItem.title}
            </span>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close preview"
            style={{
              width: 24, height: 24, borderRadius: 6,
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
          padding: 16,
          minHeight: 200,
        }}>
          <QuickLookContent item={currentItem} />
        </div>

        {/* Navigation hint */}
        {items.length > 1 && (
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--color-bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              Use arrow keys to navigate
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CONTENT RENDERERS
// ---------------------------------------------------------------------------

const QuickLookContent: React.FC<{ item: QuickLookItem }> = ({ item }) => {
  switch (item.type) {
    case 'image':
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <img
            src={item.content}
            alt={item.title}
            style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 8, objectFit: 'contain' }}
          />
        </div>
      );

    case 'video':
      return (
        <video
          src={item.content}
          controls
          autoPlay
          style={{ width: '100%', maxHeight: '60vh', borderRadius: 8, background: '#000' }}
        />
      );

    case 'audio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <audio src={item.content} controls autoPlay style={{ width: '100%', maxWidth: 400 }} />
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
          background: item.type === 'code' ? 'rgba(0,0,0,0.3)' : 'transparent',
          borderRadius: item.type === 'code' ? 8 : 0,
          padding: item.type === 'code' ? 16 : 0,
          overflowX: 'auto',
        }}>
          {item.content}
        </div>
      );

    case 'folder':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 12 }}>
          {item.content.split('\n').filter(Boolean).map((name, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center', wordBreak: 'break-all' }}>{name}</span>
            </div>
          ))}
        </div>
      );

    case 'task':
      return (
        <div style={{ padding: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>{item.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{item.content}</div>
        </div>
      );

    case 'contact':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(74,158,255,0.15)',
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

    default:
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 14 }}>
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

// ---------------------------------------------------------------------------
// HOOK: useQuickLook
// ---------------------------------------------------------------------------

export function useQuickLook() {
  const [item, setItem] = useState<QuickLookItem | null>(null);
  const [items, setItems] = useState<QuickLookItem[]>([]);

  const show = useCallback((ql: QuickLookItem, list?: QuickLookItem[]) => {
    setItem(ql);
    if (list) setItems(list);
  }, []);

  const dismiss = useCallback(() => {
    setItem(null);
    setItems([]);
  }, []);

  return { item, items, show, dismiss, setItem };
}
