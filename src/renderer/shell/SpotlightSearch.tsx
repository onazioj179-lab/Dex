// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Spotlight Search UI
 * Two variants: Home (600px embedded) and Overlay (680px modal, Cmd+K / Ctrl+K).
 * Spring-animated results, keyboard navigation, match highlighting,
 * category headings, sliding selection indicator.
 */

import React, { useState, useEffect, useId, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { spotlightEngine, type SpotlightResult, type SpotlightCategory, type HighlightSpan } from './SpotlightEngine';
import { SPRING_PRESETS, SpringAnimator, isReduceMotion } from '../utils/MotionController';
import { openAppContextMenu } from '../components/AppContextMenu';
import DexIcon from '../components/DexIcon';
import { platform } from '../utils';
import { DexSearchInput } from '../styles/components';

// ---------------------------------------------------------------------------
// CATEGORY LABELS & ICONS
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<SpotlightCategory, string> = {
  top: 'Top Result',
  recent: 'Recent',
  apps: 'Apps',
  windows: 'Open Windows',
  settings: 'Settings',
  notes: 'Notes',
  tasks: 'Tasks',
  files: 'Files',
  projects: 'Projects',
  workflows: 'Workflows',
  commands: 'Commands',
  clipboard: 'Clipboard',
  screenshots: 'Screenshots',
  conversations: 'Conversations',
  actions: 'Actions',
  calculator: 'Calculator',
  web: 'Web Search',
};

const CATEGORY_ORDER: SpotlightCategory[] = [
  'top', 'calculator', 'windows', 'apps', 'settings', 'recent',
  'notes', 'tasks', 'files', 'projects', 'workflows',
  'commands', 'clipboard', 'screenshots', 'conversations', 'actions', 'web',
];

const CategoryIcon: React.FC<{ category: SpotlightCategory }> = memo(({ category }) => {
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  switch (category) {
    case 'top':
      return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'calculator':
      return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>;
    case 'apps':
      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'windows':
      return <svg {...props}><rect x="3" y="5" width="13" height="10" rx="1.5"/><path d="M8 19h11a2 2 0 002-2V9"/></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    case 'recent':
      return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'notes':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'tasks':
      return <svg {...props}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'files':
      return <svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case 'projects':
      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="18" width="7" height="3" rx="1"/></svg>;
    case 'workflows':
      return <svg {...props}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/></svg>;
    case 'commands':
      return <svg {...props}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case 'clipboard':
      return <svg {...props}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>;
    case 'screenshots':
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    case 'conversations':
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'actions':
      return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'web':
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    default:
      return <svg {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
  }
});
CategoryIcon.displayName = 'CategoryIcon';

// ---------------------------------------------------------------------------
// HIGHLIGHTED TEXT
// ---------------------------------------------------------------------------

const HighlightedText: React.FC<{ text: string; highlights: HighlightSpan[] }> = memo(({ text, highlights }) => {
  if (highlights.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  for (const h of sorted) {
    if (h.start > lastEnd) {
      parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd, h.start)}</span>);
    }
    parts.push(
      <span key={`h-${h.start}`} style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
        {text.slice(h.start, h.end)}
      </span>
    );
    lastEnd = h.end;
  }
  if (lastEnd < text.length) {
    parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
});
HighlightedText.displayName = 'HighlightedText';

// ---------------------------------------------------------------------------
// RESULT ITEM (44px tall with sliding selection)
// ---------------------------------------------------------------------------

const ResultItem: React.FC<{
  result: SpotlightResult;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
  id?: string;
}> = memo(({ result, isSelected, onClick, onHover, id }) => {
  // App results get the shared app menu (pin/unpin, quick actions, info).
  const appId = result.id.startsWith('action-launch-') ? result.id.slice('action-launch-'.length) : null;
  return (
    <button
      id={id}
      onClick={onClick}
      onContextMenu={appId ? (e) => { e.preventDefault(); e.stopPropagation(); openAppContextMenu({ appId, x: e.clientX, y: e.clientY, source: 'search' }); } : undefined}
      onMouseDown={e => e.preventDefault()}
      // mousemove, not mouseenter: a list scrolling under a still pointer must
      // not steal the keyboard selection.
      onMouseMove={isSelected ? undefined : onHover}
      aria-selected={isSelected}
      role="option"
      style={{
        display: 'flex', alignItems: 'center',
        width: '100%', height: 38, padding: '0 10px',
        background: isSelected ? 'color-mix(in srgb, var(--color-accent, #0A84FF) 18%, transparent)' : 'transparent',
        border: 'none', borderRadius: 14, cursor: 'pointer',
        transition: isReduceMotion() ? 'none' : 'background 0.12s ease',
        position: 'relative', gap: 10,
        textAlign: 'left',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 26, height: 26, borderRadius: 10,
        background: result.color ? `${result.color}1f` : 'var(--color-bg-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: isSelected ? 'var(--color-accent, #0A84FF)' : 'var(--color-text-secondary)',
        transition: 'color 0.1s ease',
      }}>
        <CategoryIcon category={result.category} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 13, fontWeight: isSelected ? 500 : 400,
          color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <HighlightedText text={result.title} highlights={result.highlights} />
        </div>
        {result.subtitle && (
          <div style={{
            fontSize: 11, color: isSelected ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            {result.subtitle}
          </div>
        )}
      </div>

      {/* Category badge for top result */}
      {result.category === 'top' && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: isSelected ? 'var(--color-text-primary)' : 'var(--color-accent)',
          opacity: 0.7, flexShrink: 0, letterSpacing: '0.01em',
          textTransform: 'none',
        }}>
          Top
        </span>
      )}

      {/* Enter hint when selected */}
      {isSelected && (
        <span style={{
          fontSize: 10, color: 'var(--color-text-secondary)',
          flexShrink: 0, display: 'inline-flex',
        }}>
          <DexIcon name="corner-down-left" size={10} />
        </span>
      )}
    </button>
  );
});
ResultItem.displayName = 'ResultItem';

// ---------------------------------------------------------------------------
// GROUP RESULTS BY CATEGORY
// ---------------------------------------------------------------------------

interface ResultGroup {
  category: SpotlightCategory;
  results: SpotlightResult[];
}

function groupResults(results: SpotlightResult[]): ResultGroup[] {
  const groups = new Map<SpotlightCategory, SpotlightResult[]>();

  for (const r of results) {
    const cat = r.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  const ordered: ResultGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = groups.get(cat);
    if (items && items.length > 0) {
      ordered.push({ category: cat, results: items });
    }
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// SPOTLIGHT SEARCH BAR (shared between Home & Overlay)
// ---------------------------------------------------------------------------

// VOICE MIC BUTTON — Web Speech API for hands-free search
// Declared BEFORE SpotlightSearch so it's safely in scope under Fast Refresh.
interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
}

const VoiceMicButton: React.FC<VoiceMicButtonProps> = memo(({ onTranscript }) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const supportedRef = useRef<boolean>(typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supportedRef.current) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Voice search not available in this build' } }));
      return;
    }
    try {
      const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        const t = e?.results?.[0]?.[0]?.transcript;
        if (t) onTranscript(String(t).trim());
      };
      rec.onerror = (e: any) => {
        const err = e?.error || 'unknown';
        const msg = err === 'not-allowed' || err === 'service-not-allowed'
          ? 'Microphone permission denied. Allow it in your browser/OS to use voice search.'
          : err === 'no-speech'
          ? 'No speech detected. Try again.'
          : err === 'network'
          ? 'Voice search needs an internet connection.'
          : `Voice search error: ${err}`;
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: msg } }));
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      // Tell the user we're listening so the click isn't silent
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Listening… speak now', duration: 1500 } }));
    } catch (err: any) {
      console.warn('[Spotlight] voice search failed:', err);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Voice search is not available right now. Please try again.' } }));
      setListening(false);
    }
  }, [onTranscript]);

  useEffect(() => () => { try { recognitionRef.current?.abort(); } catch { /* ignore */ } }, []);

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={listening ? 'Stop voice search' : 'Start voice search'}
      title={listening ? 'Listening… click to stop' : 'Voice search'}
      style={{
        width: 28, height: 28, borderRadius: 14,
        background: listening ? 'var(--color-error, rgba(255,69,58,0.95))' : 'rgba(120,120,128,0.24)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: listening ? '#fff' : 'rgba(235,235,245,0.85)',
        transition: 'background 0.15s ease, transform 0.15s ease',
        flexShrink: 0,
        boxShadow: listening ? '0 0 0 4px color-mix(in srgb, var(--color-error, #FF453A) 18%, transparent)' : 'none',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>
  );
});

