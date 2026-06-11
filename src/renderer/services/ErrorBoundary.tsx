// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- App Error Boundary & Isolation
 * ===========================================================================
 * 
 * Fault containment system ensuring:
 * - One sub-app crash cannot crash Dex
 * - One sub-app memory spike cannot freeze UI
 * - One sub-app error cannot corrupt global state
 * 
 * Features:
 * - React Error Boundaries per app
 * - Automatic crash recovery
 * - Error reporting and diagnostics
 * - Graceful degradation
 * ===========================================================================
 */

import React, { Component, ErrorInfo, ReactNode, useCallback, useMemo } from 'react';
import { useLifecycleManager, AppProcess } from './LifecycleManager';
import { useSystemEvents } from './SystemServices';
import { useRunningApps } from '../store/runningApps';
import { useShellPreferences } from '../store/shellPreferencesStore';

// ===========================================================================
// TYPES
// ===========================================================================

interface AppErrorBoundaryProps {
  instanceId: string;
  appId: string;
  appName: string;
  appColor: string;
  children: ReactNode;
  onCrash?: (error: Error, errorInfo: ErrorInfo) => void;
  onRecover?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  crashCount: number;
  lastCrashTime: number | null;
  isRecovering: boolean;
}

interface CrashReport {
  id: string;
  instanceId: string;
  appId: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  errorInfo: {
    componentStack: string;
  };
  timestamp: number;
  userAgent: string;
  sessionDuration: number;
  memoryUsage?: number;
}

// ===========================================================================
// CRASH REPORTER
// ===========================================================================

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const crashReports: CrashReport[] = [];
const MAX_CRASH_REPORTS = 50;

export const submitCrashReport = (report: CrashReport) => {
  crashReports.push(report);
  if (crashReports.length > MAX_CRASH_REPORTS) {
    crashReports.shift();
  }
  
  // Store for retrieval via getCrashReports() - avoids console noise
};

export const getCrashReports = (appId?: string): CrashReport[] => {
  if (appId) {
    return crashReports.filter(r => r.appId === appId);
  }
  return [...crashReports];
};

export const clearCrashReports = () => {
  crashReports.length = 0;
};

// ===========================================================================
// APP ERROR BOUNDARY
// ===========================================================================

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  private startTime: number;
  private recoveryTimeout: NodeJS.Timeout | null = null;

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      crashCount: 0,
      lastCrashTime: null,
      isRecovering: false,
    };
    this.startTime = Date.now();
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { instanceId, appId, onCrash } = this.props;
    const now = Date.now();

    // Update crash count
    this.setState(prevState => ({
      errorInfo,
      crashCount: prevState.crashCount + 1,
      lastCrashTime: now,
    }));

    // Create crash report
    const report: CrashReport = {
      id: generateId(),
      instanceId,
      appId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack || '',
      },
      timestamp: now,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      sessionDuration: now - this.startTime,
      memoryUsage: (performance as any)?.memory?.usedJSHeapSize,
    };

    submitCrashReport(report);

    // Notify lifecycle manager (use updated crashCount: prevState + 1)
    const updatedCrashCount = (this.state.crashCount || 0) + 1;
    useLifecycleManager.getState().handleCrash(instanceId, {
      code: error.name,
      message: error.message,
      timestamp: now,
      recoverable: updatedCrashCount < 3,
    });

    // Emit system event
    useSystemEvents.getState().emit({
      type: 'error',
      appId,
      instanceId,
      data: { error: error.message, stack: error.stack },
      severity: 'critical',
    });

    // Call optional crash handler
    onCrash?.(error, errorInfo);

    // Recovery Level 1: bounded auto-recovery. With the shell preference on
    // (default), recover automatically while the retry budget lasts; the
    // CrashScreen's "Recovering..." state stays visible during the attempt.
    // After 3 crashes this never fires and the crash card takes over.
    let autoRecover = true;
    try {
      autoRecover = useShellPreferences.getState().autoRecoverApps;
    } catch {
      // store unavailable (tests/early boot) — keep default
    }
    if (autoRecover && updatedCrashCount < 3) {
      this.handleRecover();
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }
  }

  handleRecover = () => {
    const { onRecover } = this.props;
    
    this.setState({ isRecovering: true });

    // Delay recovery to allow for cleanup
    this.recoveryTimeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRecovering: false,
      });
      onRecover?.();
    }, 500);
  };

  handleClose = () => {
    const { instanceId, appId } = this.props;
    useLifecycleManager.getState().terminateProcess(instanceId, 'User closed after crash');
    // Actually close the app in the running apps store so it navigates away
    useRunningApps.getState().closeApp(appId);
  };

  render() {
    const { children, appName, appColor, instanceId } = this.props;
    const { hasError, error, errorInfo, crashCount, isRecovering } = this.state;

    if (hasError) {
      return (
        <CrashScreen
          appName={appName}
          appColor={appColor}
          instanceId={instanceId}
          error={error}
          errorInfo={errorInfo}
          crashCount={crashCount}
          isRecovering={isRecovering}
          onRecover={this.handleRecover}
          onClose={this.handleClose}
        />
      );
    }

    return children;
  }
}

