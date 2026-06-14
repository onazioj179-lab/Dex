// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Toast Notifications — consolidation shim (DEX 5.5).
 *
 * This module USED to render its own parallel toast stack. It is now a thin
 * shim over the single unified notification path (services/notify): the public
 * `ToastProvider` / `useToast` / `useToastHelpers` / `toast` API is preserved so
 * every existing caller keeps working unchanged, but each toast now becomes a
 * unified banner (transient surfacing via AppManager) and is persisted to the
 * Unified Notification Hub (bell / center). There is one notification surface.
 */

import React, { createContext, useContext, useCallback } from 'react';
import { notify } from '../services/notify';
import type { NotificationPriority } from '../../shared/notifications/group';

// ==================== TYPES ====================

type ToastType = 'info' | 'success' | 'warning' | 'error';

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
  /** Accepted for back-compat; the unified banner stack owns placement. */
  position?: string;
  /** Accepted for back-compat; the unified banner stack owns stacking. */
  maxToasts?: number;
}

// ==================== CONTEXT ====================

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ==================== TOAST PROVIDER ====================

// Map a toast severity to the unified notification priority. Errors are treated
// as urgent and warnings as high so they sort above routine info/success toasts
// in the unified banner stack and center.
const TOAST_PRIORITY: Record<ToastType, NotificationPriority> = {
  info: 'normal',
  success: 'normal',
  warning: 'high',
  error: 'urgent',
};

/**
 * ToastProvider is a thin shim over the single unified notification path. It
 * keeps the full useToast/useToastHelpers API so every existing caller works
 * unchanged, but no longer renders a parallel toast container — each toast
 * becomes a unified banner (transient surfacing) and is persisted to the hub
 * (bell/center). The `position`/`maxToasts` props are accepted for back-compat
 * and no longer used.
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    void notify({
      title: toast.title,
      body: toast.message,
      icon: toast.type,
      priority: TOAST_PRIORITY[toast.type] ?? 'normal',
      source: 'System',
      duration: toast.duration,
      actions: toast.action ? [{ label: toast.action.label, onClick: toast.action.onClick }] : undefined,
    });
    return id;
  }, []);

  // No local toast list anymore; dismissal/clear are handled by the unified
  // banner stack. These remain as no-ops so the context shape is unchanged.
  const removeToast = useCallback((_id: string) => { /* unified banner owns dismissal */ }, []);
  const clearToasts = useCallback(() => { /* unified banner owns clearing */ }, []);

  return (
    <ToastContext.Provider value={{ toasts: [], addToast, removeToast, clearToasts }}>
      {children}
    </ToastContext.Provider>
  );
};

// ==================== HELPER FUNCTIONS ====================

export const toast = {
  info: (title: string, message?: string, options?: Partial<Toast>) => {
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
