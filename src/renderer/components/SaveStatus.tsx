/**
 * SAVE STATUS - Auto-save status indicator
 * Shows saving/saved status with visual feedback
 */

import React from 'react';

// ======================================================================
// TYPES
// ======================================================================

export type SaveStatusType = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusProps {
  status: SaveStatusType;
  lastSaved?: Date;
  style?: React.CSSProperties;
}

// ======================================================================
// ICONS
// ======================================================================

const Icons = {
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  saving: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  error: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  cloud: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  ),
};

// ======================================================================
// COMPONENT
// ======================================================================

export const SaveStatus: React.FC<SaveStatusProps> = ({ status, lastSaved, style }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'saving':
        return {
          icon: Icons.saving,
          text: 'Saving...',
          color: '#ff9f0a',
          animate: true,
        };
      case 'saved':
        return {
          icon: Icons.check,
          text: lastSaved ? `Saved ${formatTime(lastSaved)}` : 'Saved',
          color: '#30d158',
          animate: false,
        };
      case 'error':
        return {
          icon: Icons.error,
          text: 'Save failed',
          color: '#ff453a',
          animate: false,
        };
      default:
        return {
          icon: Icons.cloud,
          text: 'Ready',
          color: 'rgba(255,255,255,0.4)',
          animate: false,
        };
    }
  };

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 5000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const info = getStatusInfo();

  return (
    <div style={{ ...styles.container, ...style }}>
      <span 
        style={{ 
          ...styles.icon, 
          color: info.color,
          animation: info.animate ? 'pulse 1s ease-in-out infinite' : 'none',
        }}
      >
        {info.icon}
      </span>
      <span style={{ ...styles.text, color: info.color }}>{info.text}</span>
      
      {/* Inject animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

// ======================================================================
// STYLES
// ======================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    fontSize: 11,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: 500,
  },
};

export default SaveStatus;
