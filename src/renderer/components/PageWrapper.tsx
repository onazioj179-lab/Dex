/**
 * PAGE WRAPPER - Consistent page layout with minimize/close buttons
 * Provides uniform header with controls for all DEX apps
 */

import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PageWrapperProps {
  title: string;
  icon?: string;
  color?: string;
  children: React.ReactNode;
  onMinimize?: () => void;
  onClose?: () => void;
  actions?: React.ReactNode;
  sidebar?: React.ReactNode;
  showHeader?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const MinimizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const PageWrapper: React.FC<PageWrapperProps> = ({
  title,
  icon,
  color = '#007aff',
  children,
  onMinimize,
  onClose,
  actions,
  sidebar,
  showHeader = true,
}) => {
  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      window.electron?.invoke('window:minimize').catch(() => {});
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.electron?.invoke('window:hide').catch(() => {});
    }
  };

  return (
    <div style={styles.container}>
      {showHeader && (
        <div style={styles.header}>
          {/* Title Section */}
          <div style={styles.titleSection}>
            {icon && (
              <span style={{ ...styles.titleIcon, background: `${color}20`, color }}>
                {icon}
              </span>
            )}
            <h1 style={styles.title}>{title}</h1>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            {actions}
          </div>

          {/* Window Controls */}
          <div style={styles.windowControls}>
            <button
              style={styles.controlButton}
              onClick={handleMinimize}
              title="Minimize"
            >
              <MinimizeIcon />
            </button>
            <button
              style={{ ...styles.controlButton, ...styles.closeButton }}
              onClick={handleClose}
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div style={styles.contentArea}>
        {sidebar && <div style={styles.sidebar}>{sidebar}</div>}
        <div style={styles.mainContent}>{children}</div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#1c1c1e',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    overflow: 'hidden',
  },
  header: {
    height: '52px',
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    background: '#2c2c2e',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    gap: '12px',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: '0 0 auto',
  },
  titleIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  },
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: 0,
    whiteSpace: 'nowrap',
  },
  actions: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  windowControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '0 0 auto',
  },
  controlButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  closeButton: {
    ':hover': {
      background: '#ff453a',
      color: 'var(--color-text-primary)',
    },
  } as React.CSSProperties,
  contentArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: '240px',
    minWidth: '0',
    flex: '0 0 240px',
    borderRight: '1px solid var(--color-border-default)',
    overflow: 'auto',
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
  },
};

export default PageWrapper;
