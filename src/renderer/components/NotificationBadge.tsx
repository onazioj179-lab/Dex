/**
 * DEX Notification Badge Component
 * Notification indicators and counters
 */

import React, { useState, useEffect } from 'react';

// ==================== TYPES ====================

interface NotificationBadgeProps {
  count?: number;
  dot?: boolean;
  max?: number;
  offset?: [number, number];
  color?: string;
  showZero?: boolean;
  children: React.ReactNode;
}

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'away' | 'busy' | 'invisible';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

interface PresenceIndicatorProps {
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen?: Date;
  showLastSeen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface UnreadIndicatorProps {
  count: number;
  variant?: 'dot' | 'count' | 'text';
  text?: string;
}

interface AvatarWithBadgeProps {
  src?: string;
  name: string;
  size?: number;
  status?: 'online' | 'offline' | 'away' | 'busy';
  notificationCount?: number;
}

// ==================== NOTIFICATION BADGE ====================

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count = 0,
  dot = false,
  max = 99,
  offset = [0, 0],
  color = '#ef4444',
  showZero = false,
  children,
}) => {
  const shouldShow = dot || count > 0 || (showZero && count === 0);
  const displayCount = count > max ? `${max}+` : count.toString();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
    },
    badge: {
      position: 'absolute',
      top: offset[1],
      right: offset[0],
      transform: 'translate(50%, -50%)',
      minWidth: dot ? 8 : 18,
      height: dot ? 8 : 18,
      padding: dot ? 0 : '0 6px',
      borderRadius: dot ? '50%' : 9,
      background: color,
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--color-bg-secondary)',
      boxSizing: 'border-box',
    },
  };

  return (
    <div style={styles.container}>
      {children}
      {shouldShow && (
        <span style={styles.badge}>
          {!dot && displayCount}
        </span>
      )}
    </div>
  );
};

// ==================== STATUS INDICATOR ====================

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'md',
  pulse = true,
}) => {
  const sizes = {
    sm: 8,
    md: 12,
    lg: 16,
  };

  const colors = {
    online: '#22c55e',
    offline: '#6b7280',
    away: '#f59e0b',
    busy: '#ef4444',
    invisible: '#6b7280',
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    indicator: {
      position: 'relative',
      width: s,
      height: s,
      borderRadius: '50%',
      background: colors[status],
      border: '2px solid var(--color-bg-secondary)',
    },
    pulse: {
      position: 'absolute',
      inset: -2,
      borderRadius: '50%',
      background: colors[status],
      opacity: 0.4,
      animation: 'pulse 2s infinite',
    },
  };

  return (
    <div style={styles.indicator}>
      {pulse && status === 'online' && <div style={styles.pulse} />}
    </div>
  );
};

// ==================== PRESENCE INDICATOR ====================

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  status,
  lastSeen,
  showLastSeen = true,
  size = 'md',
}) => {
  const [relativeTime, setRelativeTime] = useState('');

  useEffect(() => {
    if (!lastSeen || status !== 'offline') return;

    const updateTime = () => {
      const now = new Date();
      const diff = now.getTime() - lastSeen.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setRelativeTime(`${days}d ago`);
      } else if (hours > 0) {
        setRelativeTime(`${hours}h ago`);
      } else if (minutes > 0) {
        setRelativeTime(`${minutes}m ago`);
      } else {
        setRelativeTime('Just now');
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [lastSeen, status]);

  const statusLabels = {
    online: 'Online',
    offline: 'Offline',
    away: 'Away',
    busy: 'Do not disturb',
  };

  const sizes = {
    sm: { dot: 8, font: 11 },
    md: { dot: 10, font: 12 },
    lg: { dot: 12, font: 13 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    text: {
      fontSize: s.font,
      color: 'var(--color-text-muted)',
    },
    lastSeen: {
      fontSize: s.font - 1,
      color: 'var(--color-text-muted)',
      opacity: 0.7,
    },
  };

  return (
    <div style={styles.container}>
      <StatusIndicator status={status} size={size} pulse={status === 'online'} />
      <span style={styles.text}>{statusLabels[status]}</span>
      {showLastSeen && status === 'offline' && lastSeen && (
        <span style={styles.lastSeen}>• {relativeTime}</span>
      )}
    </div>
  );
};

// ==================== UNREAD INDICATOR ====================

export const UnreadIndicator: React.FC<UnreadIndicatorProps> = ({
  count,
  variant = 'count',
  text = 'New',
}) => {
  if (count === 0) return null;

  const styles: Record<string, React.CSSProperties> = {
    dot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--color-accent)',
    },
    count: {
      minWidth: 20,
      height: 20,
      padding: '0 6px',
      borderRadius: 10,
      background: 'var(--color-accent)',
      fontSize: 11,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      padding: '2px 8px',
      borderRadius: 4,
      background: 'var(--color-accent)',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      textTransform: 'uppercase',
    },
  };

  switch (variant) {
    case 'dot':
      return <div style={styles.dot} />;
    case 'text':
      return <span style={styles.text}>{text}</span>;
    default:
      return <span style={styles.count}>{count > 99 ? '99+' : count}</span>;
  }
};

// ==================== AVATAR WITH BADGE ====================

export const AvatarWithBadge: React.FC<AvatarWithBadgeProps> = ({
  src,
  name,
  size = 48,
  status,
  notificationCount,
}) => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const statusSize = size < 40 ? 'sm' : size < 56 ? 'md' : 'lg';

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: size,
      height: size,
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.4,
      fontWeight: 600,
      color: '#fff',
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    status: {
      position: 'absolute',
      bottom: 0,
      right: 0,
    },
    notification: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      padding: '0 6px',
      borderRadius: 9,
      background: '#ef4444',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--color-bg-secondary)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.avatar}>
        {src ? (
          <img src={src} alt={name} style={styles.image} />
        ) : (
          initials
        )}
      </div>

      {status && (
        <div style={styles.status}>
          <StatusIndicator status={status} size={statusSize} />
        </div>
      )}

      {notificationCount !== undefined && notificationCount > 0 && (
        <span style={styles.notification}>
          {notificationCount > 99 ? '99+' : notificationCount}
        </span>
      )}
    </div>
  );
};

