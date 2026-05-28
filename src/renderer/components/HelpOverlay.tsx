/**
 * DEX Platform - Help Overlay System
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Provides contextual help, tooltips, feature tours, and quick tips.
 * Integrates with UKI for voice-activated help.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import DexIcon from './DexIcon';
import { platform } from '../utils';

// ============================================================================
// Types
// ============================================================================

interface HelpTip {
  id: string;
  target: string; // CSS selector or element ref
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  emoji?: string;
}

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  tips: HelpTip[];
}

interface TourStep {
  id: string;
  target: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'hover' | 'none';
}

interface HelpOverlayProps {
  visible?: boolean;
  onClose?: () => void;
  currentApp?: string;
}

// ============================================================================
// Help Content - Organized by app/feature
// ============================================================================

const _MOD = platform.isMac ? '⌘' : 'Ctrl';

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket',
    tips: [
      { id: 'welcome', target: '', title: 'Welcome to DEX', content: `DEX is your complete creative workspace. Use the dock at the bottom to launch apps, or press ${_MOD}+K for the command palette.` },
      { id: 'uki', target: '', title: 'Meet UKI', content: 'UKI is your AI assistant. Say "Hey UKI" or press the microphone button to get help, open apps, or ask questions.' },
      { id: 'navigation', target: '', title: 'Quick Navigation', content: `Use ${_MOD}+1–9 to jump between apps. Hold ${_MOD} to see all shortcuts.` },
    ],
  },
  {
    id: 'creative-suite',
    title: 'Creative Suite',
    icon: 'palette',
    tips: [
      { id: 'vinx', target: '', title: 'VINX', content: 'Professional video editor. Import clips, arrange on timeline, add effects. JKL keys for shuttle control.' },
      { id: 'imosion', target: '', title: 'Imosion', content: 'Digital audio workstation. Record, mix, master. Arm tracks with R, use M for metronome.' },
      { id: 'prism', target: '', title: 'PRISM', content: 'Image editor with layers. Non-destructive editing, AI-powered tools. V=Move, B=Brush.' },
      { id: 'flux', target: '', title: 'FLUX', content: 'Motion graphics and animation. Create stunning visuals with behaviors and keyframes.' },
      { id: 'forge', target: '', title: 'FORGE', content: 'Media encoder and converter. Queue files, set formats, batch process.' },
      { id: 'axl', target: '', title: 'AXL', content: 'CAD design tool. Create technical drawings with precision tools. G=Move, R=Rotate, S=Scale.' },
    ],
  },
  {
    id: 'productivity',
    title: 'Productivity',
    icon: 'briefcase',
    tips: [
      { id: 'files', target: '', title: 'Files', content: 'Browse and manage your files. Drag & drop supported. Use tags for organization.' },
      { id: 'notes', target: '', title: 'Notes', content: 'Create rich text notes with markdown support. Organize in folders.' },
      { id: 'tasks', target: '', title: 'Tasks', content: 'Manage to-do lists with due dates, priorities, and subtasks.' },
      { id: 'calendar', target: '', title: 'Calendar', content: 'Schedule events and reminders. Syncs with your accounts.' },
      { id: 'kanban', target: '', title: 'Kanban', content: 'Visual project management. Drag cards between columns to track progress.' },
    ],
  },
  {
    id: 'system',
    title: 'System Features',
    icon: 'settings',
    tips: [
      { id: 'nexus', target: '', title: 'Nexus', content: 'Visual knowledge graph and file explorer. Explore your data in 3D space.' },
      { id: 'spotlight', target: '', title: 'Spotlight', content: `Press ${_MOD}+K to search files, apps, and commands instantly.` },
      { id: 'notifications', target: '', title: 'Notifications', content: 'Click the bell icon to view notifications and alerts.' },
      { id: 'settings', target: '', title: 'Settings', content: 'Customize DEX appearance, privacy, and performance options.' },
    ],
  },
];


// ============================================================================
// Help Card Component
// ============================================================================

const HelpCard: React.FC<{
  tip: HelpTip;
  onClick?: () => void;
}> = memo(({ tip, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'rgba(255, 255, 255, 0.04)',
      borderRadius: 10,
      padding: 14,
      cursor: 'pointer',
      transition: 'all 150ms ease',
      border: '1px solid transparent',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.08)';
      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(74, 158, 255, 0.3)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255, 255, 255, 0.04)';
      (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
      {tip.title}
    </div>
    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
      {tip.content}
    </div>
  </div>
));

// ============================================================================
// Help Section Component
// ============================================================================

const HelpSectionView: React.FC<{
  section: HelpSection;
  expanded: boolean;
  onToggle: () => void;
}> = memo(({ section, expanded, onToggle }) => (
  <div style={{ marginBottom: 8 }}>
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      <DexIcon name={section.icon} size={18} color="var(--color-accent)" />
      <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>{section.title}</span>
      <DexIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="var(--color-text-muted)" />
    </button>
    
    {expanded && (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 0 0 0',
          animation: 'fadeInUp 200ms ease-out',
        }}
      >
        {section.tips.map(tip => (
          <HelpCard key={tip.id} tip={tip} />
        ))}
      </div>
    )}
  </div>
));

// ============================================================================
// Search Component
// ============================================================================

const HelpSearch: React.FC<{
  query: string;
  onChange: (q: string) => void;
}> = memo(({ query, onChange }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      background: 'rgba(255, 255, 255, 0.06)',
      borderRadius: 10,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      marginBottom: 16,
    }}
  >
    <DexIcon name="search" size={16} color="var(--color-text-muted)" />
    <input
      type="text"
      value={query}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search help topics..."
      style={{
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#fff',
        fontSize: 14,
      }}
    />
    {query && (
      <button
        onClick={() => onChange('')}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
      >
        <DexIcon name="close" size={14} color="var(--color-text-muted)" />
      </button>
    )}
  </div>
));

// ============================================================================
// Main Help Overlay Component
// ============================================================================

const HelpOverlay: React.FC<HelpOverlayProps> = ({ visible = false, onClose, currentApp }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filter sections/tips based on search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return HELP_SECTIONS;
    
    const q = searchQuery.toLowerCase();
    return HELP_SECTIONS.map(section => ({
      ...section,
      tips: section.tips.filter(
        tip => tip.title.toLowerCase().includes(q) || tip.content.toLowerCase().includes(q)
      ),
    })).filter(section => section.tips.length > 0);
  }, [searchQuery]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeInScale 200ms ease-out',
      }}
    >
      <div
        ref={overlayRef}
        style={{
          width: '90%',
          maxWidth: 560,
          maxHeight: '80vh',
          background: 'rgba(22, 22, 26, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DexIcon name="help-circle" size={22} color="var(--color-accent)" />
            <span style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>Help & Tips</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: 6,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close help"
          >
            <DexIcon name="close" size={16} color="var(--color-text-primary)" />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 20,
          }}
        >
          <HelpSearch query={searchQuery} onChange={setSearchQuery} />

          {/* Quick Actions */}
          {!searchQuery && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <button
                style={{
                  background: 'var(--color-accent-muted)',
                  border: '1px solid rgba(74, 158, 255, 0.2)',
                  borderRadius: 10,
                  padding: '14px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <DexIcon name="command" size={20} color="var(--color-accent)" />
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>Shortcuts</span>
              </button>
              <button
                style={{
                  background: 'var(--color-success-muted)',
                  border: '1px solid rgba(52, 199, 89, 0.2)',
                  borderRadius: 10,
                  padding: '14px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <DexIcon name="tutorial" size={20} color="var(--color-success)" />
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>Tour</span>
              </button>
              <button
                style={{
                  background: 'var(--color-warning-muted)',
                  border: '1px solid rgba(255, 159, 10, 0.2)',
                  borderRadius: 10,
                  padding: '14px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <DexIcon name="mic" size={20} color="var(--color-warning)" />
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>Ask UKI</span>
              </button>
            </div>
          )}

          {/* Help Sections */}
          {filteredSections.map(section => (
            <HelpSectionView
              key={section.id}
              section={section}
              expanded={expandedSection === section.id || !!searchQuery}
              onToggle={() => setExpandedSection(
                expandedSection === section.id ? null : section.id
              )}
            />
          ))}

          {/* No Results */}
          {filteredSections.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--color-text-muted)',
              }}
            >
              <DexIcon name="search" size={32} color="var(--color-text-muted)" />
              <p style={{ marginTop: 12, fontSize: 14 }}>No help topics found</p>
              <p style={{ fontSize: 13, opacity: 0.7 }}>Try different keywords or ask UKI</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}
        >
          <span>Press <kbd style={{
            padding: '2px 6px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
          }}>?</kbd> to open help</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Contextual Tooltip Component
// ============================================================================

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const HelpTooltip: React.FC<TooltipProps> = memo(({
  content,
  children,
  position = 'top',
  delay = 400,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showTooltip = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = position === 'top' ? rect.top - 8 : rect.bottom + 8;
        setCoords({ x, y });
        setVisible(true);
      }
    }, delay);
  }, [delay, position]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      style={{ display: 'inline-flex' }}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: `translateX(-50%) translateY(${position === 'top' ? '-100%' : '0'})`,
            background: 'rgba(22, 22, 26, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#fff',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            zIndex: 10000,
            animation: 'fadeInScale 150ms ease-out',
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Hook for Help System
// ============================================================================

export function useHelp() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const toggleHelp = useCallback(() => setIsHelpOpen(prev => !prev), []);

  // Global keyboard shortcut for help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? key opens help (Shift+/)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggleHelp();
      }
      // F1 opens help
      if (e.key === 'F1') {
        e.preventDefault();
        openHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleHelp, openHelp]);

  return { isHelpOpen, openHelp, closeHelp, toggleHelp };
}

// ============================================================================
// Exports
// ============================================================================

export { HelpOverlay };
export default HelpOverlay;
