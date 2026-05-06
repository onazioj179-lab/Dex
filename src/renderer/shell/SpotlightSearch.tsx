// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Spotlight Search UI
 * Two variants: Home (600px embedded) and Overlay (680px modal, Ctrl+Space).
 * Spring-animated results, keyboard navigation, match highlighting,
 * category headings, sliding selection indicator.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { spotlightEngine, type SpotlightResult, type SpotlightCategory, type HighlightSpan } from './SpotlightEngine';
import { SPRING_PRESETS, SpringAnimator, isReduceMotion } from '../utils/MotionController';
import DexIcon from '../components/DexIcon';

// ---------------------------------------------------------------------------
// CATEGORY LABELS & ICONS
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<SpotlightCategory, string> = {
  top: 'Top Result',
  recent: 'Recent',
  apps: 'Apps',
  settings: 'Settings',
  notes: 'Notes',
  tasks: 'Tasks',
  files: 'Files',
  actions: 'Actions',
  calculator: 'Calculator',
  web: 'Web Search',
};

const CATEGORY_ORDER: SpotlightCategory[] = [
  'top', 'calculator', 'apps', 'settings', 'recent', 'notes', 'tasks', 'files', 'actions', 'web',
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
  return (
    <button
      id={id}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      onMouseEnter={onHover}
      aria-selected={isSelected}
      role="option"
      style={{
        display: 'flex', alignItems: 'center',
        width: '100%', height: 40, padding: '0 10px',
        background: isSelected ? 'rgba(59,130,246,0.35)' : 'transparent',
        border: 'none', borderRadius: 10, cursor: 'pointer',
        transition: isReduceMotion() ? 'none' : 'background 0.15s ease, transform 0.12s ease',
        position: 'relative', gap: 10,
        textAlign: 'left',
        transform: isSelected ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: isSelected ? 'var(--color-border)' : (result.color ? `${result.color}18` : 'var(--color-bg-hover)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: isSelected ? '#fff' : 'var(--color-text-secondary)',
        transition: 'background 0.1s ease, color 0.1s ease',
      }}>
        <CategoryIcon category={result.category} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 13, fontWeight: isSelected ? 500 : 400,
          color: isSelected ? '#fff' : 'var(--color-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.1s ease',
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
          opacity: 0.7, flexShrink: 0, letterSpacing: '0.04em',
          textTransform: 'uppercase',
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

interface SpotlightProps {
  variant: 'home' | 'overlay';
  isOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (appId: string) => void;
}

export const SpotlightSearch: React.FC<SpotlightProps> = memo(({ variant, isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleSpring = useRef<SpringAnimator | null>(null);

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
      if (query.trim()) {
        setResults(spotlightEngine.search(query));
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
          el.style.transform = `translateX(-50%) scale(${v})`;
          el.style.opacity = String(Math.min(1, (v - 0.94) / 0.06));
        });
        spring.onComplete(() => {
          el.style.transform = 'translateX(-50%) scale(1)';
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, variant]);

  // Focus input on home mount
  useEffect(() => {
    if (variant === 'home') {
      // Load recent results on mount
      setResults(spotlightEngine.search(''));
    }
  }, [variant]);

  // Search handler with debounce — 150ms delay prevents regenerating 100+ items on every keystroke
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
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

    setQuery('');
    setResults([]);
    setShowResults(false);
  }, [query, variant, onClose, onNavigate]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
      case 'Home':
        e.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setSelectedIndex(flatResults.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          executeResult(flatResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (query) {
          setQuery('');
          setResults(spotlightEngine.search(''));
          setShowResults(false);
        } else if (variant === 'overlay') {
          onClose?.();
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex(i => Math.max(i - 1, 0));
        } else {
          setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        }
        break;
    }
  }, [flatResults, selectedIndex, executeResult, query, variant, onClose]);

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

  // -----------------------------------------------------------------------
  // HOME VARIANT: Embedded search bar with dropdown results
  // -----------------------------------------------------------------------
  if (variant === 'home') {
    return (
      <div style={{ width: '100%', maxWidth: 680, position: 'relative' }}>
        {/* Search Bar — wide Tahoe-style pill with refined glass */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 50, padding: '0 22px',
          background: 'var(--color-bg-hover)',
          border: '1px solid var(--color-border)',
          borderRadius: 28,
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
          boxShadow: showResults
            ? '0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px var(--color-border-subtle), inset 0 0.5px 0 var(--color-bg-hover)'
            : '0 2px 12px rgba(0,0,0,0.2), inset 0 0.5px 0 var(--color-border-subtle)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => { 
              setShowResults(true); 
              if (!query) setResults(spotlightEngine.search('')); 
              // Prevent text selection on focus
              e.currentTarget.selectionStart = e.currentTarget.selectionEnd = e.currentTarget.value.length;
            }}
            onBlur={() => setTimeout(() => setShowResults(false), 300)}
            placeholder="Search"
            aria-label="Spotlight Search"
            role="combobox"
            aria-expanded={showResults}
            aria-haspopup="listbox"
            aria-controls="spotlight-results-home"
            aria-activedescendant={showResults && flatResults.length > 0 ? `spotlight-result-home-${selectedIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, height: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)',
              fontSize: 15, fontWeight: 400,
              fontFamily: 'var(--font-family)',
              letterSpacing: '-0.01em',
              caretColor: 'var(--color-accent)',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); handleSearch(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="dex-hover-bg"
              style={{
                width: 20, height: 20, borderRadius: 10,
                background: 'var(--color-border)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                transition: 'background 0.12s ease',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Scrollable results dropdown */}
        {showResults && flatResults.length > 0 && (
          <div
            ref={resultsRef}
            id="spotlight-results-home"
            role="listbox"
            aria-label="Search results"
            className="spotlight-results-scroll"
            onMouseDown={e => e.preventDefault()}
            style={{
              position: 'absolute', top: 58, left: 0, right: 0,
              maxHeight: 420, overflowY: 'auto', overflowX: 'hidden',
              scrollBehavior: 'smooth',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 18,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px var(--color-border-subtle)',
              padding: '4px',
              animation: isReduceMotion() ? 'none' : 'spotlightResultsIn 0.12s ease-out',
            }}
          >
            {groupedResults.map(group => (
              <div key={group.category}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px 3px',
                  fontSize: 10, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  <CategoryIcon category={group.category} />
                  {CATEGORY_LABELS[group.category]}
                </div>
                {group.results.map((result, i) => {
                  const globalIndex = flatResults.indexOf(result);
                  return (
                    <ResultItem
                      key={result.id}
                      id={`spotlight-result-home-${globalIndex}`}
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
          position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
          background: 'rgba(0,0,0,0.25)',
          animation: isReduceMotion() ? 'none' : 'fadeIn 0.1s ease-out',
        }}
      />

      {/* Search container */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: '16vh',
          left: '50%',
          transform: 'translateX(-50%) scale(1)',
          zIndex: 'var(--z-max)',
          width: 'min(640px, 90vw)',
          maxHeight: 520,
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-bg-surface-solid, #141416)',
          border: '1px solid var(--color-border)',
          borderRadius: 22,
          boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px var(--color-bg-hover), inset 0 1px 0 var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          height: 52, padding: '0 18px',
          borderBottom: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search apps, settings, files, actions..."
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
                width: 22, height: 22, borderRadius: 11,
                background: 'var(--color-border)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-secondary)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <kbd style={{
            fontSize: 10, padding: '2px 6px',
            background: 'var(--color-bg-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: 5, color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-family)',
            flexShrink: 0,
          }}>Esc</kbd>
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
              padding: '4px',
            }}
          >
            {groupedResults.map(group => (
              <div key={group.category}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px 3px',
                  fontSize: 10, fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  <CategoryIcon category={group.category} />
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
            padding: '32px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No results for "{query}"</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5, marginTop: 4 }}>Xenon is searching deeper — try a different term or check the web</div>
          </div>
        )}

        {/* Footer hints */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px',
          borderTop: '1px solid var(--color-bg-hover)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', fontWeight: 500 }}>
            Powered by Xenon
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {[
            { keys: ['↑', '↓'], label: 'Navigate' },
            { keys: ['↵'], label: 'Open' },
            { keys: ['Esc'], label: 'Close' },
          ].map(hint => (
            <div key={hint.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {hint.keys.map(k => (
                <kbd key={k} style={{
                  padding: '1px 5px', fontSize: 10,
                  background: 'var(--color-bg-hover)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 4, color: 'var(--color-text-tertiary)',
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
          border-radius: 3px;
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
