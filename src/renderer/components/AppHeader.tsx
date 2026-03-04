/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AppHeader - Reusable App Header with Close Button
 * Provides consistent header with app name and close functionality
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { useRunningApps } from '../store/runningApps';

interface AppHeaderProps {
  appId: string;
  appName: string;
  appColor?: string;
  showClose?: boolean;
  children?: React.ReactNode;
}

const CloseIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const HomeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export const AppHeader: React.FC<AppHeaderProps> = ({
  appId,
  appName,
  appColor = '#60cdff',
  showClose = true,
  children,
}) => {
  const { closeApp, setCurrentApp } = useRunningApps();

  const handleClose = () => {
    closeApp(appId);
  };

  const handleGoHome = () => {
    setCurrentApp('home');
  };

  return (
    <div style={styles.header}>
      <div style={styles.left}>
        <button
          style={styles.homeBtn}
          onClick={handleGoHome}
          title="Go to Home"
        >
          {HomeIcon}
        </button>
        <span style={{ ...styles.appName, color: appColor }}>{appName}</span>
      </div>
      <div style={styles.center}>
        {children}
      </div>
      <div style={styles.right}>
        {showClose && (
          <button
            style={styles.closeBtn}
            onClick={handleClose}
            title={`Close ${appName}`}
          >
            {CloseIcon}
          </button>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--color-bg-glass)',
    borderBottom: '1px solid var(--color-border)',
    minHeight: '40px',
    backdropFilter: 'blur(var(--blur-md))',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  appName: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  homeBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-hover)',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  closeBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-hover)',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
};

export default AppHeader;
