/**
 * DEX Notification System
 * In-app notifications, alerts, and message center
 */

import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { InfoIcon } from '../utils/icons';

// ==================== TYPES ====================

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
  priority: NotificationPriority;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  persistent?: boolean;
  category?: string;
  avatar?: string;
  metadata?: Record<string, any>;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

interface NotificationCenterProps {
  maxVisible?: number;
  groupByCategory?: boolean;
  showTimestamp?: boolean;
  onNotificationClick?: (notification: Notification) => void;
}

interface NotificationBadgeProps {
  count: number;
  max?: number;
  showZero?: boolean;
  dot?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  children?: React.ReactNode;
}

interface NotificationItemProps {
  notification: Notification;
  onDismiss?: () => void;
  onMarkAsRead?: () => void;
  onClick?: () => void;
  compact?: boolean;
}

// ==================== CONTEXT ====================

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// ==================== PROVIDER ====================

interface NotificationProviderProps {
  children: React.ReactNode;
  maxNotifications?: number;
  storageKey?: string;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  maxNotifications = 100,
  storageKey = 'dex-notifications',
}) => {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
    return [];
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifications));
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }, [notifications, storageKey]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((
    notification: Omit<Notification, 'id' | 'timestamp' | 'read'>
  ): string => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
      read: false,
      dismissible: notification.dismissible ?? true,
      priority: notification.priority ?? 'normal',
    };

    setNotifications(prev => {
      const updated = [newNotification, ...prev];
      if (updated.length > maxNotifications) {
        // Remove oldest non-persistent notifications
        const persistent = updated.filter(n => n.persistent);
        const nonPersistent = updated.filter(n => !n.persistent);
        return [...persistent, ...nonPersistent.slice(0, maxNotifications - persistent.length)];
      }
      return updated;
    });

    return id;
  }, [maxNotifications]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications(prev => prev.filter(n => n.persistent));
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        removeNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ==================== NOTIFICATION ITEM ====================

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onDismiss,
  onMarkAsRead,
  onClick,
  compact = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const typeConfig: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
    info: { icon: <InfoIcon size={16} />, color: '#3b82f6' },
    success: { icon: 'check', color: '#10b981' },
    warning: { icon: 'alert-triangle', color: '#f59e0b' },
    error: { icon: 'x', color: '#ef4444' },
  };

  const config = typeConfig[notification.type];

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 12,
      padding: compact ? '8px 12px' : '12px 16px',
      background: notification.read ? 'transparent' : 'var(--color-bg-secondary)',
      borderRadius: 8,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 0.15s',
      position: 'relative',
    },
    unreadDot: {
      position: 'absolute',
      top: compact ? 12 : 16,
      left: 4,
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: config.color,
    },
    icon: {
      flexShrink: 0,
      width: compact ? 28 : 36,
      height: compact ? 28 : 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background: `${config.color}20`,
      color: config.color,
      fontSize: compact ? 14 : 16,
    },
    avatar: {
      width: compact ? 28 : 36,
      height: compact ? 28 : 36,
      borderRadius: '50%',
      objectFit: 'cover',
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    title: {
      fontSize: compact ? 13 : 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    priority: {
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 4,
      background: notification.priority === 'urgent' || notification.priority === 'high'
        ? '#ef444420'
        : 'var(--color-bg-tertiary)',
      color: notification.priority === 'urgent' || notification.priority === 'high'
        ? '#ef4444'
        : 'var(--color-text-muted)',
      textTransform: 'uppercase',
    },
    message: {
      fontSize: compact ? 12 : 13,
      color: 'var(--color-text-muted)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    time: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    action: {
      padding: '4px 8px',
      fontSize: 12,
      fontWeight: 500,
      color: config.color,
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
    },
    actions: {
      display: isHovered ? 'flex' : 'none',
      gap: 4,
      position: 'absolute',
      top: 8,
      right: 8,
    },
    actionButton: {
      width: 24,
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div
      style={styles.container}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!notification.read && <div style={styles.unreadDot} />}

      {notification.avatar ? (
        <img src={notification.avatar} alt="" style={styles.avatar} />
      ) : (
        <div style={styles.icon}>{config.icon}</div>
      )}

      <div style={styles.content}>
        <div style={styles.header}>
          <h4 style={styles.title}>{notification.title}</h4>
          {(notification.priority === 'high' || notification.priority === 'urgent') && (
            <span style={styles.priority}>{notification.priority}</span>
          )}
        </div>

        {notification.message && (
          <p style={styles.message}>{notification.message}</p>
        )}

        <div style={styles.footer}>
          <span style={styles.time}>{formatTime(notification.timestamp)}</span>
          {notification.action && (
            <button
              style={styles.action}
              onClick={e => {
                e.stopPropagation();
                notification.action?.onClick();
              }}
            >
              {notification.action.label}
            </button>
          )}
        </div>
      </div>

      <div style={styles.actions}>
        {!notification.read && onMarkAsRead && (
          <button
            style={styles.actionButton}
            onClick={e => {
              e.stopPropagation();
              onMarkAsRead();
            }}
            title="Mark as read"
          >
            check
          </button>
        )}
        {notification.dismissible && onDismiss && (
          <button
            style={styles.actionButton}
            onClick={e => {
              e.stopPropagation();
              onDismiss();
            }}
            title="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== NOTIFICATION CENTER ====================

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  maxVisible = 50,
  groupByCategory = false,
  showTimestamp = true,
  onNotificationClick,
}) => {
  const {
    notifications,
    unreadCount,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = notifications
    .filter(n => filter === 'all' || !n.read)
    .slice(0, maxVisible);

  const groupedNotifications = groupByCategory
    ? filteredNotifications.reduce((acc, n) => {
        const category = n.category || 'General';
        if (!acc[category]) acc[category] = [];
        acc[category].push(n);
        return acc;
      }, {} as Record<string, Notification[]>)
    : null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg-primary)',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid var(--color-border)',
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    headerActions: {
      display: 'flex',
      gap: 8,
    },
    headerButton: {
      padding: '6px 12px',
      fontSize: 12,
      background: 'transparent',
      border: 'none',
      color: 'var(--color-accent)',
      cursor: 'pointer',
    },
    filters: {
      display: 'flex',
      gap: 4,
      padding: '8px 20px',
      borderBottom: '1px solid var(--color-border)',
    },
    filterButton: {
      padding: '6px 12px',
      fontSize: 13,
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    list: {
      flex: 1,
      overflow: 'auto',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    categoryHeader: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: '8px 4px',
      marginTop: 8,
    },
    empty: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      padding: 40,
      color: 'var(--color-text-muted)',
      textAlign: 'center',
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
      opacity: 0.5,
    },
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    onNotificationClick?.(notification);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>
          Notifications {unreadCount > 0 && `(${unreadCount})`}
        </h2>
        <div style={styles.headerActions}>
          {unreadCount > 0 && (
            <button style={styles.headerButton} onClick={markAllAsRead}>
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button style={styles.headerButton} onClick={clearAll}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <div style={styles.filters}>
        <button
          style={{
            ...styles.filterButton,
            background: filter === 'all' ? 'var(--color-accent)' : 'transparent',
            color: filter === 'all' ? 'white' : 'var(--color-text)',
          }}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          style={{
            ...styles.filterButton,
            background: filter === 'unread' ? 'var(--color-accent)' : 'transparent',
            color: filter === 'unread' ? 'white' : 'var(--color-text)',
          }}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>

      <div style={styles.list}>
        {filteredNotifications.length === 0 ? (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>bell</span>
            <p>No notifications</p>
          </div>
        ) : groupedNotifications ? (
          Object.entries(groupedNotifications).map(([category, notifs]) => (
            <div key={category}>
              <div style={styles.categoryHeader}>{category}</div>
              {notifs.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onDismiss={() => removeNotification(notification.id)}
                  onMarkAsRead={() => markAsRead(notification.id)}
                  onClick={() => handleNotificationClick(notification)}
                />
              ))}
            </div>
          ))
        ) : (
          filteredNotifications.map(notification => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onDismiss={() => removeNotification(notification.id)}
              onMarkAsRead={() => markAsRead(notification.id)}
              onClick={() => handleNotificationClick(notification)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ==================== NOTIFICATION BADGE ====================

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  showZero = false,
  dot = false,
  size = 'medium',
  color = '#ef4444',
  children,
}) => {
  const sizeConfig = {
    small: { badge: 14, font: 9, dot: 6 },
    medium: { badge: 18, font: 10, dot: 8 },
    large: { badge: 22, font: 12, dot: 10 },
  };

  const config = sizeConfig[size];

  if (count === 0 && !showZero && !dot) return <>{children}</>;

  const displayCount = count > max ? `${max}+` : count.toString();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
    },
    badge: {
      position: 'absolute',
      top: 0,
      right: 0,
      transform: 'translate(50%, -50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: dot ? config.dot : config.badge,
      height: dot ? config.dot : config.badge,
      padding: dot ? 0 : '0 4px',
      fontSize: config.font,
      fontWeight: 600,
      color: 'white',
      background: color,
      borderRadius: 100,
      border: '2px solid var(--color-bg-primary)',
    },
  };

  return (
    <span style={styles.container}>
      {children}
      <span style={styles.badge}>{dot ? null : displayCount}</span>
    </span>
  );
};

// ==================== HOOK: useNotificationHelpers ====================

export const useNotificationHelpers = () => {
  const { addNotification } = useNotifications();

  const notify = {
    info: (title: string, message?: string) =>
      addNotification({ type: 'info', title, message, priority: 'low', category: 'general' }),
    success: (title: string, message?: string) =>
      addNotification({ type: 'success', title, message, priority: 'low', category: 'general' }),
    warning: (title: string, message?: string) =>
      addNotification({ type: 'warning', title, message, priority: 'normal', category: 'general' }),
    error: (title: string, message?: string) =>
      addNotification({ type: 'error', title, message, priority: 'high', category: 'general' }),
  };

  return notify;
};

export default { NotificationProvider, NotificationCenter, NotificationItem, NotificationBadge };
