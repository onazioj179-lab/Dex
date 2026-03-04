/**
 * DEX Badge Component
 * Labels, tags, and status indicators
 */

import React from 'react';

// ==================== TYPES ====================

type BadgeVariant = 'default' | 'solid' | 'outline' | 'subtle';
type BadgeColor = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'small' | 'medium' | 'large';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  color?: BadgeColor;
  size?: BadgeSize;
  rounded?: boolean;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'away' | 'idle';
  size?: number;
  pulse?: boolean;
}

interface CountBadgeProps {
  count: number;
  max?: number;
  showZero?: boolean;
  size?: BadgeSize;
  color?: BadgeColor;
}

interface AvatarBadgeProps {
  children: React.ReactNode;
  badge?: React.ReactNode;
  count?: number;
  dot?: boolean;
  status?: 'online' | 'offline' | 'busy' | 'away';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

interface TagProps extends Omit<BadgeProps, 'removable' | 'onRemove'> {
  closable?: boolean;
  onClose?: () => void;
}

// ==================== COLOR CONFIG ====================

const colorConfig: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  default: {
    bg: 'var(--color-bg-tertiary)',
    text: 'var(--color-text)',
    border: 'var(--color-border)',
  },
  primary: {
    bg: 'var(--color-accent)',
    text: 'white',
    border: 'var(--color-accent)',
  },
  success: {
    bg: '#10b981',
    text: 'white',
    border: '#10b981',
  },
  warning: {
    bg: '#f59e0b',
    text: 'white',
    border: '#f59e0b',
  },
  error: {
    bg: '#ef4444',
    text: 'white',
    border: '#ef4444',
  },
  info: {
    bg: '#3b82f6',
    text: 'white',
    border: '#3b82f6',
  },
};

// ==================== BADGE ====================

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  color = 'default',
  size = 'medium',
  rounded = false,
  dot = false,
  removable = false,
  onRemove,
  icon,
  style,
}) => {
  const colors = colorConfig[color];

  const sizeConfig = {
    small: { padding: '2px 6px', fontSize: 10, height: 18 },
    medium: { padding: '3px 8px', fontSize: 12, height: 22 },
    large: { padding: '4px 12px', fontSize: 14, height: 28 },
  };

  const config = sizeConfig[size];

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'solid':
        return {
          background: colors.bg,
          color: colors.text,
          border: 'none',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: color === 'default' ? colors.text : colors.bg,
          border: `1px solid ${colors.border}`,
        };
      case 'subtle':
        return {
          background: color === 'default' ? colors.bg : `${colors.bg}20`,
          color: color === 'default' ? colors.text : colors.bg,
          border: 'none',
        };
      default:
        return {
          background: colors.bg,
          color: colors.text,
          border: 'none',
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      height: config.height,
      padding: config.padding,
      fontSize: config.fontSize,
      fontWeight: 500,
      lineHeight: 1,
      borderRadius: rounded ? 100 : 4,
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
      ...getVariantStyles(),
      ...style,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      fontSize: config.fontSize + 2,
    },
    removeButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
      marginRight: -2,
      width: config.height - 8,
      height: config.height - 8,
      padding: 0,
      background: 'transparent',
      border: 'none',
      borderRadius: '50%',
      color: 'inherit',
      opacity: 0.7,
      cursor: 'pointer',
      fontSize: config.fontSize + 2,
      lineHeight: 1,
    },
  };

  return (
    <span style={styles.badge}>
      {dot && <span style={styles.dot} />}
      {icon && <span style={styles.icon}>{icon}</span>}
      {children}
      {removable && (
        <button
          style={styles.removeButton}
          onClick={e => {
            e.stopPropagation();
            onRemove?.();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

// ==================== TAG ====================

export const Tag: React.FC<TagProps> = ({
  closable = false,
  onClose,
  ...props
}) => {
  return (
    <Badge
      {...props}
      rounded
      removable={closable}
      onRemove={onClose}
    />
  );
};

// ==================== STATUS DOT ====================

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 10,
  pulse = false,
}) => {
  const statusColors: Record<string, string> = {
    online: '#10b981',
    offline: '#6b7280',
    busy: '#ef4444',
    away: '#f59e0b',
    idle: '#f59e0b',
  };

  const color = statusColors[status] || statusColors.offline;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
    },
    pulse: {
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      opacity: 0.4,
      animation: 'pulse 2s infinite',
    },
  };

  return (
    <span style={styles.container}>
      {pulse && <span style={styles.pulse} />}
      <span style={styles.dot} />
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.4; }
            50% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}
      </style>
    </span>
  );
};

// ==================== COUNT BADGE ====================

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  max = 99,
  showZero = false,
  size = 'small',
  color = 'error',
}) => {
  if (count === 0 && !showZero) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <Badge variant="solid" color={color} size={size} rounded>
      {displayCount}
    </Badge>
  );
};

