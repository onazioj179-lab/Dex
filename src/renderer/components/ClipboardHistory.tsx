// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Omni Clipboard -- History Panel
 * -----------------------------------------------------------------------------
 * The user-facing surface for DEX's Smart Clipboard. It reads from the Omni
 * Clipboard store (single source of truth; continuously filled by the
 * background monitor) and renders each clip *typed*: code in monospace with a
 * language tag, colors with a live swatch, links styled, plus the DEX app the
 * clip came from. Search and type filters make the history a fast, cross-app
 * memory rather than a flat list.
 *
 * Opt-in (Ctrl+Shift+V or the command palette) -- never nags.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { DexSearchInput } from '../styles/components';
import { Button } from '../ui/Button';
import { captureCurrentClipboard } from '../services/ClipboardMonitor';
import {
  useClipboardEntries,
  useClipboardActions,
  type ClipEntry,
  type ClipKind,
} from '../store/clipboardStore';

// ==================== ICONS ====================

const Icons = {
  clipboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  text: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>,
  code: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  link: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  color: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>,
  email: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,
  path: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>,
  number: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  send: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 17v5M9 11V6a3 3 0 016 0v5M5 11h14l-1 6H6l-1-6z"/></svg>,
};

// ==================== KIND METADATA ====================

const KIND_META: Record<ClipKind, { icon: React.ReactNode; label: string }> = {
  text: { icon: Icons.text, label: '' },
  code: { icon: Icons.code, label: 'Code' },
  link: { icon: Icons.link, label: 'Link' },
  color: { icon: Icons.color, label: 'Color' },
  email: { icon: Icons.email, label: 'Email' },
  path: { icon: Icons.path, label: 'Path' },
  number: { icon: Icons.number, label: 'Number' },
  image: { icon: Icons.image, label: 'Image' },
  file: { icon: Icons.file, label: 'File' },
};

type FilterKey = 'all' | 'pinned' | 'text' | 'code' | 'link' | 'color';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'text', label: 'Text' },
  { key: 'code', label: 'Code' },
  { key: 'link', label: 'Links' },
  { key: 'color', label: 'Colors' },
];

function matchesFilter(entry: ClipEntry, filter: FilterKey): boolean {
  switch (filter) {
    case 'all': return true;
    case 'pinned': return !!entry.pinned;
    case 'text': return entry.kind === 'text' || entry.kind === 'number' || entry.kind === 'email' || entry.kind === 'path';
    default: return entry.kind === filter;
  }
}

interface ClipboardHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
}

// ==================== COMPONENT ====================