// ===========================================================================
// CRASH SCREEN UI
// ===========================================================================

interface CrashScreenProps {
  appName: string;
  appColor: string;
  instanceId: string;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  crashCount: number;
  isRecovering: boolean;
  onRecover: () => void;
  onClose: () => void;
}

const CrashScreen: React.FC<CrashScreenProps> = ({
  appName,
  appColor,
  instanceId,
  error,
  crashCount,
  isRecovering,
  onRecover,
  onClose,
}) => {
  const canRecover = crashCount < 3;

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Icon */}
        <div style={{ ...styles.icon, background: `${appColor}15` }}>
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={appColor} strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Title */}
        <h2 style={styles.title}>{appName} stopped unexpectedly</h2>

        {/* Error message */}
        <p style={styles.message}>
          {error?.message || 'An unexpected error occurred'}
        </p>

        {/* Crash count */}
        {crashCount > 1 && (
          <p style={styles.crashCount}>
            This app has crashed {crashCount} times this session
          </p>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          {canRecover ? (
            <button
              style={{ ...styles.button, ...styles.primaryButton, background: `${appColor}22`, borderColor: `${appColor}40`, color: appColor }}
              onClick={onRecover}
              disabled={isRecovering}
            >
              {isRecovering ? 'Recovering...' : 'Try Again'}
            </button>
          ) : (
            <p style={styles.cantRecover}>
              Too many crashes. Please close and restart the app.
            </p>
          )}
          <button style={styles.button} onClick={onClose}>
            Close App
          </button>
        </div>

        {/* Debug info */}
        <details style={styles.details}>
          <summary style={styles.summary}>Technical Details</summary>
          <pre style={styles.pre}>
            <strong>Instance:</strong> {instanceId.slice(-12)}{'\n'}
            <strong>Error:</strong> {error?.name || 'Unknown'}{'\n'}
            <strong>Message:</strong> {error?.message || 'No message'}{'\n'}
            {error?.stack && (
              <>
                <strong>Stack:</strong>{'\n'}
                {error.stack.split('\n').slice(0, 5).join('\n')}
              </>
            )}
          </pre>
        </details>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 'var(--space-6, 24px)',
    background: 'var(--bg-primary, #f5f5f7)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 400,
    textAlign: 'center',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 'var(--radius-lg, 10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4, 16px)',
  },
  title: {
    fontSize: 'var(--font-size-lg, 18px)',
    fontWeight: 600,
    color: 'var(--text-primary, #1d1d1f)',
    margin: '0 0 var(--space-2, 8px) 0',
  },
  message: {
    fontSize: 'var(--font-size-sm, 14px)',
    color: 'var(--text-secondary, #424245)',
    margin: '0 0 var(--space-2, 8px) 0',
    lineHeight: 'var(--line-height-relaxed, 1.5)',
  },
  crashCount: {
    fontSize: 'var(--font-size-xs, 12px)',
    color: 'var(--accent-red, #ff3b30)',
    margin: '0 0 var(--space-4, 16px) 0',
  },
  cantRecover: {
    fontSize: 'var(--font-size-sm, 13px)',
    color: 'var(--accent-red, #ff3b30)',
    margin: '0 0 var(--space-3, 12px) 0',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2, 8px)',
    width: '100%',
    marginTop: 'var(--space-2, 8px)',
  },
  button: {
    padding: 'var(--space-2, 10px) var(--space-5, 20px)',
    borderRadius: 'var(--radius-md, 6px)',
    border: '1px solid var(--color-border-default)',
    background: 'var(--color-bg-secondary)',
    fontSize: 'var(--font-size-sm, 14px)',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all var(--duration-fast, 80ms) var(--ease-out, ease-out)',
  },
  primaryButton: {
    border: '1px solid rgba(10,132,255,0.25)',
    background: 'rgba(10,132,255,0.15)',
    color: 'var(--color-accent, #0a84ff)',
  },
  details: {
    marginTop: 'var(--space-6, 24px)',
    width: '100%',
    textAlign: 'left',
  },
  summary: {
    fontSize: 'var(--font-size-xs, 12px)',
    color: 'var(--text-tertiary, #6e6e73)',
    cursor: 'pointer',
  },
  pre: {
    marginTop: 'var(--space-2, 8px)',
    padding: 'var(--space-3, 12px)',
    borderRadius: 'var(--radius-md, 6px)',
    background: 'var(--bg-tertiary, rgba(0,0,0,0.04))',
    fontSize: 'var(--font-size-2xs, 10px)',
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--text-secondary, #424245)',
    overflow: 'auto',
    maxHeight: 200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

// ===========================================================================
// PROCESS ISOLATION WRAPPER
// ===========================================================================

interface ProcessIsolationProps {
  process: AppProcess;
  appName: string;
  appColor: string;
  children: ReactNode;
}

/**
 * Wraps an app in both error boundary and performance isolation
 */
export const ProcessIsolation: React.FC<ProcessIsolationProps> = ({
  process,
  appName,
  appColor,
  children,
}) => {
  const handleCrash = useCallback((_error: Error) => {
    // Crash is already logged via submitCrashReport
  }, []);

  const handleRecover = useCallback(() => {
    // Recovery handled by error boundary state
  }, []);

  // Only render if process is in a renderable state
  const shouldRender = useMemo(() => {
    return ['foreground', 'background', 'launching'].includes(process.lifecycleState);
  }, [process.lifecycleState]);

  if (!shouldRender) {
    return null;
  }

  // Skip loading screen — instant app opening (macOS Tahoe style)
  if (process.lifecycleState === 'launching') {
    return null;
  }

  // Show offline state
  if (process.functionalState === 'offline') {
    return (
      <StateScreen
        title="You're Offline"
        message={`${appName} requires an internet connection to work.`}
        icon="offline"
        color="#8e8e93"
      />
    );
  }

  // Show permission denied state
  if (process.functionalState === 'permission-denied') {
    return (
      <StateScreen
        title="Permission Required"
        message={`${appName} needs additional permissions to continue.`}
        icon="lock"
        color="#ff9500"
      />
    );
  }

  // Show error state (non-crash)
  if (process.functionalState === 'error' && process.lastError) {
    return (
      <StateScreen
        title="Something went wrong"
        message={process.lastError.message}
        icon="error"
        color="#ff3b30"
      />
    );
  }

  return (
    <AppErrorBoundary
      instanceId={process.instanceId}
      appId={process.appId}
      appName={appName}
      appColor={appColor}
      onCrash={handleCrash}
      onRecover={handleRecover}
    >
      {children}
    </AppErrorBoundary>
  );
};

const loadingStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 'var(--space-3, 12px)',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid var(--border-subtle, rgba(0,0,0,0.1))',
    borderTopColor: 'var(--accent-primary, #007aff)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  text: {
    fontSize: 'var(--font-size-sm, 13px)',
    color: 'var(--text-tertiary, #6e6e73)',
  },
};