VoiceMicButton.displayName = 'VoiceMicButton';

interface SpotlightProps {
  variant: 'home' | 'overlay';
  isOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (appId: string) => void;
  /** Fires when the results dropdown opens or closes (variant=home). */
  onResultsOpenChange?: (open: boolean) => void;
  /** home variant: pill height (default 50 hero; pass ~32 for a compact dock field). */
  pillHeight?: number;
  /** home variant: drop the results UP instead of down (for a bottom-docked bar). */
  dropUp?: boolean;
  /** home variant: placeholder text (default "Search"). */
  placeholder?: string;
  /** home variant: hide the built-in voice mic (e.g. in the dock, where the
   *  adjacent UKI button is already the mic/voice entry -- avoids two mics). */
  hideVoice?: boolean;
}

export const SpotlightSearch: React.FC<SpotlightProps> = memo(({ variant, isOpen, onClose, onNavigate, onResultsOpenChange, pillHeight, dropUp, placeholder, hideVoice }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const resultsId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ left: number; width: number; height: number; above: boolean }>();
  // Notify parent whenever the results panel toggles.
  React.useEffect(() => { onResultsOpenChange?.(showResults); }, [showResults, onResultsOpenChange]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleSpring = useRef<SpringAnimator | null>(null);
  // Mirror the live query so the engine's async refresh callback (registered
  // once on mount) always reads the CURRENT query, not the empty string it
  // closed over at mount. Without this, async deep-search results (files, host,
  // screenshots, conversations) are indexed but never rendered until the next
  // keystroke re-runs search().
  const queryRef = useRef('');

  // Flatten results for keyboard nav
  const flatResults = useMemo(() => {
    const groups = groupResults(results);
    const flat: SpotlightResult[] = [];
    for (const group of groups) {
      flat.push(...group.results);
    }
    return flat;
  }, [results]);

  const groupedResults = useMemo(() => groupResults(results), [results]);

  // Initialize engine on mount
  useEffect(() => {
    spotlightEngine.start(() => {
      const q = queryRef.current;
      if (q.trim()) {
        setResults(spotlightEngine.search(q));
      }
    });
    return () => spotlightEngine.destroy();
  }, []);

  // Spring animation for overlay open
  useEffect(() => {
    if (variant !== 'overlay' || !containerRef.current) return;

    if (isOpen) {
      const el = containerRef.current;
      if (!isReduceMotion()) {
        scaleSpring.current?.destroy();
        const spring = new SpringAnimator(
          { stiffness: 580, damping: 42, mass: 0.55 },
          0.94
        );
        spring.onUpdate((v) => {
          el.style.transform = `scale(${v})`;
          el.style.opacity = String(Math.min(1, (v - 0.94) / 0.06));
        });
        spring.onComplete(() => {
          el.style.transform = 'scale(1)';
          el.style.opacity = '1';
        });
        scaleSpring.current = spring;
        spring.setTarget(1);
      }
      inputRef.current?.focus();
    }

    return () => {
      scaleSpring.current?.destroy();
      scaleSpring.current = null;
    };
  }, [isOpen, variant]);

  // Focus input on overlay open
  useEffect(() => {
    if (variant === 'overlay' && isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, variant]);

  // Focus input on home mount
  useEffect(() => {
    if (variant === 'home') {
      // Load recent results on mount
      setResults(spotlightEngine.search(''));
    }
  }, [variant]);

  useEffect(() => {
    if (variant !== 'home') return;
    const focusHomeSearch = () => {
      inputRef.current?.focus();
      setShowResults(true);
      setResults(spotlightEngine.search(query));
    };
    window.addEventListener('dex:open-spotlight', focusHomeSearch);
    return () => window.removeEventListener('dex:open-spotlight', focusHomeSearch);
  }, [variant, query]);

  // Search handler with debounce — 150ms delay prevents regenerating 100+ items on every keystroke
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const cancelSearch = useCallback(() => {
    searchSeq.current++;
    if (searchTimeout.current !== null) clearTimeout(searchTimeout.current);
  }, []);
  useEffect(() => cancelSearch, [cancelSearch]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    queryRef.current = value;
    setSelectedIndex(0);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    // Immediate search for very short queries (navigation), 150ms debounce for longer (search)
    const delay = value.length <= 2 ? 0 : 150;
    const seq = ++searchSeq.current;
    searchTimeout.current = setTimeout(() => {
      if (seq !== searchSeq.current) return;
      const r = spotlightEngine.search(value);
      setResults(r);
      setShowResults(r.length > 0 || value.length > 0);
    }, delay);
  }, []);

  // Execute the selected result
  const executeResult = useCallback((result: SpotlightResult) => {
    spotlightEngine.recordSelection(query, result.id);
    result.action();

    // If the action dispatches a navigate event, we'll handle it
    if (onNavigate) {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.appId) {
          onNavigate(detail.appId);
        }
      };
      window.addEventListener('dex-spotlight-navigate', handler, { once: true });
      // Auto-cleanup after 100ms
      setTimeout(() => window.removeEventListener('dex-spotlight-navigate', handler), 100);
    }

    if (variant === 'overlay') {
      onClose?.();
    }

    cancelSearch();
    setQuery('');
    queryRef.current = '';
    setResults([]);
    setShowResults(false);
  }, [query, variant, onClose, onNavigate, cancelSearch]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const pageSize = 5; // Number of items to jump on Page Up/Down
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'PageDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + pageSize, flatResults.length - 1));
        break;
      case 'PageUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - pageSize, 0));
        break;
      // Plain Home/End move the text cursor in the search field; with Ctrl they
      // jump to the first/last result.
      case 'Home':
        if (!(e.ctrlKey || e.metaKey)) break;
        e.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        if (!(e.ctrlKey || e.metaKey)) break;
        e.preventDefault();
        setSelectedIndex(flatResults.length - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        // The list may have shrunk since the selection was made.
        const target = flatResults[Math.min(selectedIndex, flatResults.length - 1)];
        if (target) executeResult(target);
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        cancelSearch();
        if (query) {
          setQuery('');
          queryRef.current = '';
          setResults(spotlightEngine.search(''));
          setShowResults(false);
        } else if (variant === 'overlay') onClose?.();
        else setShowResults(false);
        break;
      case 'Tab':
        if (variant !== 'overlay' || !flatResults.length) break;
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex(i => Math.max(i - 1, 0));
        } else {
          setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        }
        break;
    }
  }, [flatResults, selectedIndex, executeResult, query, variant, onClose, cancelSearch]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && flatResults.length > 0) {
      const items = resultsRef.current.querySelectorAll('[role="option"]');
      const item = items[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: isReduceMotion() ? 'auto' : 'smooth' });
      }
    }
  }, [selectedIndex, flatResults.length]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !showResults) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8));
      const aboveRoom = rect.top - 16;
      const belowRoom = window.innerHeight - rect.bottom - 16;
      const above = dropUp ? aboveRoom > 100 || aboveRoom >= belowRoom : belowRoom < 100 && aboveRoom > belowRoom;
      setPopup({ left: left - rect.left, width, height: Math.max(0, Math.min(320, above ? aboveRoom : belowRoom)), above });
    };
    position();
    window.addEventListener('resize', position);
    const observer = new ResizeObserver(position);
    observer.observe(anchor);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [dropUp, showResults]);

  // -----------------------------------------------------------------------
  // HOME VARIANT: Embedded search bar with dropdown results
  // -----------------------------------------------------------------------
  if (variant === 'home') {
    // Compact/height + drop-direction are parameterized so the same field works
    // as the Home hero (50px, drops down) AND as the bottom-docked launcher
    // search (~32px, drops UP so results don't run off the bottom of the screen).
    const ph = pillHeight ?? 50;
    const dropStyle: React.CSSProperties = popup?.above ? { bottom: ph + 8 } : { top: ph + 8 };
    return (
      <div ref={anchorRef} data-dex-spotlight
        onBlur={event => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          cancelSearch();
          setShowResults(false);
        }}
        style={{ width: '100%', maxWidth: 560, position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
        <DexSearchInput ref={inputRef} size={ph < 44 ? 'md' : 'lg'} fullWidth reserveClearSpace
          style={{ height: ph }}
          value={query}
          onChange={event => handleSearch(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setResults(spotlightEngine.search(queryRef.current));
            setShowResults(true);
          }}
          onClear={() => { handleSearch(''); inputRef.current?.focus(); }}
          placeholder={placeholder ?? 'Search'}
          aria-label="Spotlight Search"
          role="combobox"
          aria-expanded={showResults && Boolean(flatResults.length || query.trim())}
          aria-controls={showResults && (flatResults.length || query.trim()) ? resultsId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showResults && flatResults[Math.min(selectedIndex, flatResults.length - 1)]
            ? `${resultsId}-${Math.min(selectedIndex, flatResults.length - 1)}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {!hideVoice && <VoiceMicButton onTranscript={text => { inputRef.current?.focus(); handleSearch(text); }} />}

        {/* Scrollable results dropdown */}
        {showResults && popup && Boolean(flatResults.length || query.trim()) && (
          <div
            ref={resultsRef}
            id={resultsId}
            role="listbox"
            aria-label="Search results"
            className="spotlight-results-scroll"
            onMouseDown={e => e.preventDefault()}
            style={{
              // Floating surface wider than the dock field, centred on it.
              position: 'absolute', left: popup.left, width: popup.width, ...dropStyle,
              height: popup.height, overflowY: 'auto', overflowX: 'hidden',
              scrollbarGutter: 'stable',
              // Liquid glass (master overhaul) -- the strong variant: translucent
              // enough to bloom the wallpaper/content behind it, opaque enough that
              // result text stays readable. Falls back to solid on weak GPUs /
              // reduced-transparency via the shared token + universal low-tier rule.
              background: 'var(--color-bg-glass-strong, rgba(16,16,20,0.86))',
              backdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
              WebkitBackdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
              borderRadius: 18,
              boxShadow: 'var(--pg-shadow-popover-strong), var(--pg-gloss-top)',
              padding: 6,
              boxSizing: 'border-box',
            }}
          >
            {!flatResults.length && <div role="status" style={{ padding: 12, color: 'var(--color-text-secondary)' }}>No results found</div>}
            {groupedResults.map(group => (
              <div key={group.category}>
                <div style={{
                  padding: '8px 10px 2px', fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                }}>
                  {CATEGORY_LABELS[group.category]}
                </div>
                {group.results.map((result, i) => {
                  const globalIndex = flatResults.indexOf(result);
                  return (
                    <ResultItem
                      key={result.id}
                      id={`${resultsId}-${globalIndex}`}
                      result={result}
                      isSelected={globalIndex === selectedIndex}
                      onClick={() => executeResult(result)}
                      onHover={() => setSelectedIndex(globalIndex)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // OVERLAY VARIANT: Modal with backdrop
  // -----------------------------------------------------------------------
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — light dim so desktop stays visible */}
      <div
        onMouseDown={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-spotlight)',
          background: 'rgba(0,0,0,0.25)',
          animation: isReduceMotion() ? 'none' : 'fadeIn 0.1s ease-out',
        }}
      />

      {/* Search container — rolls out from the dock (bottom-right) rather than a
          centered modal, so it appears right where the user clicked the dock
          Search button instead of jumping to the middle of the screen. */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-spotlight)',
        display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end',
        padding: '0 24px 104px 24px', pointerEvents: 'none',
      }}>
      <div
        ref={containerRef}
        style={{
          transformOrigin: 'bottom right',
          animation: isReduceMotion() ? 'none' : 'dexSpotlightRollOut 0.2s cubic-bezier(0.2,0.9,0.3,1)',
          pointerEvents: 'auto',
          width: 'min(600px, 92vw)',
          maxHeight: 'min(540px, 72vh)',
          display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
          // Master overhaul: glass search overlay (Part 3.7).
          background: 'var(--glass-bg, rgba(12,12,12,0.85))',
          backdropFilter: 'var(--glass-blur, blur(24px))',
          WebkitBackdropFilter: 'var(--glass-blur, blur(24px))',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.07))',
          // Floating capsule: outer 24, inner input 18 (24 - 6 padding), rows 14.
          borderRadius: 24,
          boxShadow: 'var(--pg-shadow-modal)',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div data-testid="spotlight-capsule" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 48, padding: '0 8px 0 16px', borderRadius: 18,
          background: 'var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search apps, files, projects, settings"
            aria-label="Spotlight Search"
            role="combobox"
            aria-expanded={flatResults.length > 0}
            aria-haspopup="listbox"
            aria-controls="spotlight-results-overlay"
            aria-activedescendant={flatResults.length > 0 ? `spotlight-result-${selectedIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, height: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)',
              fontSize: 16, fontWeight: 400,
              fontFamily: 'var(--font-family)',
              letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); handleSearch(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              style={{
                width: 28, height: 28, borderRadius: 14,
                background: 'var(--color-bg-active)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Scrollable results list */}
        {flatResults.length > 0 && (
          <div
            ref={resultsRef}
            id="spotlight-results-overlay"
            role="listbox"
            aria-label="Search results"
            className="spotlight-results-scroll"
            style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              scrollBehavior: 'smooth',
              padding: '0 2px 2px',
            }}
          >
            {groupedResults.map(group => (
              <div key={group.category}>
                <div style={{
                  padding: '8px 10px 2px', fontSize: 11, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                }}>
                  {CATEGORY_LABELS[group.category]}
                </div>
                {group.results.map(result => {
                  const globalIndex = flatResults.indexOf(result);
                  return (
                    <ResultItem
                      key={result.id}
                      id={`spotlight-result-${globalIndex}`}
                      result={result}
                      isSelected={globalIndex === selectedIndex}
                      onClick={() => executeResult(result)}
                      onHover={() => setSelectedIndex(globalIndex)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && flatResults.length === 0 && (
          <div style={{
            padding: 'var(--space-8) var(--space-5)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No results for "{query}"</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5, marginTop: 4 }}>Try a different search term.</div>
          </div>
        )}

        {/* Footer hints */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '4px var(--space-4) 2px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {[
            { keys: ['↑', '↓'], label: 'Navigate' },
            { keys: ['↵'], label: 'Open' },
            { keys: [platform.isMac ? '⌘K' : 'Ctrl+K'], label: 'Search' },
            { keys: ['Esc'], label: 'Close' },
          ].map(hint => (
            <div key={hint.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {hint.keys.map(k => (
                <kbd key={k} style={{
                  padding: '1px 5px', fontSize: 10,
                  background: 'var(--color-bg-hover)',
                  border: 'none',
                  borderRadius: 6, color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-family)',
                  lineHeight: '14px',
                }}>{k}</kbd>
              ))}
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{hint.label}</span>
            </div>
          ))}
          </div>
        </div>
      </div>
      </div>

      {/* Keyframe + scrollbar injection */}
      <style>{`
        @keyframes spotlightResultsIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .spotlight-results-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .spotlight-results-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .spotlight-results-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 2px;
        }
        .spotlight-results-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--color-text-tertiary);
        }
      `}</style>
    </>
  );
});

SpotlightSearch.displayName = 'SpotlightSearch';
export default SpotlightSearch;
