/**
 * DEX Notification Center
 * System-wide notification management
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';

// Icons
const Icons = {
  bell: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  warning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  error: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
};

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  appId?: string;
  action?: {
    label: string;
    handler: () => void;
  };
}

// Notification store (simple in-memory + localStorage)
let notifications: Notification[] = [];
let listeners: Set<() => void> = new Set();

export const loadNotifications = (): Notification[] => {
  try {
    const saved = localStorage.getItem('dex-notifications');
    if (saved) {
      notifications = JSON.parse(saved);
    }
  } catch {}
  return notifications;
};

export const saveNotifications = () => {
  try {
    localStorage.setItem('dex-notifications', JSON.stringify(notifications));
  } catch {}
};

export const subscribeToNotifications = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notifyListeners = () => {
  listeners.forEach(l => l());
};

export const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    read: false,
  };
  notifications = [newNotification, ...notifications].slice(0, 50); // Keep last 50
  saveNotifications();
  notifyListeners();
  return newNotification;
};

export const markAsRead = (id: string) => {
  notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n);
  saveNotifications();
  notifyListeners();
};

export const markAllAsRead = () => {
  notifications = notifications.map(n => ({ ...n, read: true }));
  saveNotifications();
  notifyListeners();
};

export const clearNotification = (id: string) => {
  notifications = notifications.filter(n => n.id !== id);
  saveNotifications();
  notifyListeners();
};

export const clearAllNotifications = () => {
  notifications = [];
  saveNotifications();
  notifyListeners();
};

export const getUnreadCount = (): number => {
  return notifications.filter(n => !n.read).length;
};

// Hook for using notifications
export const useNotifications = () => {
  const [, setUpdate] = useState(0);
  
  useEffect(() => {
    loadNotifications();
    const unsub = subscribeToNotifications(() => setUpdate(u => u + 1));
    return () => { unsub(); };
  }, []);
  
  return {
    notifications: [...notifications],
    unreadCount: getUnreadCount(),
    add: addNotification,
    markRead: markAsRead,
    markAllRead: markAllAsRead,
    clear: clearNotification,
    clearAll: clearAllNotifications,
  };
};

// Format timestamp
const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

// Notification Center Panel
interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markRead, markAllRead, clear, clearAll } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = useMemo(() => {
    return filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  }, [notifications, filter]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <span style={{ color: '#22c55e' }}>{Icons.check}</span>;
      case 'warning': return <span style={{ color: '#f59e0b' }}>{Icons.warning}</span>;
      case 'error': return <span style={{ color: '#ef4444' }}>{Icons.error}</span>;
      default: return <span style={{ color: '#3b82f6' }}>{Icons.info}</span>;
    }
  };

  const getBgColor = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'rgba(34, 197, 94, 0.1)';
      case 'warning': return 'rgba(245, 158, 11, 0.1)';
      case 'error': return 'rgba(239, 68, 68, 0.1)';
      default: return 'rgba(59, 130, 246, 0.1)';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {Icons.bell}
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span style={styles.badge}>{unreadCount}</span>
            )}
          </div>
          <button onClick={onClose} style={styles.closeBtn}>{Icons.x}</button>
        </div>

        <div style={styles.toolbar}>
          <div style={styles.filters}>
            <button
              onClick={() => setFilter('all')}
              style={{ ...styles.filterBtn, ...(filter === 'all' && styles.filterBtnActive) }}
            >All</button>
            <button
              onClick={() => setFilter('unread')}
              style={{ ...styles.filterBtn, ...(filter === 'unread' && styles.filterBtnActive) }}
            >Unread</button>
          </div>
          <div style={styles.actions}>
            <button onClick={markAllRead} style={styles.actionBtn}>Mark all read</button>
            <button onClick={clearAll} style={styles.actionBtn}>{Icons.trash}</button>
          </div>
        </div>

        <div style={styles.list}>
          {filteredNotifications.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ color: '#3f3f46' }}>{Icons.bell}</div>
              <span>No notifications</span>
            </div>
          ) : (
            filteredNotifications.map(notif => (
              <div
                key={notif.id}
                style={{
                  ...styles.item,
                  background: notif.read ? 'transparent' : getBgColor(notif.type),
                }}
                onClick={() => markRead(notif.id)}
              >
                <div style={styles.itemIcon}>{getIcon(notif.type)}</div>
                <div style={styles.itemContent}>
                  <div style={styles.itemHeader}>
                    <span style={styles.itemTitle}>{notif.title}</span>
                    <span style={styles.itemTime}>{formatTime(notif.timestamp)}</span>
                  </div>
                  <div style={styles.itemMessage}>{notif.message}</div>
                  {notif.action && (
                    <button
                      onClick={e => { e.stopPropagation(); notif.action?.handler(); }}
                      style={styles.itemAction}
                    >{notif.action.label}</button>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); clear(notif.id); }}
                  style={styles.itemClose}
                >{Icons.x}</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.3)',
    zIndex: 99998,
  },
  panel: {
    position: 'fixed',
    top: '48px',
    right: '12px',
    width: 'min(380px, calc(100vw - 24px))',
    maxHeight: 'calc(100vh - 100px)',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #27272a)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #fafafa)',
  },
  badge: {
    padding: '2px 8px',
    background: '#3b82f6',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  filters: {
    display: 'flex',
    gap: '4px',
  },
  filterBtn: {
    padding: '4px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#71717a',
    fontSize: '12px',
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '4px 8px',
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '40px',
    color: '#52525b',
    fontSize: '13px',
  },
  item: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  itemIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'var(--color-bg-secondary, #111113)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #fafafa)',
  },
  itemTime: {
    fontSize: '10px',
    color: '#52525b',
  },
  itemMessage: {
    fontSize: '12px',
    color: '#a1a1aa',
    lineHeight: 1.4,
  },
  itemAction: {
    marginTop: '8px',
    padding: '4px 12px',
    background: 'rgba(59, 130, 246, 0.15)',
    border: 'none',
    borderRadius: '4px',
    color: '#3b82f6',
    fontSize: '11px',
    cursor: 'pointer',
  },
  itemClose: {
    background: 'transparent',
    border: 'none',
    color: '#52525b',
    cursor: 'pointer',
    padding: '2px',
    opacity: 0.6,
    alignSelf: 'flex-start',
  },
};

// Toast notification component for quick feedback
interface ToastProps {
  notification: Notification;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getColor = (type: Notification['type']) => {
    switch (type) {
      case 'success': return '#22c55e';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#3b82f6';
    }
  };

  return (
    <div style={{
      ...toastStyles.container,
      borderLeft: `3px solid ${getColor(notification.type)}`,
    }}>
      <div style={toastStyles.content}>
        <div style={toastStyles.title}>{notification.title}</div>
        <div style={toastStyles.message}>{notification.message}</div>
      </div>
      <button onClick={onClose} style={toastStyles.close}>{Icons.x}</button>
    </div>
  );
};

const toastStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #27272a)',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
    animation: 'slideIn 0.2s ease-out',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #fafafa)',
    marginBottom: '2px',
  },
  message: {
    fontSize: '12px',
    color: '#a1a1aa',
  },
  close: {
    background: 'transparent',
    border: 'none',
    color: '#52525b',
    cursor: 'pointer',
    padding: '2px',
  },
};

export default NotificationCenter;