// ==================== AVATAR BADGE ====================

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  children,
  badge,
  count,
  dot = false,
  status,
  position = 'top-right',
}) => {
  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: 0, right: 0, transform: 'translate(25%, -25%)' },
    'top-left': { top: 0, left: 0, transform: 'translate(-25%, -25%)' },
    'bottom-right': { bottom: 0, right: 0, transform: 'translate(25%, 25%)' },
    'bottom-left': { bottom: 0, left: 0, transform: 'translate(-25%, 25%)' },
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
    },
    badge: {
      position: 'absolute',
      ...positionStyles[position],
      zIndex: 1,
    },
  };

  const renderBadge = () => {
    if (badge) return badge;
    if (count !== undefined) return <CountBadge count={count} />;
    if (dot) {
      return (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            border: '2px solid var(--color-bg-primary)',
          }}
        />
      );
    }
    if (status) return <StatusDot status={status} size={12} />;
    return null;
  };

  const badgeContent = renderBadge();

  return (
    <span style={styles.container}>
      {children}
      {badgeContent && <span style={styles.badge}>{badgeContent}</span>}
    </span>
  );
};

// ==================== LABEL ====================

interface LabelProps {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  hint?: string;
}

export const Label: React.FC<LabelProps> = ({
  children,
  required = false,
  htmlFor,
  hint,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    required: {
      color: 'var(--color-error)',
    },
    hint: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      fontWeight: 400,
    },
  };

  return (
    <div style={styles.container}>
      <label style={styles.label} htmlFor={htmlFor}>
        {children}
        {required && <span style={styles.required}> *</span>}
      </label>
      {hint && <span style={styles.hint}>({hint})</span>}
    </div>
  );
};

// ==================== CHIP (Interactive Tag) ====================

interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  avatar?: React.ReactNode;
  deletable?: boolean;
  onDelete?: () => void;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'outlined';
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onClick,
  disabled = false,
  icon,
  avatar,
  deletable = false,
  onDelete,
  size = 'medium',
  variant = 'default',
}) => {
  const sizeConfig = {
    small: { height: 24, padding: '0 8px', fontSize: 12 },
    medium: { height: 32, padding: '0 12px', fontSize: 13 },
    large: { height: 40, padding: '0 16px', fontSize: 14 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: config.height,
      padding: config.padding,
      paddingLeft: avatar ? 4 : undefined,
      fontSize: config.fontSize,
      fontWeight: 500,
      borderRadius: 100,
      background: selected
        ? 'var(--color-accent)'
        : variant === 'outlined'
        ? 'transparent'
        : 'var(--color-bg-tertiary)',
      color: selected ? 'white' : 'var(--color-text)',
      border: variant === 'outlined' ? '1px solid var(--color-border)' : 'none',
      cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
      opacity: disabled ? 0.6 : 1,
      transition: 'all 0.15s',
      outline: 'none',
    },
    avatar: {
      width: config.height - 8,
      height: config.height - 8,
      borderRadius: '50%',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: config.height - 12,
      height: config.height - 12,
      marginLeft: -2,
      marginRight: -4,
      padding: 0,
      background: 'rgba(0,0,0,0.1)',
      border: 'none',
      borderRadius: '50%',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 12,
    },
  };

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onDelete) {
      onDelete();
    }
  };

  return (
    <button style={styles.chip} onClick={handleClick} disabled={disabled}>
      {avatar && <span style={styles.avatar}>{avatar}</span>}
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {deletable && (
        <button style={styles.deleteButton} onClick={handleDelete}>
          ×
        </button>
      )}
    </button>
  );
};

// ==================== PRIORITY BADGE ====================

interface PriorityBadgeProps {
  priority: 'low' | 'medium' | 'high' | 'critical';
  showLabel?: boolean;
  size?: BadgeSize;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  showLabel = true,
  size = 'small',
}) => {
  const priorityConfig: Record<string, { color: BadgeColor; label: string; icon: string }> = {
    low: { color: 'default', label: 'Low', icon: 'arrow-down' },
    medium: { color: 'warning', label: 'Medium', icon: 'arrow-right' },
    high: { color: 'error', label: 'High', icon: 'arrow-up' },
    critical: { color: 'error', label: 'Critical', icon: 'alert-triangle' },
  };

  const config = priorityConfig[priority];

  return (
    <Badge variant="subtle" color={config.color} size={size} icon={config.icon}>
      {showLabel && config.label}
    </Badge>
  );
};

// ==================== STATUS BADGE ====================

interface StatusBadgeProps {
  status: 'pending' | 'active' | 'completed' | 'failed' | 'paused';
  showLabel?: boolean;
  size?: BadgeSize;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showLabel = true,
  size = 'small',
}) => {
  const statusConfig: Record<string, { color: BadgeColor; label: string }> = {
    pending: { color: 'warning', label: 'Pending' },
    active: { color: 'info', label: 'Active' },
    completed: { color: 'success', label: 'Completed' },
    failed: { color: 'error', label: 'Failed' },
    paused: { color: 'default', label: 'Paused' },
  };

  const config = statusConfig[status];

  return (
    <Badge variant="subtle" color={config.color} size={size} dot>
      {showLabel && config.label}
    </Badge>
  );
};

export default Badge;
