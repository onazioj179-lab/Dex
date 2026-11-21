// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX System Features Integration
 * Provides system-wide features: Notifications, Shortcuts, Theme Manager
 */

import React, { useEffect, useCallback, useState, memo } from 'react';
import { useAppSubsystem } from '../store/appSubsystem';
import { toggleTheme } from '../utils/theme';
import { getDexIdentityTheme } from '../utils/identityTheme';
import { notify } from '../services/notify';
import { useNotificationCenterStore } from '../store/unifiedSystemsStore';

// ==================== SIMPLE NOTIFICATION SYSTEM ====================
interface SimpleNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const notificationStore = {
  notifications: [] as SimpleNotification[],
  listeners: new Set<() => void>(),
  
  add(notification: Omit<SimpleNotification, 'id' | 'timestamp' | 'read'>) {
    const newNotification: SimpleNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };
    // Consolidation (DEX 5.5): route through the single unified path so this
    // shows the unified banner and persists to the hub (bell/center). The local
    // list is retained only as a back-compat shim for existing subscribers; the
    // parallel toast stack + overlay this module used to render are retired.
    void notify({
      title: notification.title,
      body: notification.message,
      icon: notification.type,
      source: 'System',
    });
    this.notifications = [newNotification, ...this.notifications].slice(0, 50);
    this.notify();
    return newNotification;
  },
  
  markRead(id: string) {
    this.notifications = this.notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    this.notify();
  },
  
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  },
  
  notify() {
    this.listeners.forEach(l => l());
  },
};

const useSimpleNotifications = () => {
  const [notifications, setNotifications] = useState(notificationStore.notifications);
  
  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      setNotifications([...notificationStore.notifications]);
    });
    return unsubscribe;
  }, []);
  
  return {
    notifications,
    add: notificationStore.add.bind(notificationStore),
    markRead: notificationStore.markRead.bind(notificationStore),
  };
};

// ==================== KEYBOARD SHORTCUTS HANDLER ====================
const useGlobalShortcuts = (
  onNotifications: () => void,
  onNewNote: () => void,
  onNewTask: () => void,
  onToggleTheme: () => void
) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Only allow Escape in inputs
        if (e.key !== 'Escape') return;
      }
      
      // Notifications (Ctrl+Shift+N or Cmd+Shift+N)
      if (e.key === 'n' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        onNotifications();
        return;
      }
      
      // Toggle Theme (Ctrl+Shift+T or Cmd+Shift+T)
      if (e.key === 't' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        onToggleTheme();
        return;
      }
      
      // New Note (Ctrl+N)
      if (e.key === 'n' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        onNewNote();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNotifications, onNewNote, onNewTask, onToggleTheme]);
};

// ==================== MAIN SYSTEM FEATURES COMPONENT ====================
export const SystemFeatures: React.FC = memo(() => {
  // App state - use correct store API
  const { launchApp } = useAppSubsystem();
  // Notifications are surfaced through the unified path (services/notify); this
  // module only raises them via addNotification now.
  const { add: addNotification } = useSimpleNotifications();
  
  // Hot Exit: Session restore is now automatic via Zustand persist middleware
  // in useRunningApps store. No prompt needed - apps reappear on launch.
  
  // Handlers
  const handleNotificationsToggle = useCallback(() => {
    // Consolidation (DEX 5.5): open the ONE unified notification center (the
    // hub-backed bell panel) instead of this module's retired parallel overlay.
    const store = useNotificationCenterStore.getState();
    const next = !store.panelOpen;
    store.setPanelOpen(next);
    if (next) store.loadNotifications();
  }, []);
  
  const handleThemeToggle = useCallback(() => {
    toggleTheme();
    const mode = document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark';
    const identity = getDexIdentityTheme(document.documentElement.getAttribute('data-dex-identity'));
    addNotification({
      type: 'info',
      title: 'Theme Changed',
      message: `${mode} mode · ${identity.name}`,
    });
  }, [addNotification]);
  
  const handleNewNote = useCallback(() => {
    launchApp('notes', '/');
    addNotification({
      type: 'info',
      title: 'Notes',
      message: 'Opening Notes app',
    });
  }, [launchApp, addNotification]);
  
  const handleNewTask = useCallback(() => {
    launchApp('tasks', '/');
    addNotification({
      type: 'info',
      title: 'Tasks',
      message: 'Opening Tasks app',
    });
  }, [launchApp, addNotification]);
  
  // Register global shortcuts
  useGlobalShortcuts(
    handleNotificationsToggle,
    handleNewNote,
    handleNewTask,
    handleThemeToggle
  );
  
  return (
    <>
      {/*
        Consolidation (DEX 5.5): the parallel toast stack and the local
        NotificationCenterOverlay this module used to render are retired. All
        notifications now flow through the single unified path — the top-right
        banner stack (AppManager) for transient surfacing and the hub-backed
        bell/center for grouped, prioritized, persistent history. The
        Ctrl+Shift+N shortcut opens that unified center.
      */}
    </>
  );
});

SystemFeatures.displayName = 'SystemFeatures';

export default SystemFeatures;