// ===========================================================================
// STATE SCREENS
// ===========================================================================

interface StateScreenProps {
  title: string;
  message: string;
  icon: 'offline' | 'lock' | 'error';
  color: string;
}

const StateScreen: React.FC<StateScreenProps> = ({ title, message, icon, color }) => {
  const iconSvg = {
    offline: (
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
        <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0122.58 9" />
        <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
        <path d="M8.53 16.11a6 6 0 016.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
    lock: (
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
    error: (
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  };

  return (
    <div style={stateStyles.container}>
      <div style={{ ...stateStyles.icon, background: `${color}15` }}>
        {iconSvg[icon]}
      </div>
      <h3 style={stateStyles.title}>{title}</h3>
      <p style={stateStyles.message}>{message}</p>
    </div>
  );
};

const stateStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 'var(--space-6, 24px)',
    textAlign: 'center',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 'var(--radius-lg, 10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4, 16px)',
  },
  title: {
    fontSize: 'var(--font-size-lg, 18px)',
    fontWeight: 600,
    color: 'var(--text-primary, #1d1d1f)',
    margin: '0 0 var(--space-2, 8px) 0',
  },
  message: {
    fontSize: 'var(--font-size-sm, 14px)',
    color: 'var(--text-secondary, #424245)',
    margin: 0,
    maxWidth: 280,
    lineHeight: 'var(--line-height-relaxed, 1.5)',
  },
};

// ===========================================================================
// EXPORTS
// ===========================================================================

export type { CrashReport };

// ===========================================================================
// VIEW ERROR BOUNDARY (lightweight, for sub-views within apps)
// ===========================================================================

interface ViewErrorBoundaryProps {
  viewName: string;
  children: ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  showDetails: boolean;
  resetKey: number;
}

export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '', showDetails: false, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ViewErrorBoundaryState> {
    return { hasError: true, errorMessage: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error): void {
    submitCrashReport({
      id: generateId(),
      instanceId: `view-${this.props.viewName}`,
      appId: 'view',
      error: { name: error.name, message: error.message, stack: error.stack },
      errorInfo: { componentStack: '' },
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      sessionDuration: 0,
    });
  }

  private reloadView = () => {
    this.setState(prev => ({ hasError: false, showDetails: false, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.resetKey} style={{ display: 'flex', flexDirection: 'column' as const, flex: 1, minHeight: 0, height: '100%' }}>{this.props.children}</div>;
    }

    return (
      <div style={{ border: '1px solid rgba(255,59,48,0.25)', background: 'rgba(255,59,48,0.08)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>View error in {this.props.viewName}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Something went wrong in this view. The issue was logged.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={this.reloadView} style={{ border: '1px solid var(--color-text-tertiary)', borderRadius: 6, padding: '6px 10px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Reload view</button>
          <button onClick={() => this.setState(prev => ({ ...prev, showDetails: !prev.showDetails }))} style={{ border: '1px solid var(--color-text-tertiary)', borderRadius: 6, padding: '6px 10px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {this.state.showDetails ? 'Hide error details' : 'View error details'}
          </button>
        </div>
        {this.state.showDetails && (
          <pre style={{ margin: 0, padding: 8, borderRadius: 4, background: 'rgba(0,0,0,0.2)', fontSize: 11, overflowX: 'auto' }}>{this.state.errorMessage}</pre>
        )}
      </div>
    );
  }
}
