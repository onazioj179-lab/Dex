/**
 * DEX Empty State & Placeholder Components
 * Empty states, placeholders, and zero-data states
 */

import React from 'react';

// ==================== TYPES ====================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'card' | 'inline';
}

interface PlaceholderProps {
  icon?: React.ReactNode;
  text: string;
  subtext?: string;
  action?: React.ReactNode;
  dashed?: boolean;
}

interface NoResultsProps {
  query?: string;
  title?: string;
  description?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onClear?: () => void;
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | string;
  onRetry?: () => void;
  showDetails?: boolean;
}

interface ComingSoonProps {
  title?: string;
  description?: string;
  expectedDate?: Date;
  onNotify?: () => void;
}

// ==================== EMPTY STATE ====================

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  variant = 'default',
}) => {
  const sizeConfig = {
    sm: {
      iconSize: 32,
      titleSize: 14,
      descSize: 12,
      padding: 24,
      gap: 8,
    },
    md: {
      iconSize: 48,
      titleSize: 18,
      descSize: 14,
      padding: 40,
      gap: 12,
    },
    lg: {
      iconSize: 64,
      titleSize: 24,
      descSize: 16,
      padding: 60,
      gap: 16,
    },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: config.padding,
      ...(variant === 'card' && {
        background: 'var(--color-bg-secondary)',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
      }),
      ...(variant === 'inline' && {
        flexDirection: 'row',
        textAlign: 'left',
        gap: 16,
        padding: 16,
      }),
    },
    icon: {
      fontSize: config.iconSize,
      marginBottom: variant === 'inline' ? 0 : config.gap,
      color: 'var(--color-text-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      gap: config.gap / 2,
    },
    title: {
      fontSize: config.titleSize,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    description: {
      fontSize: config.descSize,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 400,
    },
    actions: {
      display: 'flex',
      gap: 12,
      marginTop: config.gap,
    },
  };

  return (
    <div style={styles.container}>
      {icon && <div style={styles.icon}>{icon}</div>}
      <div style={styles.content}>
        <h3 style={styles.title}>{title}</h3>
        {description && <p style={styles.description}>{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div style={styles.actions}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};

// ==================== PLACEHOLDER ====================

export const Placeholder: React.FC<PlaceholderProps> = ({
  icon,
  text,
  subtext,
  action,
  dashed = true,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      border: dashed ? '2px dashed var(--color-border)' : '1px solid var(--color-border)',
      borderRadius: 8,
      background: 'var(--color-bg-secondary)',
      gap: 12,
    },
    icon: {
      fontSize: 36,
      color: 'var(--color-text-muted)',
    },
    text: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    subtext: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
    action: {
      marginTop: 8,
    },
  };

  return (
    <div style={styles.container}>
      {icon && <div style={styles.icon}>{icon}</div>}
      <p style={styles.text}>{text}</p>
      {subtext && <p style={styles.subtext}>{subtext}</p>}
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
};

// ==================== NO RESULTS ====================

export const NoResults: React.FC<NoResultsProps> = ({
  query,
  title = 'No results found',
  description,
  suggestions = [],
  onSuggestionClick,
  onClear,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 40,
      textAlign: 'center',
    },
    icon: {
      fontSize: 48,
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 400,
    },
    query: {
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    suggestions: {
      marginTop: 24,
      textAlign: 'left',
    },
    suggestionsTitle: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 12,
    },
    suggestionList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
    },
    suggestion: {
      padding: '6px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 20,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    clearButton: {
      marginTop: 20,
      padding: '8px 16px',
      background: 'transparent',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
  };

  const defaultDescription = query
    ? `We couldn't find anything matching "${query}"`
    : "We couldn't find any results for your search";

  return (
    <div style={styles.container}>
      <span style={styles.icon}>search</span>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.description}>{description || defaultDescription}</p>

      {suggestions.length > 0 && (
        <div style={styles.suggestions}>
          <p style={styles.suggestionsTitle}>Try searching for:</p>
          <div style={styles.suggestionList}>
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                style={styles.suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {onClear && (
        <button style={styles.clearButton} onClick={onClear}>
          Clear search
        </button>
      )}
    </div>
  );
};

// ==================== ERROR STATE ====================

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  error,
  onRetry,
  showDetails = false,
}) => {
  const [showError, setShowError] = React.useState(false);

  const errorMessage = error instanceof Error ? error.message : error;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 40,
      textAlign: 'center',
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: 'rgba(239, 68, 68, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 32,
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 400,
    },
    actions: {
      display: 'flex',
      gap: 12,
      marginTop: 24,
    },
    retryButton: {
      padding: '10px 20px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
    detailsButton: {
      padding: '10px 20px',
      background: 'transparent',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    errorDetails: {
      marginTop: 20,
      padding: 16,
      background: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 6,
      textAlign: 'left',
      width: '100%',
      maxWidth: 500,
    },
    errorCode: {
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#ef4444',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      margin: 0,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>x-circle</div>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.description}>{description}</p>

      <div style={styles.actions}>
        {onRetry && (
          <button style={styles.retryButton} onClick={onRetry}>
            Try again
          </button>
        )}
        {showDetails && errorMessage && (
          <button
            style={styles.detailsButton}
            onClick={() => setShowError(!showError)}
          >
            {showError ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>

      {showError && errorMessage && (
        <div style={styles.errorDetails}>
          <pre style={styles.errorCode}>{errorMessage}</pre>
        </div>
      )}
    </div>
  );
};

// ==================== COMING SOON ====================

export const ComingSoon: React.FC<ComingSoonProps> = ({
  title = 'Coming Soon',
  description = 'This feature is currently under development.',
  expectedDate,
  onNotify,
}) => {
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 48,
      textAlign: 'center',
      background: 'var(--color-bg-secondary)',
      borderRadius: 16,
      border: '1px solid var(--color-border)',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      background: 'rgba(139, 92, 246, 0.1)',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      color: '#8b5cf6',
      marginBottom: 20,
    },
    icon: {
      fontSize: 56,
      marginBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 12,
    },
    description: {
      fontSize: 15,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 400,
      lineHeight: 1.6,
    },
    date: {
      marginTop: 16,
      fontSize: 13,
      color: 'var(--color-text-secondary)',
    },
    notifyButton: {
      marginTop: 24,
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.badge}>
        rocket In Development
      </span>
      <span style={styles.icon}>sparkles</span>
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.description}>{description}</p>
      {expectedDate && (
        <p style={styles.date}>Expected: {formatDate(expectedDate)}</p>
      )}
      {onNotify && (
        <button style={styles.notifyButton} onClick={onNotify}>
          bell Notify me when ready
        </button>
      )}
    </div>
  );
};

// ==================== MAINTENANCE ====================

interface MaintenanceProps {
  title?: string;
  description?: string;
  estimatedTime?: string;
}

export const Maintenance: React.FC<MaintenanceProps> = ({
  title = 'Under Maintenance',
  description = "We're performing scheduled maintenance. Please check back soon.",
  estimatedTime,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 48,
      textAlign: 'center',
    },
    icon: {
      fontSize: 64,
      marginBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 12,
    },
    description: {
      fontSize: 15,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 400,
      lineHeight: 1.6,
    },
    time: {
      marginTop: 20,
      padding: '8px 16px',
      background: 'rgba(245, 158, 11, 0.1)',
      borderRadius: 6,
      fontSize: 13,
      color: '#f59e0b',
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>wrench</span>
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.description}>{description}</p>
      {estimatedTime && (
        <div style={styles.time}>
          Estimated completion: {estimatedTime}
        </div>
      )}
    </div>
  );
};

// ==================== OFFLINE ====================

interface OfflineProps {
  onRetry?: () => void;
}

export const Offline: React.FC<OfflineProps> = ({ onRetry }) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 48,
      textAlign: 'center',
    },
    icon: {
      fontSize: 56,
      marginBottom: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 300,
    },
    retryButton: {
      marginTop: 24,
      padding: '10px 20px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>wifi</span>
      <h2 style={styles.title}>You're offline</h2>
      <p style={styles.description}>
        Check your internet connection and try again.
      </p>
      {onRetry && (
        <button style={styles.retryButton} onClick={onRetry}>
          ↻ Retry
        </button>
      )}
    </div>
  );
};

export default EmptyState;
