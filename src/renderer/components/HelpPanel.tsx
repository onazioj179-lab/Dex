/**
 * DEX Global Help Panel
 * Slides in from the right. Tabs: Guide | Shortcuts.
 * Searchable. Non-blocking overlay.
 * Triggered by ? button in top-right or keyboard ?.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getHelpContent, type AppHelpContent, type HelpGuideEntry, type HelpShortcut } from '../services/helpContent';

// ==================== STYLES ====================
const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 9990,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(2px)',
    transition: 'opacity 0.2s ease',
  },
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 360,
    zIndex: 9991,
    background: 'var(--color-bg-secondary, #1e1e1e)',
    borderLeft: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary, #f4f4f5)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-tertiary, #71717a)',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    borderRadius: 6,
  },
  searchWrap: {
    padding: '12px 20px',
    flexShrink: 0,
  },
  searchInput: {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--color-bg-tertiary, #2a2a2c)',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 8,
    color: 'var(--color-text-primary, #f4f4f5)',
    fontSize: 13,
    outline: 'none',
  },
  tabs: {
    display: 'flex',
    gap: 0,
    padding: '0 20px',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--color-text-tertiary, #71717a)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center' as const,
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: 'var(--color-accent, #007aff)',
    borderBottomColor: 'var(--color-accent, #007aff)',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px',
  },
  guideItem: {
    marginBottom: 16,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-primary, #f4f4f5)',
    marginBottom: 4,
  },
  guideBody: {
    fontSize: 12,
    lineHeight: 1.55,
    color: 'var(--color-text-secondary, #a1a1aa)',
  },
  shortcutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.04))',
  },
  shortcutAction: {
    fontSize: 12,
    color: 'var(--color-text-secondary, #a1a1aa)',
  },
  kbd: {
    fontSize: 11,
    padding: '2px 7px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    color: 'var(--color-text-primary, #d4d4d8)',
    fontFamily: '"SF Mono", "JetBrains Mono", monospace',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  empty: {
    textAlign: 'center' as const,
    padding: 32,
    color: 'var(--color-text-tertiary, #71717a)',
    fontSize: 12,
  },
};

// ==================== COMPONENT ====================
interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  appId: string;
}

const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose, appId }) => {
  const [tab, setTab] = useState<'guide' | 'shortcuts'>('guide');
  const [search, setSearch] = useState('');

  const content: AppHelpContent | null = useMemo(() => getHelpContent(appId), [appId]);

  // Reset search when opening
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filteredGuide: HelpGuideEntry[] = useMemo(() => {
    if (!content) return [];
    if (!search.trim()) return content.guide;
    const q = search.toLowerCase();
    return content.guide.filter(g => g.title.toLowerCase().includes(q) || g.body.toLowerCase().includes(q));
  }, [content, search]);

  const filteredShortcuts: HelpShortcut[] = useMemo(() => {
    if (!content) return [];
    if (!search.trim()) return content.shortcuts;
    const q = search.toLowerCase();
    return content.shortcuts.filter(s => s.key.toLowerCase().includes(q) || s.action.toLowerCase().includes(q));
  }, [content, search]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={S.backdrop} onClick={onClose} />

      {/* Panel */}
      <div style={{ ...S.panel, transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>{content?.displayName || 'Help'}</span>
          <button onClick={onClose} style={S.closeBtn} title="Close (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={S.searchWrap}>
          <input
            type="text"
            placeholder="Search help..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
            autoFocus
          />
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          <button
            onClick={() => setTab('guide')}
            style={{ ...S.tab, ...(tab === 'guide' ? S.tabActive : {}) }}
          >
            Guide
          </button>
          <button
            onClick={() => setTab('shortcuts')}
            style={{ ...S.tab, ...(tab === 'shortcuts' ? S.tabActive : {}) }}
          >
            Shortcuts
          </button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {tab === 'guide' ? (
            filteredGuide.length > 0 ? (
              filteredGuide.map((g, i) => (
                <div key={i} style={S.guideItem}>
                  <div style={S.guideTitle}>{g.title}</div>
                  <div style={S.guideBody}>{g.body}</div>
                </div>
              ))
            ) : (
              <div style={S.empty}>No matching guide entries</div>
            )
          ) : (
            filteredShortcuts.length > 0 ? (
              filteredShortcuts.map((s, i) => (
                <div key={i} style={S.shortcutRow}>
                  <span style={S.shortcutAction}>{s.action}</span>
                  <kbd style={S.kbd}>{s.key}</kbd>
                </div>
              ))
            ) : (
              <div style={S.empty}>No matching shortcuts</div>
            )
          )}
        </div>
      </div>
    </>
  );
};

// ==================== HELP BUTTON ====================
export const HelpButton: React.FC<{ onClick: () => void; style?: React.CSSProperties }> = ({ onClick, style }) => (
  <button
    onClick={onClick}
    title="Help (?)"
    style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
      background: 'var(--color-bg-tertiary, rgba(255,255,255,0.06))',
      color: 'var(--color-text-secondary, #a1a1aa)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      fontFamily: 'inherit',
      flexShrink: 0,
      transition: 'background 0.15s, color 0.15s',
      ...style,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'var(--color-accent, #007aff)';
      e.currentTarget.style.color = '#fff';
      e.currentTarget.style.borderColor = 'var(--color-accent, #007aff)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'var(--color-bg-tertiary, rgba(255,255,255,0.06))';
      e.currentTarget.style.color = 'var(--color-text-secondary, #a1a1aa)';
      e.currentTarget.style.borderColor = 'var(--color-border, rgba(255,255,255,0.15))';
    }}
  >
    ?
  </button>
);

// ==================== HOOK ====================
export function useHelpPanel(appId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(v => !v), []);

  // Listen for ? key at app level
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { isOpen, open, close, toggle, appId };
}

// ==================== TOOLTIP ====================
interface TooltipProps {
  text: string;
  children: React.ReactElement;
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, delay = 1500 }) => {
  const [visible, setVisible] = useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '5px 10px',
            background: 'var(--color-bg-elevated, #1c1c1e)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            color: 'var(--color-text-primary, #e4e4e7)',
            fontSize: 11,
            whiteSpace: 'nowrap',
            zIndex: 10000,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

export default HelpPanel;