export const ClipboardHistory: React.FC<ClipboardHistoryProps> = ({ isOpen, onClose, onSelect }) => {
  const entries = useClipboardEntries();
  const { remove, togglePin, clearUnpinned } = useClipboardActions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('');
  const captureRequest = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient UI each time the panel opens.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFilter('all');
      setSelectedIndex(0);
      setCapturing(false);
      setCaptureStatus('');
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => {
        clearTimeout(t);
        captureRequest.current?.abort();
        captureRequest.current = null;
      };
    }
  }, [isOpen]);

  const addFromClipboard = async () => {
    if (captureRequest.current) return;
    const request = new AbortController();
    captureRequest.current = request;
    setCapturing(true);
    setCaptureStatus('');
    try {
      const captured = await captureCurrentClipboard(request.signal);
      if (request.signal.aborted) return;
      if (captured) {
        setQuery('');
        setFilter('all');
        setSelectedIndex(0);
      }
      setCaptureStatus(captured ? 'Clipboard text added.' : 'No supported text on the clipboard.');
    } catch {
      if (!request.signal.aborted) setCaptureStatus('Could not read the clipboard.');
    } finally {
      if (captureRequest.current === request) {
        captureRequest.current = null;
        setCapturing(false);
      }
    }
  };

  // Filter (type chip) + search (content / source / language), pinned first.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter(e => matchesFilter(e, filter))
      .filter(e => !q
        || e.content.toLowerCase().includes(q)
        || (e.sourceAppName?.toLowerCase().includes(q) ?? false)
        || (e.language?.toLowerCase().includes(q) ?? false))
      .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
  }, [entries, filter, query]);

  // Keep selection in range as the list changes.
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const handleSelect = useCallback(async (entry: ClipEntry) => {
    await writeEntryToClipboard(entry);
    // Pasting a data URL into a text field is meaningless; for images we just
    // put the image back on the clipboard so the user can paste it elsewhere.
    if (entry.kind !== 'image') onSelect(entry.content);
    onClose();
  }, [onSelect, onClose]);

  const handleCopyOnly = useCallback(async (entry: ClipEntry) => {
    await writeEntryToClipboard(entry);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(c => (c === entry.id ? null : c)), 1200);
  }, []);

  // Hand a clip off to another app via DEX Flow. Closes the panel so the Flow
  // picker (a separate overlay) takes focus.
  const handleSend = useCallback((entry: ClipEntry) => {
    window.dispatchEvent(new CustomEvent('dex-flow-open', { detail: { payload: {
      kind: entry.kind, content: entry.content, source: entry.sourceAppId, label: entry.preview,
    } } }));
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, visible.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (visible[selectedIndex]) void handleSelect(visible[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Delete': {
        // Delete is also a text-editing key in the search field. Only repurpose
        // it for clip removal when forward-delete is a no-op on the query (caret
        // at the end, nothing selected) so typing/editing the search isn't hijacked.
        const input = e.target as HTMLInputElement;
        const caretAtEnd = input.selectionStart === input.value.length && input.selectionStart === input.selectionEnd;
        if (caretAtEnd && visible[selectedIndex]) { e.preventDefault(); remove(visible[selectedIndex].id); }
        break;
      }
    }
  }, [visible, selectedIndex, onClose, handleSelect, remove]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'var(--color-bg-elevated)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' },
    container: { width: '100%', maxWidth: '520px', background: 'var(--color-bg-elevated)', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    header: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' },
    headerIcon: { color: 'var(--color-text-muted)' },
    title: { flex: 1, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' },
    countBadge: { fontSize: '11px', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' },
    clearBtn: { padding: '4px var(--space-2)', background: 'var(--color-bg-glass)', border: 'none', borderRadius: '6px', fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'pointer' },
    searchWrapper: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)' },
    chips: { display: 'flex', gap: '6px', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' },
    chip: { padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' },
    chipActive: { background: 'var(--color-accent)', border: '1px solid var(--color-accent)', color: '#fff' },
    list: { maxHeight: '380px', overflow: 'auto' },
    item: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.1s' },
    itemSelected: { background: 'var(--color-accent)' },
    itemIcon: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-glass)', borderRadius: '6px', color: 'var(--color-text-muted)', flexShrink: 0, overflow: 'hidden' },
    swatch: { width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, border: '1px solid var(--color-border)' },
    thumb: { width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, border: '1px solid var(--color-border)', objectFit: 'cover' },
    itemContent: { flex: 1, minWidth: 0 },
    itemPreview: { fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    itemPreviewCode: { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: '12px' },
    itemMeta: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '11px', color: 'var(--color-text-muted)' },
    metaDot: { opacity: 0.5 },
    itemActions: { display: 'flex', gap: '4px', transition: 'opacity 0.15s' },
    actionBtn: { padding: '5px', background: 'var(--color-bg-glass)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    empty: { padding: '48px var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' },
    emptyIcon: { marginBottom: 'var(--space-3)', opacity: 0.5 },
    hint: { padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' },
  };

  const pinnedCount = entries.filter(e => e.pinned).length;

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.container} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>{Icons.clipboard}</span>
          <span style={styles.title}>Omni Clipboard</span>
          <span style={styles.countBadge}>{entries.length} {entries.length === 1 ? 'clip' : 'clips'}</span>
          <Button size="xs" loading={capturing} onClick={() => void addFromClipboard()}>Add clipboard text</Button>
          {entries.length > pinnedCount && (
            <button style={styles.clearBtn} onClick={() => clearUnpinned()} aria-label="Clear unpinned clips" title="Clear all except pinned">Clear</button>
          )}
        </div>
        {captureStatus && <div role="status" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 12 }}>{captureStatus}</div>}

        <div style={styles.searchWrapper}>
          <DexSearchInput
            ref={inputRef}
            placeholder="Search clips, source, or language"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onClear={() => { setQuery(''); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            fullWidth
          />
        </div>

        <div style={styles.chips}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              style={{ ...styles.chip, ...(filter === f.key ? styles.chipActive : {}) }}
              onClick={() => { setFilter(f.key); setSelectedIndex(0); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.list}>
          {visible.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>{Icons.clipboard}</div>
              <div>{entries.length === 0 ? 'No clipboard items' : 'No matching clips'}</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {entries.length === 0 ? 'Copy something to see it here' : 'Try a different filter or search'}
              </div>
            </div>
          ) : (
            visible.map((item, index) => {
              const isSelected = index === selectedIndex;
              const meta = KIND_META[item.kind];
              const kindLabel = item.kind === 'code' ? (item.language?.toUpperCase() || 'Code') : meta.label;
              const fg = isSelected ? '#fff' : undefined;
              return (
                <div
                  key={item.id}
                  style={{ ...styles.item, ...(isSelected ? styles.itemSelected : {}) }}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {item.kind === 'color' ? (
                    <div style={{ ...styles.swatch, background: item.content }} title={item.content} />
                  ) : item.kind === 'image' ? (
                    <img src={item.content} style={styles.thumb} alt="Clipboard image" />
                  ) : (
                    <div style={{ ...styles.itemIcon, background: isSelected ? 'var(--color-text-tertiary)' : styles.itemIcon.background, color: isSelected ? '#fff' : styles.itemIcon.color }}>
                      {meta.icon}
                    </div>
                  )}
                  <div style={styles.itemContent}>
                    <div style={{ ...styles.itemPreview, ...(item.kind === 'code' ? styles.itemPreviewCode : {}), color: fg ?? styles.itemPreview.color }}>
                      {item.preview}
                    </div>
                    <div style={{ ...styles.itemMeta, color: isSelected ? 'var(--color-text-secondary)' : styles.itemMeta.color }}>
                      {kindLabel && <span>{kindLabel}</span>}
                      {kindLabel && item.sourceAppName && <span style={styles.metaDot}>·</span>}
                      {item.sourceAppName && <span>{item.sourceAppName}</span>}
                      {(kindLabel || item.sourceAppName) && <span style={styles.metaDot}>·</span>}
                      <span>{formatTime(item.timestamp)}</span>
                      {item.pinned && <><span style={styles.metaDot}>·</span><span style={{ color: isSelected ? '#fff' : 'var(--color-accent)' }}>Pinned</span></>}
                    </div>
                  </div>
                  <div style={{ ...styles.itemActions, opacity: isSelected ? 1 : 0 }}>
                    <button
                      style={styles.actionBtn}
                      onClick={e => { e.stopPropagation(); handleSend(item); }}
                      title="Send to app"
                    >
                      {Icons.send}
                    </button>
                    <button
                      style={{ ...styles.actionBtn, color: copiedId === item.id ? 'var(--color-success)' : styles.actionBtn.color }}
                      onClick={e => { e.stopPropagation(); void handleCopyOnly(item); }}
                      title={copiedId === item.id ? 'Copied' : 'Copy'}
                    >
                      {Icons.copy}
                    </button>
                    <button
                      style={{ ...styles.actionBtn, color: item.pinned ? 'var(--color-accent)' : styles.actionBtn.color }}
                      onClick={e => { e.stopPropagation(); togglePin(item.id); }}
                      title={item.pinned ? 'Unpin' : 'Pin'}
                    >
                      {Icons.pin}
                    </button>
                    <button
                      style={styles.actionBtn}
                      onClick={e => { e.stopPropagation(); remove(item.id); }}
                      title="Delete"
                    >
                      {Icons.trash}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {visible.length > 0 && (
          <div style={styles.hint}>
            <span>Enter to paste</span>
            <span>Del to remove</span>
            <span>Esc to close</span>
          </div>
        )}
      </div>
    </div>
  );
};

/** Put a clip back on the OS clipboard -- a real image blob for image clips,
 *  text otherwise (with a graceful text fallback if image write is unsupported). */
async function writeEntryToClipboard(entry: ClipEntry): Promise<void> {
  if (entry.kind === 'image') {
    try {
      const blob = await (await fetch(entry.content)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      return;
    } catch { /* image clipboard unsupported -- fall through to text */ }
  }
  try { await navigator.clipboard.writeText(entry.content); } catch { /* clipboard unavailable */ }
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ==================== HOOK ====================

export const useClipboardHistory = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
};

export default memo(ClipboardHistory);
