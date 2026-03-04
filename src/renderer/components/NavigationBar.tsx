// ═══════════════════════════════════════════════════════════════════════════
// DEX - Navigation Bar Component
// MINIMAL OS: Text-based, no borders, spacing-driven hierarchy
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { useNavigationHistory } from '../store/useNavigationHistory';
import { SessionIndicator } from './SessionIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// Icons - Minimal, only when needed
// ─────────────────────────────────────────────────────────────────────────────

const ChevronLeftIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page Configuration - Groups, titles, and hierarchy
// ─────────────────────────────────────────────────────────────────────────────

interface PageConfig {
  title: string;
  group: string;
  icon?: string;
}

const PAGE_CONFIG: Record<string, PageConfig> = {
  home: { title: 'Home', group: 'Core' },
  dashboard: { title: 'Dashboard', group: 'Core' },
  browser: { title: 'Browser', group: 'Core' },
  sessions: { title: 'Sessions', group: 'Activity' },
  notes: { title: 'Notes', group: 'Create' },
  tasks: { title: 'Tasks', group: 'Create' },
  gallery: { title: 'Gallery', group: 'Media' },
  audio: { title: 'Music', group: 'Media' },
  video: { title: 'Video', group: 'Media' },
  files: { title: 'Files', group: 'Media' },
  workflows: { title: 'Workflows', group: 'Automate' },
  actions: { title: 'Actions', group: 'Automate' },
  scheduler: { title: 'Scheduler', group: 'Automate' },
  agent: { title: 'AI Agent', group: 'AI' },
  power: { title: 'Power', group: 'System' },
  integrity: { title: 'System Integrity', group: 'System' },
  transfers: { title: 'Transfers', group: 'System' },
  settings: { title: 'Settings', group: 'System' },
  operations: { title: 'Operations', group: 'Automate' },
  timers: { title: 'Timers', group: 'Automate' },
  systemmap: { title: 'System Map', group: 'System' },
  missions: { title: 'Missions', group: 'Automate' },
  override: { title: 'Override', group: 'System' },
  blackbox: { title: 'Black Box', group: 'System' },
  plugins: { title: 'Plugins', group: 'System' },
  hotkeys: { title: 'Hotkeys', group: 'System' },
  analytics: { title: 'Analytics', group: 'System' },
  scripts: { title: 'Scripts', group: 'Automate' },
  sync: { title: 'Sync', group: 'System' },
};

// For backward compatibility
const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_CONFIG).map(([key, config]) => [key, config.title])
);

interface NavigationBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenCommandPalette?: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({ 
  currentPage, 
  onNavigate,
  onOpenCommandPalette,
}) => {
  const { goBack, goForward, canGoBack, canGoForward, getHistory } = useNavigationHistory();
  const [showHistory, setShowHistory] = useState(false);
  
  const handleBack = () => {
    const entry = goBack();
    if (entry) {
      onNavigate(entry.page);
    }
  };
  
  const handleForward = () => {
    const entry = goForward();
    if (entry) {
      onNavigate(entry.page);
    }
  };
  
  const isBackEnabled = canGoBack();
  const isForwardEnabled = canGoForward();
  const pageConfig = PAGE_CONFIG[currentPage] || { title: currentPage, group: 'Core' };
  const pageTitle = pageConfig.title;
  const pageGroup = pageConfig.group;
  
  // Navigation button - minimal
  const NavButton: React.FC<{
    onClick: () => void;
    disabled: boolean;
    title: string;
    children: React.ReactNode;
  }> = ({ onClick, disabled, title, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        padding: 0,
        border: 'none',
        borderRadius: '8px',
        background: 'transparent',
        color: disabled ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.4)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 80ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? 'var(--color-text-disabled)' : 'var(--color-text-muted)';
      }}
    >
      {children}
    </button>
  );
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 24px',
        background: 'var(--color-bg-base)',
        height: '44px',
        flexShrink: 0,
      }}
    >
      {/* Back/Forward Navigation - minimal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <NavButton 
          onClick={handleBack} 
          disabled={!isBackEnabled} 
          title="Back"
        >
          <ChevronLeftIcon size={14} />
        </NavButton>
        
        <NavButton 
          onClick={handleForward} 
          disabled={!isForwardEnabled} 
          title="Forward"
        >
          <ChevronRightIcon size={14} />
        </NavButton>
      </div>
      
      {/* Page Title - Typography as primary UI */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          fontWeight: 400,
        }}>
          {pageGroup}
        </span>
        <span style={{
          fontSize: '14px',
          color: 'var(--color-text-primary)',
          fontWeight: 500,
        }}>
          {pageTitle}
        </span>
      </div>
      
      {/* Spacer */}
      <div style={{ flex: 1 }} />
      
      {/* Right zone - minimal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Command shortcut - text only, no border */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            title="Command Palette"
            style={{
              padding: '4px 8px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 80ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)';
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.25)';
            }}
          >
            ⌘K
          </button>
        )}
        
        {/* Session Indicator */}
        <SessionIndicator onNavigate={onNavigate} />
      </div>
    </div>
  );
};

export default NavigationBar;
