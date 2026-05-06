// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX System Features Integration
 * Provides system-wide features: Notifications, Shortcuts, Theme Manager
 */

import React, { useEffect, useCallback, useState, memo } from 'react';
import { useAppSubsystem } from '../store/appSubsystem';
import { initializeTheme, toggleTheme, getCurrentTheme } from './ThemeManager';

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

// ==================== SIMPLE TOAST COMPONENT ====================
interface ToastProps {
  notification: SimpleNotification;
  onClose: () => void;
}

const SimpleToast: React.FC<ToastProps> = ({ notification, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  const colors = {
    info: '#007aff',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
  };
  
  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--color-bg-elevated, #2a2a2a)',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      borderLeft: `3px solid ${colors[notification.type]}`,
      minWidth: 280,
      maxWidth: 360,
      pointerEvents: 'auto',
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
        {notification.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #888)', marginTop: 4 }}>
        {notification.message}
      </div>
    </div>
  );
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
  const [showNotifications, setShowNotifications] = useState(false);
  // App state - use correct store API
  const { launchApp } = useAppSubsystem();
  const { notifications, add: addNotification, markRead } = useSimpleNotifications();
  
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);
  
  // Hot Exit: Session restore is now automatic via Zustand persist middleware
  // in useRunningApps store. No prompt needed - apps reappear on launch.
  
  // Handlers
  const handleGlobalSearchToggle = useCallback(() => {
    setShowGlobalSearch(prev => !prev);
    setShowNotifications(false);
  }, []);
  
  const handleNotificationsToggle = useCallback(() => {
    setShowNotifications(prev => !prev);
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
  
  // Get visible notifications for toasts
  const unreadNotifications = notifications.filter(n => !n.read).slice(0, 3);
  
  return (
    <>
      {/* Global Search Overlay */}
      {showGlobalSearch && (
        <GlobalSearchOverlay
          onClose={() => setShowGlobalSearch(false)}
          onLaunchApp={handleLaunchApp}
        />
      )}
      
      {/* Notification Center Overlay */}
      {showNotifications && (
        <NotificationCenterOverlay
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkRead={markRead}
        />
      )}
      
      {/* Toast Notifications */}
      <div style={toastContainerStyles}>
        {unreadNotifications.map((notification, index) => (
          <ToastNotification
            key={notification.id}
            notification={notification}
            onDismiss={() => markRead(notification.id)}
            offset={index}
          />
        ))}
      </div>
    </>
  );
});

SystemFeatures.displayName = 'SystemFeatures';

const toastContainerStyles: React.CSSProperties = {
  position: 'fixed',
  bottom: 20,
  right: 20,
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: 8,
  zIndex: 10000,
  pointerEvents: 'none',
};

// ==================== SESSION AUTO-SAVE ====================
export const useSessionAutoSave = () => {
  const { instances, activeInstanceId } = useAppSubsystem();
  
  useEffect(() => {
    const saveSession = () => {
      try {
        // Convert Map to array of app IDs
        const runningApps: string[] = [];
        instances.forEach((instance) => {
          runningApps.push(instance.appId);
        });
        
        const session = {
          runningApps,
          activeInstanceId,
          lastActivity: Date.now(),
        };
        localStorage.setItem('dex-session', JSON.stringify(session));
      } catch (e) { console.warn('[DEX]', e); }
    };
    
    // Save every 30 seconds
    const interval = setInterval(saveSession, 30000);
    
    // Save on visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Save on beforeunload
    const handleBeforeUnload = () => {
      saveSession();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [instances, activeInstanceId]);
};

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
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 0 0.5px var(--color-bg-hover)',
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
    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 16px', background: 'transparent', border: 'none',
    color: 'var(--color-text-primary, var(--color-text-primary))',
    cursor: 'pointer', fontSize: 14, textAlign: 'left' as const,
  },
  appIcon: {
    width: 28, height: 28, borderRadius: 7,
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
          placeholder="Search everything..."
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

// Notification Center Overlay
interface NotificationCenterOverlayProps {
  notifications: SimpleNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
}

const NotificationCenterOverlay: React.FC<NotificationCenterOverlayProps> = memo(({ 
  notifications, onClose, onMarkRead 
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  return (
    <div style={launcherStyles.overlay} onMouseDown={onClose}>
      <div style={{ ...launcherStyles.container, width: 360 }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, var(--color-border))' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Notifications</h3>
        </div>
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>
              No notifications
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--color-border, var(--color-bg-hover))',
                  cursor: 'pointer',
                  opacity: n.read ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{n.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

NotificationCenterOverlay.displayName = 'NotificationCenterOverlay';



// Toast Notification
interface ToastNotificationProps {
  notification: SimpleNotification;
  onDismiss: () => void;
  offset: number;
}

const ToastNotification: React.FC<ToastNotificationProps> = memo(({ notification, onDismiss, offset }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  
  const bgColor = notification.type === 'error' ? 'var(--color-error)' 
    : notification.type === 'success' ? 'var(--color-success)' 
    : notification.type === 'warning' ? '#ff9500' 
    : '#007aff';
  
  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--color-bg-elevated, #2a2a2a)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        borderLeft: `3px solid ${bgColor}`,
        maxWidth: 320,
        pointerEvents: 'auto',
        transform: `translateY(${offset * -8}px)`,
        opacity: 1 - offset * 0.2,
        zIndex: 10000 - offset,
        cursor: 'pointer',
      }}
      onClick={onDismiss}
    >
      <div style={{ fontWeight: 500, marginBottom: 2 }}>{notification.title}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{notification.message}</div>
    </div>
  );
});

ToastNotification.displayName = 'ToastNotification';

export default SystemFeatures;
