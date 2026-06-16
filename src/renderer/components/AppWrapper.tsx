// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - App Wrapper
// Universal error boundary, loading states, and crash recovery for all apps
// =============================================================================

import React, { Component, Suspense, ReactNode, useState, useEffect, useCallback } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { DexLoader } from './LoadingStates';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface AppErrorBoundaryProps {
  children: ReactNode;
  appId: string;
  appName: string;
  onCrash?: (error: Error, appId: string) => void;
  onRecover?: (appId: string) => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

interface AppLoadingProps {
  appName: string;
  isCreativeApp?: boolean;
}

interface AppWrapperProps {
  children: ReactNode;
  appId: string;
  appName: string;
  isCreativeApp?: boolean;
  onCrash?: (error: Error, appId: string) => void;
}

// ---------------------------------------------------------------------------
// APP ERROR BOUNDARY
// Catches React errors and prevents app crashes from taking down DEX
// ---------------------------------------------------------------------------

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  private static MAX_RETRIES = 3;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error
    console.error(`[AppErrorBoundary] ${this.props.appName} crashed:`, error, errorInfo);

    // Store error info
    this.setState({ errorInfo });

    // Notify parent
    this.props.onCrash?.(error, this.props.appId);

    // Store crash info for debugging
    try {
      const crashes = JSON.parse(localStorage.getItem('dex:app-crashes') || '[]');
      crashes.push({
        appId: this.props.appId,
        appName: this.props.appName,
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: Date.now(),
      });
      // Keep only last 50 crashes
      localStorage.setItem('dex:app-crashes', JSON.stringify(crashes.slice(-50)));
    } catch {
      // Ignore localStorage errors
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  handleRetry = (): void => {
    const { retryCount } = this.state;
    
    if (retryCount < AppErrorBoundary.MAX_RETRIES) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      });
      this.props.onRecover?.(this.props.appId);
    }
  };

  handleClose = (): void => {
    // Request app close via custom event
    window.dispatchEvent(new CustomEvent('dex:close-app', { 
      detail: { appId: this.props.appId } 
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const canRetry = retryCount < AppErrorBoundary.MAX_RETRIES;

      return (
        <div className="dex-app-error" style={styles.errorContainer}>
          <div style={styles.errorContent}>
            {/* Icon */}
            <div style={styles.errorIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12" y2="16"/>
              </svg>
            </div>

            {/* Message */}
            <h2 style={styles.errorTitle}>{this.props.appName} stopped working</h2>
            <p style={styles.errorMessage}>
              {error?.message || 'An unexpected error occurred'}
            </p>

            {/* Actions */}
            <div style={styles.errorActions}>
              {canRetry && (
                <button 
                  onClick={this.handleRetry}
                  style={styles.retryButton}
                  className="dex-btn"
                >
                  Try Again
                  {retryCount > 0 && ` (${AppErrorBoundary.MAX_RETRIES - retryCount} left)`}
                </button>
              )}
              <button 
                onClick={this.handleClose}
                style={styles.closeButton}
                className="dex-btn"
              >
                Close App
              </button>
            </div>

            {/* Debug info (collapsed) */}
            <details style={styles.errorDetails}>
              <summary style={styles.detailsSummary}>Technical Details</summary>
              <pre style={styles.stackTrace}>
                {error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// APP LOADING COMPONENT
// Shows loading state while app initializes
// ---------------------------------------------------------------------------

export function AppLoading({ appName, isCreativeApp }: AppLoadingProps): JSX.Element {
  // Creative apps take longer to mount, so we show a determinate-feeling ramp
  // (it eases toward 90% and the real mount replaces it). Light apps get a clean
  // indeterminate mark — no fake progress.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isCreativeApp || isReduceMotion()) return;
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 10, 90));
    }, 450);
    return () => clearInterval(progressInterval);
  }, [isCreativeApp]);

  return (
    <div className="dex-app-loading" style={styles.loadingContainer}>
      <DexLoader
        variant="panel"
        label={`Opening ${appName}`}
        sublabel={isCreativeApp ? 'Preparing workspace…' : undefined}
        progress={isCreativeApp ? progress : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// APP WRAPPER
// Combines error boundary with Suspense loading
// ---------------------------------------------------------------------------

export function AppWrapper({ 
  children, 
  appId, 
  appName, 
  isCreativeApp = false,
  onCrash 
}: AppWrapperProps): JSX.Element {
  const [mountTime] = useState(() => Date.now());
  
  // Track app performance
  useEffect(() => {
    const loadTime = Date.now() - mountTime;
    if (import.meta.env.DEV) console.log(`[AppWrapper] ${appName} mounted in ${loadTime}ms`);

    const metricsTimer = window.setTimeout(() => {
      try {
        const metrics = JSON.parse(localStorage.getItem('dex:app-metrics') || '{}');
        metrics[appId] = {
          lastLoad: loadTime,
          avgLoad: metrics[appId]
            ? (metrics[appId].avgLoad * 0.8 + loadTime * 0.2)
            : loadTime,
          opens: (metrics[appId]?.opens || 0) + 1,
        };
        localStorage.setItem('dex:app-metrics', JSON.stringify(metrics));
      } catch {
        // Ignore
      }
    }, 0);

    return () => window.clearTimeout(metricsTimer);
  }, [appId, appName, mountTime]);

  return (
    <AppErrorBoundary 
      appId={appId} 
      appName={appName}
      onCrash={onCrash}
    >
      <Suspense fallback={<AppLoading appName={appName} isCreativeApp={isCreativeApp} />}>
        {children}
      </Suspense>
    </AppErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// CREATIVE APP SKELETON
// ---------------------------------------------------------------------------
// The ONE creative-app loading skeleton lives in `./CreativeAppSkeleton.tsx`
// (full per-app-type chrome mockups: image / audio / video editors, etc.). A
// second, thinner `CreativeAppSkeleton` used to live here with a different
// `type` enum and shadowed that name while going entirely unused -- it was
// removed so there is a single source of truth. Import it directly:
//   import { CreativeAppSkeleton } from './CreativeAppSkeleton';

// ---------------------------------------------------------------------------
// HOOK: useAppRecovery
// Allows apps to implement graceful recovery
// ---------------------------------------------------------------------------

interface RecoveryState {
  isRecovering: boolean;
  recoveryAttempt: number;
}

export function useAppRecovery(appId: string): {
  state: RecoveryState;
  markRecovering: () => void;
  markRecovered: () => void;
} {
  const [state, setState] = useState<RecoveryState>({
    isRecovering: false,
    recoveryAttempt: 0,
  });

  const markRecovering = useCallback(() => {
    setState(s => ({
      isRecovering: true,
      recoveryAttempt: s.recoveryAttempt + 1,
    }));
  }, []);

  const markRecovered = useCallback(() => {
    setState(s => ({ ...s, isRecovering: false }));
  }, []);

  // Listen for app recovery events
  useEffect(() => {
    const handler = (e: CustomEvent<{ appId: string }>) => {
      if (e.detail.appId === appId) {
        markRecovering();
      }
    };

    window.addEventListener('dex:app-recover', handler as EventListener);
    return () => window.removeEventListener('dex:app-recover', handler as EventListener);
  }, [appId, markRecovering]);

  return { state, markRecovering, markRecovered };
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  errorContainer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-base, #1a1a1c)',
    color: 'var(--color-text-primary, #ffffff)',
    fontFamily: 'var(--dex-font-ui)',
    zIndex: 1000,
  },
  errorContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '400px',
    padding: 'var(--space-8)',
    textAlign: 'center',
  },
  errorIcon: {
    color: 'var(--color-error, #ff453a)',
    marginBottom: 'var(--space-4)',
  },
  errorTitle: {
    margin: '0 0 var(--space-2)',
    fontSize: '18px',
    fontWeight: 600,
  },
  errorMessage: {
    margin: '0 0 var(--space-6)',
    fontSize: '14px',
    color: 'var(--color-text-muted, #707070)',
    lineHeight: 1.5,
  },
  errorActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
  },
  retryButton: {
    padding: 'var(--space-2) var(--space-5)',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    background: 'var(--color-accent, #0a84ff)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  closeButton: {
    padding: 'var(--space-2) var(--space-5)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #ffffff)',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  errorDetails: {
    width: '100%',
    textAlign: 'left',
  },
  detailsSummary: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #707070)',
    cursor: 'pointer',
    marginBottom: 'var(--space-2)',
  },
  stackTrace: {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: 'var(--color-text-muted, #888)',
    background: 'var(--color-bg-inset, rgba(0,0,0,0.3))',
    padding: 'var(--space-3)',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '150px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  loadingContainer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-base, #1a1a1c)',
  },
};

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

export default AppWrapper;
