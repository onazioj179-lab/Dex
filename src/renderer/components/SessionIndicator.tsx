// ═══════════════════════════════════════════════════════════════════════════
// DEX - Session Indicator Component
// Shows active session status in navigation bar
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';

interface SessionIndicatorProps {
  onNavigate: (page: string) => void;
}

export const SessionIndicator: React.FC<SessionIndicatorProps> = ({ onNavigate }) => {
  return (
    <button
      onClick={() => onNavigate('sessions')}
      title="View Sessions"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
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
        e.currentTarget.style.color = 'var(--color-text-secondary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-text-muted)';
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <span>Session</span>
    </button>
  );
};

export default SessionIndicator;
