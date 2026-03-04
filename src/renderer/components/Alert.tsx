/**
 * DEX Alert & Banner Components
 * Feedback messages, alerts, and banners
 */

import React, { useState, useEffect, useCallback } from 'react';
import { InfoIcon } from '../utils/icons';

// ==================== TYPES ====================

interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

interface BannerProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
  action?: React.ReactNode;
  position?: 'top' | 'bottom';
  sticky?: boolean;
}

interface InlineMessageProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

interface CalloutProps {
  variant?: 'info' | 'success' | 'warning' | 'error' | 'note';
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

// ==================== CONSTANTS ====================

const variantConfig = {
  info: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    color: '#3b82f6',
    icon: <InfoIcon size={16} />,
  },
  success: {
    bg: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.3)',
    color: '#10b981',
    icon: 'check',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    color: '#f59e0b',
    icon: 'alert-triangle',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    icon: 'x',
  },
  note: {
    bg: 'rgba(139, 92, 246, 0.1)',
    border: 'rgba(139, 92, 246, 0.3)',
    color: '#8b5cf6',
    icon: 'file-text',
  },
};

// ==================== ALERT ====================

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  icon,
  closable = false,
  onClose,
  action,
  size = 'md',
}) => {
  const [visible, setVisible] = useState(true);
  const config = variantConfig[variant];

  const sizeConfig = {
    sm: { padding: 10, fontSize: 12, iconSize: 14 },
    md: { padding: 14, fontSize: 13, iconSize: 16 },
    lg: { padding: 18, fontSize: 14, iconSize: 18 },
  };

  const sizeStyles = sizeConfig[size];

  const handleClose = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  if (!visible) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 12,
      padding: sizeStyles.padding,
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: 8,
      position: 'relative',
    },
    icon: {
      fontSize: sizeStyles.iconSize,
      color: config.color,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: sizeStyles.iconSize + 4,
      height: sizeStyles.iconSize + 4,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: sizeStyles.fontSize,
      fontWeight: 600,
      color: config.color,
      margin: 0,
      marginBottom: 4,
    },
    message: {
      fontSize: sizeStyles.fontSize,
      color: 'var(--color-text)',
      margin: 0,
      lineHeight: 1.5,
    },
    action: {
      marginTop: 10,
    },
    close: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
      transition: 'background 0.15s',
    },
  };

  return (
    <div style={styles.container} role="alert">
      <span style={styles.icon}>{icon || config.icon}</span>

      <div style={styles.content}>
        {title && <h4 style={styles.title}>{title}</h4>}
        <div style={styles.message}>{children}</div>
        {action && <div style={styles.action}>{action}</div>}
      </div>

      {closable && (
        <button
          style={styles.close}
          onClick={handleClose}
          aria-label="Close alert"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ==================== BANNER ====================

export const Banner: React.FC<BannerProps> = ({
  variant = 'info',
  title,
  description,
  icon,
  closable = false,
  onClose,
  action,
  position = 'top',
  sticky = false,
}) => {
  const [visible, setVisible] = useState(true);
  const config = variantConfig[variant];

  const handleClose = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  if (!visible) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 20px',
      background: config.bg,
      borderBottom: position === 'top' ? `1px solid ${config.border}` : 'none',
      borderTop: position === 'bottom' ? `1px solid ${config.border}` : 'none',
      position: sticky ? 'sticky' : 'relative',
      top: sticky && position === 'top' ? 0 : undefined,
      bottom: sticky && position === 'bottom' ? 0 : undefined,
      zIndex: sticky ? 100 : 1,
    },
    icon: {
      fontSize: 18,
      color: config.color,
      flexShrink: 0,
    },
    content: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: config.color,
      margin: 0,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text)',
      margin: 0,
    },
    action: {
      flexShrink: 0,
    },
    close: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 16,
      flexShrink: 0,
      transition: 'background 0.15s',
    },
  };

  return (
    <div style={styles.container} role="banner">
      <span style={styles.icon}>{icon || config.icon}</span>

      <div style={styles.content}>
        {title && <p style={styles.title}>{title}</p>}
        {description && <p style={styles.description}>{description}</p>}
      </div>

      {action && <div style={styles.action}>{action}</div>}

      {closable && (
        <button
          style={styles.close}
          onClick={handleClose}
          aria-label="Close banner"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ==================== INLINE MESSAGE ====================

export const InlineMessage: React.FC<InlineMessageProps> = ({
  variant = 'info',
  children,
  icon,
}) => {
  const config = variantConfig[variant];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: config.color,
    },
    icon: {
      fontSize: 12,
    },
  };

  return (
    <span style={styles.container}>
      <span style={styles.icon}>{icon || config.icon}</span>
      {children}
    </span>
  );
};

// ==================== CALLOUT ====================

export const Callout: React.FC<CalloutProps> = ({
  variant = 'info',
  title,
  children,
  icon,
  collapsible = false,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = variantConfig[variant];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: config.bg,
      borderLeft: `4px solid ${config.color}`,
      borderRadius: '0 8px 8px 0',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px',
      cursor: collapsible ? 'pointer' : 'default',
    },
    icon: {
      fontSize: 16,
      color: config.color,
    },
    title: {
      flex: 1,
      fontSize: 14,
      fontWeight: 600,
      color: config.color,
      margin: 0,
    },
    chevron: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      transition: 'transform 0.15s',
      transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
    },
    content: {
      padding: '0 16px 16px',
      fontSize: 13,
      color: 'var(--color-text)',
      lineHeight: 1.6,
      display: expanded ? 'block' : 'none',
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.header}
        onClick={() => collapsible && setExpanded(!expanded)}
      >
        <span style={styles.icon}>{icon || config.icon}</span>
        <h4 style={styles.title}>{title || variant.charAt(0).toUpperCase() + variant.slice(1)}</h4>
        {collapsible && <span style={styles.chevron}>▼</span>}
      </div>
      <div style={styles.content}>{children}</div>
    </div>
  );
};

