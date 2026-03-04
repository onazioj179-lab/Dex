/**
 * DEX Error Boundary & Error Handling Components
 * Error display and recovery
 */

import React, { Component, ErrorInfo, useState, useCallback } from 'react';

// ==================== TYPES ====================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorDisplayProps {
  error: Error | string;
  title?: string;
  showStack?: boolean;
  onRetry?: () => void;
  onReport?: (error: Error | string) => void;
  variant?: 'inline' | 'fullpage' | 'card' | 'toast';
}

interface ErrorFormProps {
  error: Error;
  onSubmit: (details: {
    description: string;
    email?: string;
    steps?: string;
  }) => void;
  onCancel?: () => void;
}

// ==================== ERROR BOUNDARY ====================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
    console.error('Error caught by boundary:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error!, this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorDisplay
          error={this.state.error!}
          onRetry={this.reset}
          variant="card"
        />
      );
    }

    return this.props.children;
  }
}

// ==================== ERROR DISPLAY ====================

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title = 'Something went wrong',
  showStack = false,
  onRetry,
  onReport,
  variant = 'card',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'inline':
        return {
          padding: 16,
          background: 'var(--color-error-light, #ffebee)',
          borderRadius: 8,
          border: '1px solid var(--color-error, #f44336)',
        };
      case 'fullpage':
        return {
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          padding: 24,
        };
      case 'toast':
        return {
          padding: 16,
          background: 'var(--color-error, #f44336)',
          borderRadius: 8,
          color: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        };
      default:
        return {
          padding: 24,
          background: 'var(--color-bg-secondary)',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          maxWidth: 500,
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: getVariantStyles(),
    icon: {
      fontSize: variant === 'fullpage' ? 72 : 48,
      marginBottom: 16,
    },
    title: {
      fontSize: variant === 'fullpage' ? 24 : 18,
      fontWeight: 600,
      color: variant === 'toast' ? 'white' : 'var(--color-text)',
      marginBottom: 8,
      textAlign: variant === 'fullpage' ? 'center' : 'left',
    },
    message: {
      fontSize: 14,
      color: variant === 'toast' ? 'rgba(255,255,255,0.9)' : 'var(--color-text-muted)',
      marginBottom: 16,
      textAlign: variant === 'fullpage' ? 'center' : 'left',
    },
    stack: {
      padding: 12,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'monospace',
      overflow: 'auto',
      maxHeight: 200,
      marginBottom: 16,
      whiteSpace: 'pre-wrap',
      color: 'var(--color-text)',
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: variant === 'fullpage' ? 'center' : 'flex-start',
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
    detailsToggle: {
      background: 'none',
      border: 'none',
      color: variant === 'toast' ? 'rgba(255,255,255,0.7)' : 'var(--color-accent)',
      cursor: 'pointer',
      fontSize: 13,
      padding: 0,
      marginTop: 8,
    },
  };

  return (
    <div style={styles.container as any}>
      {variant !== 'toast' && (
        <div style={styles.icon as any}>alert-triangle</div>
      )}
      <h3 style={styles.title as any}>{title}</h3>
      <p style={styles.message as any}>{errorMessage}</p>

      {(showStack || showDetails) && errorStack && (
        <pre style={styles.stack}>{errorStack}</pre>
      )}

      {errorStack && !showStack && (
        <button
          style={styles.detailsToggle}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      )}

      <div style={styles.actions}>
        {onRetry && (
          <button
            style={{
              ...styles.button,
              background: 'var(--color-accent)',
              color: 'white',
            }}
            onClick={onRetry}
          >
            Try Again
          </button>
        )}
        {onReport && (
          <button
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
            onClick={() => onReport(error)}
          >
            Report Issue
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== 404 PAGE ====================

interface NotFoundProps {
  message?: string;
  onGoHome?: () => void;
  onGoBack?: () => void;
}

export const NotFound: React.FC<NotFoundProps> = ({
  message = "The page you're looking for doesn't exist.",
  onGoHome,
  onGoBack,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      textAlign: 'center',
      minHeight: 400,
    },
    code: {
      fontSize: 120,
      fontWeight: 700,
      color: 'var(--color-text-muted)',
      lineHeight: 1,
      margin: 0,
    },
    title: {
      fontSize: 24,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginTop: 16,
      marginBottom: 8,
    },
    message: {
      fontSize: 16,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
    },
    actions: {
      display: 'flex',
      gap: 12,
    },
    button: {
      padding: '12px 24px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container as any}>
      <h1 style={styles.code}>404</h1>
      <h2 style={styles.title}>Page Not Found</h2>
      <p style={styles.message}>{message}</p>
      <div style={styles.actions}>
        {onGoBack && (
          <button
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
            onClick={onGoBack}
          >
            Go Back
          </button>
        )}
        {onGoHome && (
          <button
            style={{
              ...styles.button,
              background: 'var(--color-accent)',
              color: 'white',
            }}
            onClick={onGoHome}
          >
            Go Home
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== OFFLINE ERROR ====================

interface OfflineErrorProps {
  onRetry?: () => void;
}

export const OfflineError: React.FC<OfflineErrorProps> = ({ onRetry }) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      textAlign: 'center',
    },
    icon: {
      fontSize: 64,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
      maxWidth: 300,
    },
    button: {
      padding: '12px 24px',
      border: 'none',
      borderRadius: 6,
      background: 'var(--color-accent)',
      color: 'white',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.icon}>wifi</div>
      <h3 style={styles.title}>You're offline</h3>
      <p style={styles.message}>
        Please check your internet connection and try again.
      </p>
      {onRetry && (
        <button style={styles.button} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
};

// ==================== ERROR FORM ====================

export const ErrorForm: React.FC<ErrorFormProps> = ({
  error,
  onSubmit,
  onCancel,
}) => {
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [steps, setSteps] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ description, email, steps });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 500,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
    },
    errorInfo: {
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 6,
      marginBottom: 24,
      fontSize: 12,
      fontFamily: 'monospace',
      color: 'var(--color-error)',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    input: {
      padding: '10px 12px',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
    },
    textarea: {
      padding: '10px 12px',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
      minHeight: 80,
      resize: 'vertical',
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: 'flex-end',
      marginTop: 8,
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Report an Issue</h3>
      <p style={styles.subtitle}>
        Help us fix this problem by providing some details.
      </p>

      <div style={styles.errorInfo}>
        {error.message}
      </div>

      <form style={styles.form as any} onSubmit={handleSubmit}>
        <div style={styles.field as any}>
          <label style={styles.label}>What were you trying to do?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened..."
            style={styles.textarea}
            required
          />
        </div>

        <div style={styles.field as any}>
          <label style={styles.label}>Steps to reproduce (optional)</label>
          <textarea
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="1. Click on...&#10;2. Then...&#10;3. Error appears..."
            style={styles.textarea}
          />
        </div>

        <div style={styles.field as any}>
          <label style={styles.label}>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={styles.input}
          />
        </div>

        <div style={styles.actions}>
          {onCancel && (
            <button
              type="button"
              style={{
                ...styles.button,
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text)',
              }}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            style={{
              ...styles.button,
              background: 'var(--color-accent)',
              color: 'white',
            }}
          >
            Submit Report
          </button>
        </div>
      </form>
    </div>
  );
};

// ==================== USE ERROR HOOK ====================

interface UseErrorReturn {
  error: Error | null;
  setError: (error: Error | null) => void;
  clearError: () => void;
  withErrorHandling: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

export const useError = (): UseErrorReturn => {
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const withErrorHandling = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      clearError();
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return undefined;
    }
  }, [clearError]);

  return { error, setError, clearError, withErrorHandling };
};

// ==================== RETRY WRAPPER ====================

interface RetryWrapperProps {
  children: React.ReactNode;
  maxRetries?: number;
  onRetry?: (attempt: number) => void;
  onMaxRetriesReached?: () => void;
}

export const RetryWrapper: React.FC<RetryWrapperProps> = ({
  children,
  maxRetries = 3,
  onRetry,
  onMaxRetriesReached,
}) => {
  const [retries, setRetries] = useState(0);

  const handleRetry = useCallback(() => {
    if (retries < maxRetries) {
      setRetries(retries + 1);
      onRetry?.(retries + 1);
    } else {
      onMaxRetriesReached?.();
    }
  }, [retries, maxRetries, onRetry, onMaxRetriesReached]);

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <ErrorDisplay
          error={error}
          onRetry={() => {
            handleRetry();
            reset();
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
