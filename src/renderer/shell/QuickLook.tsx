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

import { PlayableVideo, PlayableAudio } from '../components/media/PlayableMedia';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { analyzeBeats, analyzeKey, analyzeLoudness, analyzeSilence } from '../services/media/analyzeBeats';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type QuickLookItemType = 'note' | 'image' | 'video' | 'audio' | 'code' | 'markdown' | 'table' | 'folder' | 'task' | 'contact' | 'pdf' | 'unknown';

export interface QuickLookItem {
  type: QuickLookItemType;
  title: string;
  /** URL, text content, or path depending on type */
  content: string;
  /** Source element bounding rect for animation origin */
  originRect?: DOMRect | null;
  /** The file on disk, when there is one: enables Open and Show in Explorer. */
  path?: string;
  /** One line under the preview (e.g. "Showing the first 200 KB of 4.1 MB"). */
  note?: string;
}

/** Minimal CSV/TSV reader for the table preview (quotes, escaped quotes, CRLF). */
export function parseDelimited(text: string, delimiter = text.split('\n', 1)[0].includes('\t') ? '\t' : ',', maxRows = 500): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) { row.push(cell); rows.push(row); }
  return rows;
}

const qlPill: React.CSSProperties = {
  height: 24, padding: '0 10px', borderRadius: 9999, border: 'none', cursor: 'pointer',
  background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontWeight: 600,
};

function revealOrOpen(channel: 'shell:openPath' | 'shell:showItemInFolder', path: string): void {
  const dex = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
  void dex?.invoke?.(channel, path).catch(() => { /* reported by the shell */ });
}

const ImagePreview: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  // Click to see actual pixels (scrolls), click again to fit.
  const [actual, setActual] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: actual ? 'flex-start' : 'center', justifyContent: actual ? 'flex-start' : 'center', minHeight: 200, maxHeight: '65vh', overflow: actual ? 'auto' : 'hidden' }}>
      <img
        src={src}
        alt={alt}
        onClick={(e) => { e.stopPropagation(); setActual((v) => !v); }}
        style={actual
          ? { maxWidth: 'none', cursor: 'zoom-out' }
          : { maxWidth: '100%', maxHeight: '60vh', borderRadius: 6, objectFit: 'contain', cursor: 'zoom-in' }}
      />
    </div>
  );
};

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {currentItem.path && (
            <>
              <button type="button" onClick={() => revealOrOpen('shell:openPath', currentItem.path!)} style={qlPill}>Open</button>
              <button type="button" onClick={() => revealOrOpen('shell:showItemInFolder', currentItem.path!)} style={qlPill}>Show in Explorer</button>
            </>
          )}
          <button
            onClick={onDismiss}
            aria-label="Close preview"
            style={{
              width: 24, height: 24, borderRadius: 9999,
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
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-4)',
          minHeight: 200,
        }}>
          <QuickLookContent item={currentItem} />
          {currentItem.note && <div style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--color-text-muted)' }}>{currentItem.note}</div>}
        </div>

        {/* Navigation hint */}
        {items.length > 1 && (
          <div style={{
            padding: 'var(--space-2) var(--space-4)',
            borderTop: '1px solid var(--color-bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-4)',
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

/**
 * Native audio analysis strip shown under the Quick Look player: tempo (native
 * for file paths, real Web-Audio engine for URLs), plus musical key and BS.1770
 * loudness (native-only — shown only when `source` is a real filesystem path,
 * never faked for a web URL). Renders nothing until at least one figure lands.
 */
const AudioAnalysis: React.FC<{ source: string }> = ({ source }) => {
  const [metrics, setMetrics] = useState<Array<{ label: string; value: string }> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMetrics(null);
    void (async () => {
      const [beats, key, loud, silence] = await Promise.all([
        analyzeBeats(source).catch(() => null),
        analyzeKey(source).catch(() => null),
        analyzeLoudness(source).catch(() => null),
        analyzeSilence(source).catch(() => null),
      ]);
      if (!alive) return;
      const rows: Array<{ label: string; value: string }> = [];
      if (beats && beats.bpm > 0) rows.push({ label: 'Tempo', value: `${beats.bpm} BPM` });
      if (key && key.key) rows.push({ label: 'Key', value: `${key.key} ${key.scale}`.trim() });
      if (loud) {
        rows.push({ label: 'Loudness', value: `${loud.lufs.toFixed(1)} LUFS` });
        rows.push({ label: 'Peak', value: `${loud.peakDbfs.toFixed(1)} dBFS` });
      }
      if (silence && silence.removedSec > 0.1) {
        rows.push({ label: 'Silence', value: `${silence.removedSec.toFixed(1)}s · ${silence.gaps}` });
      }
      setMetrics(rows.length ? rows : null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [source]);

  if (loading) {
    return <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Analyzing audio…</div>;
  }
  if (!metrics) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-4)', justifyContent: 'center', maxWidth: 440 }}>
      {metrics.map(m => (
        <div key={m.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>{m.value}</span>
          <span style={{ fontSize: 10, textTransform: 'none', letterSpacing: '0.01em', color: 'var(--color-text-muted)' }}>{m.label}</span>
        </div>
      ))}
    </div>
  );
};

const QuickLookContent: React.FC<{ item: QuickLookItem }> = ({ item }) => {
  switch (item.type) {
    case 'image':
      return <ImagePreview src={item.content} alt={item.title} />;

    case 'markdown':
      // Sanitised HTML from the host (Notes' Markdown parser + DOMPurify).
      return <div className="dex-ql-markdown" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--color-text-primary)' }} dangerouslySetInnerHTML={{ __html: item.content }} />;

    case 'table': {
      const rows = parseDelimited(item.content);
      if (!rows.length) return <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>The file is empty.</div>;
      const [head, ...body] = rows;
      return (
        <div style={{ overflow: 'auto', maxHeight: '62vh', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--color-border-subtle)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 'max-content', minWidth: '100%' }}>
            <thead><tr>{head.map((h, i) => <th key={i} style={{ position: 'sticky', top: 0, background: 'var(--color-bg-elevated)', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>{body.map((r, i) => <tr key={i}>{head.map((_, j) => <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-subtle)', whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[j] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }

    case 'video':
      return (
        <PlayableVideo
          src={item.content}
          controls
          autoPlay
          style={{ width: '100%', maxHeight: '60vh', borderRadius: 6, background: '#000' }}
        />
      );

    case 'audio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-6) 0' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <PlayableAudio src={item.content} controls autoPlay style={{ width: '100%', maxWidth: 400 }} wrapperStyle={{ width: '100%', maxWidth: 400 }} />
          <AudioAnalysis source={item.content} />
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

    case 'folder': {
      // The host sends the folder's entries as JSON ([{ name, isDirectory }]); plain lines still work.
      let entries: Array<{ name: string; isDirectory?: boolean }> = [];
      try { const v = JSON.parse(item.content); if (Array.isArray(v)) entries = v; } catch { entries = item.content.split('\n').filter(Boolean).map((name) => ({ name })); }
      if (!entries.length) return <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: 'var(--space-4)' }}>This folder is empty.</div>;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 'var(--space-2)', maxHeight: '62vh', overflow: 'auto' }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 'var(--space-2)' }}>
              {e.isDirectory
                ? <svg width="28" height="28" viewBox="0 0 24 24" fill="color-mix(in srgb, var(--color-accent) 22%, transparent)" stroke="var(--color-accent)" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.3 }}>{e.name}</span>
            </div>
          ))}
        </div>
      );
    }

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
    case 'table':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>;
    case 'markdown':
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