// ==================== STATUS MESSAGE ====================

interface StatusMessageProps {
  status: 'loading' | 'success' | 'error' | 'empty';
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  onRetry?: () => void;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  status,
  loadingMessage = 'Loading...',
  successMessage = 'Operation completed successfully',
  errorMessage = 'Something went wrong',
  emptyMessage = 'No data available',
  onRetry,
}) => {
  const statusConfig: Record<string, { icon: string; color: string; message: string }> = {
    loading: { icon: 'Loading...', color: 'var(--color-text-muted)', message: loadingMessage },
    success: { icon: 'check', color: '#10b981', message: successMessage },
    error: { icon: 'x', color: '#ef4444', message: errorMessage },
    empty: { icon: 'inbox', color: 'var(--color-text-muted)', message: emptyMessage },
  };

  const config = statusConfig[status];

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
      fontSize: 40,
      marginBottom: 16,
    },
    message: {
      fontSize: 14,
      color: config.color,
      margin: 0,
      marginBottom: onRetry && status === 'error' ? 16 : 0,
    },
    retryButton: {
      padding: '8px 16px',
      fontSize: 13,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>{config.icon}</span>
      <p style={styles.message}>{config.message}</p>
      {onRetry && status === 'error' && (
        <button style={styles.retryButton} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
};

// ==================== FLASH MESSAGE ====================

interface FlashMessageProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  onClose?: () => void;
}

export const FlashMessage: React.FC<FlashMessageProps> = ({
  variant = 'info',
  message,
  duration = 5000,
  onClose,
}) => {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const config = variantConfig[variant];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(() => {
          setVisible(false);
          onClose?.();
        }, 200);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!visible) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: 6,
      opacity: exiting ? 0 : 1,
      transform: exiting ? 'translateY(-10px)' : 'translateY(0)',
      transition: 'opacity 0.2s, transform 0.2s',
    },
    icon: {
      fontSize: 14,
      color: config.color,
    },
    message: {
      flex: 1,
      fontSize: 13,
      color: 'var(--color-text)',
      margin: 0,
    },
    close: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 12,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>{config.icon}</span>
      <p style={styles.message}>{message}</p>
      <button
        style={styles.close}
        onClick={() => {
          setExiting(true);
          setTimeout(() => {
            setVisible(false);
            onClose?.();
          }, 200);
        }}
      >
        ×
      </button>
    </div>
  );
};

// ==================== VALIDATION MESSAGE ====================

interface ValidationMessageProps {
  type: 'error' | 'warning' | 'success';
  messages: string[];
}

export const ValidationMessage: React.FC<ValidationMessageProps> = ({
  type,
  messages,
}) => {
  if (messages.length === 0) return null;

  const config = variantConfig[type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: 12,
      background: config.bg,
      borderRadius: 6,
      border: `1px solid ${config.border}`,
    },
    list: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
    },
    item: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      fontSize: 13,
      color: config.color,
      padding: '4px 0',
    },
    icon: {
      fontSize: 12,
      marginTop: 2,
    },
  };

  return (
    <div style={styles.container}>
      <ul style={styles.list}>
        {messages.map((message, index) => (
          <li key={index} style={styles.item}>
            <span style={styles.icon}>{config.icon}</span>
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Alert;
