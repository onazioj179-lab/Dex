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
import { initializeTheme, toggleTheme, getCurrentTheme } from './ThemeManager';
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
  onGlobalSearch: () => void,
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
      
      // Global Search (Ctrl+Shift+F or Cmd+Shift+F)
      if (e.key === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        onGlobalSearch();
        return;
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
  }, [onGlobalSearch, onNotifications, onNewNote, onNewTask, onToggleTheme]);
};

// ==================== MAIN SYSTEM FEATURES COMPONENT ====================
export const SystemFeatures: React.FC = memo(() => {
  // UI state
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  // App state - use correct store API
  const { launchApp } = useAppSubsystem();
  // Notifications are surfaced through the unified path (services/notify); this
  // module only raises them via addNotification now.
  const { add: addNotification } = useSimpleNotifications();
  
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);
  
  // Hot Exit: Session restore is now automatic via Zustand persist middleware
  // in useRunningApps store. No prompt needed - apps reappear on launch.
  
  // Handlers
  const handleGlobalSearchToggle = useCallback(() => {
    setShowGlobalSearch(prev => !prev);
  }, []);
  
  const handleNotificationsToggle = useCallback(() => {
    // Consolidation (DEX 5.5): open the ONE unified notification center (the
    // hub-backed bell panel) instead of this module's retired parallel overlay.
    const store = useNotificationCenterStore.getState();
    const next = !store.panelOpen;
    store.setPanelOpen(next);
    if (next) store.loadNotifications();
    setShowGlobalSearch(false);
  }, []);
  
  const handleThemeToggle = useCallback(() => {
    toggleTheme();
    const theme = getCurrentTheme();
    addNotification({
      type: 'info',
      title: 'Theme Changed',
      message: `Switched to ${theme.name}`,
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
  
  const handleLaunchApp = useCallback((appId: string) => {
    launchApp(appId, '/');
  }, [launchApp]);
  

  
  // Register global shortcuts
  useGlobalShortcuts(
    handleGlobalSearchToggle,
    handleNotificationsToggle,
    handleNewNote,
    handleNewTask,
    handleThemeToggle
  );
  
  return (
    <>
      {/* Global Search Overlay */}
      {showGlobalSearch && (
        <GlobalSearchOverlay
          onClose={() => setShowGlobalSearch(false)}
          onLaunchApp={handleLaunchApp}
        />
      )}

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

// ==================== ADDITIONAL OVERLAY COMPONENTS ====================

const launcherStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '18vh',
  },
  container: {
    width: 520, maxWidth: '90vw',
    background: 'var(--color-bg-surface, rgba(30,30,30,0.92))',
    border: '1px solid var(--color-border-default, var(--color-border))',
    borderRadius: 10,
    boxShadow: 'var(--pg-shadow-modal), 0 0 0 0.5px var(--color-bg-hover)',
    overflow: 'hidden',
  },
  input: {
    width: '100%', padding: '14px 18px',
    background: 'transparent', border: 'none', outline: 'none',
    fontSize: 17, fontWeight: 300, letterSpacing: '-0.01em',
    color: 'var(--color-text-primary, #fff)',
    borderBottom: '1px solid var(--color-border-subtle, var(--color-border-subtle))',
  },
  results: {
    maxHeight: 340, overflowY: 'auto' as const, padding: '4px 0',
  },
  resultItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: '10px var(--space-4)', background: 'transparent', border: 'none',
    color: 'var(--color-text-primary, var(--color-text-primary))',
    cursor: 'pointer', fontSize: 14, textAlign: 'left' as const,
  },
  appIcon: {
    width: 28, height: 28, borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0,
  },
};

// Global Search Overlay
interface GlobalSearchOverlayProps {
  onClose: () => void;
  onLaunchApp: (appId: string) => void;
}

const GlobalSearchOverlay: React.FC<GlobalSearchOverlayProps> = memo(({ onClose, onLaunchApp }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; type: string }>>([]);
  
  const allItems = [
    // Apps
    { id: 'files', name: 'Files', type: 'app' },
    { id: 'notes', name: 'Notes', type: 'app' },
    { id: 'tasks', name: 'Tasks', type: 'app' },
    { id: 'browser', name: 'Browser', type: 'app' },
    { id: 'gallery', name: 'Gallery', type: 'app' },
    { id: 'settings', name: 'Settings', type: 'app' },
    { id: 'imosion', name: 'Imosion DAW', type: 'app' },
    { id: 'videoeditor', name: 'VINX Video Editor', type: 'app' },
    { id: 'prism', name: 'PRISM Image Editor', type: 'app' },
    { id: 'flux', name: 'FLUX Motion Graphics', type: 'app' },
    { id: 'forge', name: 'FORGE Encoder', type: 'app' },
    // Commands
    { id: 'theme', name: 'Toggle Theme', type: 'command' },
    { id: 'shortcuts', name: 'Keyboard Shortcuts', type: 'command' },
  ];
  
  useEffect(() => {
    if (query.trim()) {
      const filtered = allItems.filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
    } else {
      setResults(allItems.slice(0, 6));
    }
  }, [query]);
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  return (
    <div style={launcherStyles.overlay} onMouseDown={onClose}>
      <div style={launcherStyles.container} onMouseDown={e => e.stopPropagation()}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search"
          autoFocus
          style={launcherStyles.input}
        />
        <div style={launcherStyles.results}>
          {results.map(item => (
            <button
              key={item.id}
              onClick={() => { onLaunchApp(item.id); onClose(); }}
              style={launcherStyles.resultItem}
            >
              <span style={{ ...launcherStyles.appIcon, background: item.type === 'app' ? '#007aff' : '#8e8e93' }}>
                {item.name[0]}
              </span>
              <span>{item.name}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>{item.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

GlobalSearchOverlay.displayName = 'GlobalSearchOverlay';

export default SystemFeatures;
