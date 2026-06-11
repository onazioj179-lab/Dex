// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Toast Notifications
 * Beautiful animated toast notifications
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// ==================== TYPES ====================

type ToastType = 'info' | 'success' | 'warning' | 'error';
type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

interface ToastProviderProps {
  children: React.ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

// ==================== ICONS ====================

const Icons = {
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  success: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  warning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  error: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const TYPE_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info: { bg: '#007aff15', border: '#007aff40', icon: '#007aff' },
  success: { bg: '#34c75915', border: '#34c75940', icon: 'var(--color-success)' },
  warning: { bg: '#ff950015', border: '#ff950040', icon: '#ff9500' },
  error: { bg: '#ff3b3015', border: '#ff3b3040', icon: 'var(--color-error)' },
};

// ==================== CONTEXT ====================

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ==================== TOAST ITEM ====================

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
  position: ToastPosition;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, position }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const duration = toast.duration ?? 3000; // 3s default for faster dismissal
  const dismissible = toast.dismissible ?? true;

  // Handle auto-dismiss timer
  useEffect(() => {
    if (duration > 0) {
      const updateInterval = 50;
      const decrementAmount = (100 / duration) * updateInterval;

      intervalRef.current = setInterval(() => {
        setProgress(prev => Math.max(0, prev - decrementAmount));
      }, updateInterval);

      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [duration]);

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleMouseLeave = () => {
    if (duration > 0 && progress > 0) {
      const remainingTime = (progress / 100) * duration;
      const updateInterval = 50;
      const decrementAmount = (100 / duration) * updateInterval;

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setProgress(prev => Math.max(0, prev - decrementAmount));
      }, updateInterval);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleDismiss, remainingTime);
    }
  };

  const getAnimation = () => {
    const isLeft = position.includes('left');
    const isTop = position.includes('top');
    const isCenter = position.includes('center');

    if (isExiting) {
      if (isCenter) return 'slideOutUp 0.2s ease-out forwards';
      return isLeft ? 'slideOutLeft 0.2s ease-out forwards' : 'slideOutRight 0.2s ease-out forwards';
    }
    if (isCenter) return isTop ? 'slideInDown 0.3s ease-out' : 'slideInUp 0.3s ease-out';
    return isLeft ? 'slideInLeft 0.3s ease-out' : 'slideInRight 0.3s ease-out';
  };

  const colors = TYPE_COLORS[toast.type];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '10px 12px',
      background: 'var(--color-bg-elevated)',
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
      minWidth: 200,
      maxWidth: 280,
      position: 'relative',
      overflow: 'hidden',
      animation: getAnimation(),
    },
    iconWrapper: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.bg,
      borderRadius: 5,
      flexShrink: 0,
      color: colors.icon,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
      marginBottom: toast.message ? 2 : 0,
    },
    message: {
      fontSize: 11,
      color: 'var(--color-text-secondary)',
      lineHeight: 1.35,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    actionBtn: {
      padding: '4px 10px',
      background: colors.icon,
      border: 'none',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
    closeBtn: {
      position: 'absolute',
      top: 6,
      right: 6,
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
      opacity: 0.6,
      transition: 'opacity 0.15s',
    },
    progressBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: 2,
      background: colors.icon,
      borderRadius: '0 0 0 8px',
      transition: 'width 0.05s linear',
    },
  };

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes slideOutLeft {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(-100%); opacity: 0; }
        }
        @keyframes slideOutUp {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-100%); opacity: 0; }
        }
      `}</style>
      <div
        style={styles.container}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div style={styles.iconWrapper}>
          {Icons[toast.type]}
        </div>
        <div style={styles.content}>
          <div style={styles.title}>{toast.title}</div>
          {toast.message && <div style={styles.message}>{toast.message}</div>}
          {toast.action && (
            <div style={styles.actions}>
              <button
                style={styles.actionBtn}
                onClick={() => {
                  toast.action?.onClick();
                  handleDismiss();
                }}
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>
        {dismissible && (
          <button
            style={styles.closeBtn}
            onClick={handleDismiss}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
          >
            {Icons.close}
          </button>
        )}
        {duration > 0 && (
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
        )}
      </div>
    </>
  );
};

// ==================== TOAST CONTAINER ====================

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position: ToastPosition;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss, position }) => {
  const getContainerStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'fixed',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 16,
      zIndex: 'var(--z-notification)',
      pointerEvents: 'none',
    };

    switch (position) {
      case 'top-right':
        return { ...base, top: 0, right: 0 };
      case 'top-left':
        return { ...base, top: 0, left: 0 };
      case 'bottom-right':
        return { ...base, bottom: 0, right: 0, flexDirection: 'column-reverse' };
      case 'bottom-left':
        return { ...base, bottom: 0, left: 0, flexDirection: 'column-reverse' };
      case 'top-center':
        return { ...base, top: 0, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-center':
        return { ...base, bottom: 0, left: '50%', transform: 'translateX(-50%)', flexDirection: 'column-reverse' };
      default:
        return { ...base, top: 0, right: 0 };
    }
  };

  return (
    <div style={getContainerStyles()}>
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem
            toast={toast}
            onDismiss={() => onDismiss(toast.id)}
            position={position}
          />
        </div>
      ))}
    </div>
  );
};

// ==================== TOAST PROVIDER ====================

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
  maxToasts = 5,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    setToasts(prev => {
      const newToasts = [...prev, { ...toast, id }];
      // Limit number of visible toasts
      if (newToasts.length > maxToasts) {
        return newToasts.slice(-maxToasts);
      }
      return newToasts;
    });

    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} position={position} />
    </ToastContext.Provider>
  );
};

// ==================== HELPER FUNCTIONS ====================

export const toast = {
  info: (title: string, message?: string, options?: Partial<Toast>) => {
    // This requires useToast hook context
    return { type: 'info' as const, title, message, ...options };
  },
  success: (title: string, message?: string, options?: Partial<Toast>) => {
    return { type: 'success' as const, title, message, ...options };
  },
  warning: (title: string, message?: string, options?: Partial<Toast>) => {
    return { type: 'warning' as const, title, message, ...options };
  },
  error: (title: string, message?: string, options?: Partial<Toast>) => {
    return { type: 'error' as const, title, message, ...options };
  },
};

// ==================== HOOK: useToastHelpers ====================

export const useToastHelpers = () => {
  const { addToast } = useToast();

  return {
    info: (title: string, message?: string, options?: Partial<Toast>) => 
      addToast({ type: 'info', title, message, ...options }),
    success: (title: string, message?: string, options?: Partial<Toast>) => 
      addToast({ type: 'success', title, message, ...options }),
    warning: (title: string, message?: string, options?: Partial<Toast>) => 
      addToast({ type: 'warning', title, message, ...options }),
    error: (title: string, message?: string, options?: Partial<Toast>) => 
      addToast({ type: 'error', title, message, ...options }),
  };
};

export default ToastProvider;