// ==================== ACTIVITY INDICATOR ====================

interface ActivityIndicatorProps {
  type: 'typing' | 'recording' | 'live';
  label?: string;
}

export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  type,
  label,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'typing':
        return 'message-circle';
      case 'recording':
        return 'circle';
      case 'live':
        return 'circle';
      default:
        return '';
    }
  };

  const getLabel = () => {
    if (label) return label;
    switch (type) {
      case 'typing':
        return 'Typing...';
      case 'recording':
        return 'Recording';
      case 'live':
        return 'LIVE';
      default:
        return '';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      background: type === 'live' ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-bg-tertiary)',
      borderRadius: 12,
    },
    icon: {
      fontSize: 12,
      animation: type === 'recording' || type === 'live' ? 'pulse 1s infinite' : undefined,
    },
    label: {
      fontSize: 12,
      fontWeight: type === 'live' ? 700 : 500,
      color: type === 'live' ? '#ef4444' : 'var(--color-text)',
      textTransform: type === 'live' ? 'uppercase' : undefined,
    },
    dots: {
      display: 'flex',
      gap: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: '50%',
      background: 'var(--color-text-muted)',
      animation: 'bounce 1s infinite',
    },
  };

  return (
    <div style={styles.container}>
      {type === 'typing' ? (
        <div style={styles.dots}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                ...styles.dot,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      ) : (
        <span style={styles.icon}>{getIcon()}</span>
      )}
      <span style={styles.label}>{getLabel()}</span>
    </div>
  );
};

// ==================== RIBBON BADGE ====================

interface RibbonBadgeProps {
  text: string;
  color?: string;
  position?: 'top-left' | 'top-right';
  children: React.ReactNode;
}

export const RibbonBadge: React.FC<RibbonBadgeProps> = ({
  text,
  color = 'var(--color-accent)',
  position = 'top-right',
  children,
}) => {
  const isLeft = position === 'top-left';

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      overflow: 'hidden',
    },
    ribbon: {
      position: 'absolute',
      top: 16,
      [isLeft ? 'left' : 'right']: -32,
      width: 120,
      padding: '4px 0',
      background: color,
      color: '#fff',
      fontSize: 11,
      fontWeight: 600,
      textAlign: 'center',
      textTransform: 'uppercase',
      transform: isLeft ? 'rotate(-45deg)' : 'rotate(45deg)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      zIndex: 1,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.ribbon}>{text}</div>
      {children}
    </div>
  );
};

// ==================== ICON BADGE ====================

interface IconBadgeProps {
  icon: React.ReactNode;
  count?: number;
  dot?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const IconBadge: React.FC<IconBadgeProps> = ({
  icon,
  count = 0,
  dot = false,
  onClick,
  size = 'md',
}) => {
  const sizes = {
    sm: { button: 32, icon: 16, badge: 14 },
    md: { button: 40, icon: 20, badge: 18 },
    lg: { button: 48, icon: 24, badge: 20 },
  };

  const s = sizes[size];
  const showBadge = dot || count > 0;

  const styles: Record<string, React.CSSProperties> = {
    button: {
      position: 'relative',
      width: s.button,
      height: s.button,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: s.icon,
      color: 'var(--color-text)',
      transition: 'background 0.15s',
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: dot ? 10 : s.badge,
      height: dot ? 10 : s.badge,
      padding: dot ? 0 : '0 4px',
      borderRadius: dot ? '50%' : s.badge / 2,
      background: '#ef4444',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--color-bg-secondary)',
    },
  };

  return (
    <button
      style={styles.button}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)';
      }}
    >
      {icon}
      {showBadge && (
        <span style={styles.badge}>
          {!dot && (count > 99 ? '99+' : count)}
        </span>
      )}
    </button>
  );
};

export default NotificationBadge;
