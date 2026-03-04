/**
 * DEX Card Components
 * Versatile card containers for content
 */

import React, { useState } from 'react';
import { InfoIcon } from '../utils/icons';

// ==================== TYPES ====================

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated' | 'filled';
  padding?: 'none' | 'small' | 'medium' | 'large';
  hoverable?: boolean;
  clickable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  image?: string;
  imageAlt?: string;
  imagePosition?: 'top' | 'left' | 'right';
  imageHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  avatar?: React.ReactNode;
}

interface CardFooterProps {
  children: React.ReactNode;
  divider?: boolean;
  align?: 'left' | 'center' | 'right' | 'between';
}

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

interface InfoCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
  action?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// ==================== CARD ====================

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'medium',
  hoverable = false,
  clickable = false,
  selected = false,
  disabled = false,
  onClick,
  header,
  footer,
  image,
  imageAlt,
  imagePosition = 'top',
  imageHeight = 160,
  style,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const paddingConfig = {
    none: 0,
    small: 12,
    medium: 16,
    large: 24,
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'outlined':
        return {
          background: 'transparent',
          border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: 'none',
        };
      case 'elevated':
        return {
          background: 'var(--color-bg-secondary)',
          border: 'none',
          boxShadow: isHovered && hoverable
            ? '0 8px 24px rgba(0,0,0,0.15)'
            : '0 2px 8px rgba(0,0,0,0.08)',
        };
      case 'filled':
        return {
          background: 'var(--color-bg-tertiary)',
          border: 'none',
          boxShadow: 'none',
        };
      default:
        return {
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          boxShadow: 'none',
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: imagePosition === 'left' || imagePosition === 'right' ? 'row' : 'column',
      borderRadius: 8,
      overflow: 'hidden',
      cursor: clickable || onClick ? 'pointer' : 'default',
      opacity: disabled ? 0.6 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      transition: 'all 0.2s ease',
      transform: isHovered && hoverable ? 'translateY(-2px)' : 'none',
      ...getVariantStyles(),
      ...(selected && {
        borderColor: 'var(--color-accent)',
        boxShadow: '0 0 0 2px rgba(var(--color-accent-rgb), 0.2)',
      }),
      ...style,
    },
    imageContainer: {
      flexShrink: 0,
      ...(imagePosition === 'top' && {
        width: '100%',
        height: imageHeight,
      }),
      ...((imagePosition === 'left' || imagePosition === 'right') && {
        width: imageHeight,
        height: 'auto',
      }),
      ...(imagePosition === 'right' && { order: 1 }),
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    body: {
      flex: 1,
      padding: paddingConfig[padding],
    },
  };

  return (
    <div
      style={styles.container}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {image && (
        <div style={styles.imageContainer}>
          <img src={image} alt={imageAlt || ''} style={styles.image} />
        </div>
      )}
      <div style={styles.content}>
        {header}
        <div style={styles.body}>{children}</div>
        {footer}
      </div>
    </div>
  );
};

// ==================== CARD HEADER ====================

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  avatar,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderBottom: '1px solid var(--color-border)',
    },
    avatar: {
      flexShrink: 0,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      lineHeight: 1.3,
    },
    subtitle: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      margin: 0,
      marginTop: 2,
    },
    action: {
      flexShrink: 0,
    },
  };

  return (
    <div style={styles.container}>
      {avatar && <div style={styles.avatar}>{avatar}</div>}
      <div style={styles.content}>
        <h3 style={styles.title}>{title}</h3>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
};

// ==================== CARD FOOTER ====================

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  divider = true,
  align = 'right',
}) => {
  const alignConfig = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
    between: 'space-between',
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: alignConfig[align],
    gap: 8,
    padding: '12px 16px',
    borderTop: divider ? '1px solid var(--color-border)' : 'none',
  };

  return <div style={styles}>{children}</div>;
};

// ==================== STAT CARD ====================

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon,
  trend = 'neutral',
  loading = false,
}) => {
  const trendColors = {
    up: '#10b981',
    down: '#ef4444',
    neutral: 'var(--color-text-muted)',
  };

  const trendIcons = {
    up: 'arrow-up',
    down: 'arrow-down',
    neutral: 'arrow-right',
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      padding: 20,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
    icon: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      fontSize: 18,
    },
    value: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
      lineHeight: 1.2,
    },
    change: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
      fontSize: 13,
      color: trendColors[trend],
    },
    changeLabel: {
      color: 'var(--color-text-muted)',
    },
    loading: {
      width: 80,
      height: 32,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 4,
      animation: 'pulse 1.5s infinite',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>{title}</h4>
        {icon && <div style={styles.icon}>{icon}</div>}
      </div>
      {loading ? (
        <div style={styles.loading} />
      ) : (
        <>
          <p style={styles.value}>{value}</p>
          {change !== undefined && (
            <div style={styles.change}>
              <span>{trendIcons[trend]}</span>
              <span>{Math.abs(change)}%</span>
              {changeLabel && (
                <span style={styles.changeLabel}>{changeLabel}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ==================== INFO CARD ====================

export const InfoCard: React.FC<InfoCardProps> = ({
  title,
  description,
  icon,
  variant = 'info',
  action,
  dismissible = false,
  onDismiss,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const variantConfig = {
    info: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', icon: <InfoIcon size={16} /> },
    success: { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', icon: 'check' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', icon: 'alert-triangle' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', icon: 'x' },
  };

  const config = variantConfig[variant];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 12,
      padding: 16,
      background: config.bg,
      borderLeft: `4px solid ${config.border}`,
      borderRadius: '0 8px 8px 0',
    },
    icon: {
      fontSize: 20,
      flexShrink: 0,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 4,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
      margin: 0,
      lineHeight: 1.5,
    },
    actions: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    },
    dismissButton: {
      padding: 4,
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 18,
      lineHeight: 1,
    },
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>{icon || config.icon}</span>
      <div style={styles.content}>
        <h4 style={styles.title}>{title}</h4>
        <p style={styles.description}>{description}</p>
      </div>
      <div style={styles.actions}>
        {action}
        {dismissible && (
          <button style={styles.dismissButton} onClick={handleDismiss}>
            ×
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== FEATURE CARD ====================

export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  action,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: 24,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
    },
    icon: {
      width: 56,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-accent)',
      borderRadius: 12,
      fontSize: 28,
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
      lineHeight: 1.5,
    },
    action: {
      marginTop: 16,
      padding: '8px 16px',
      background: 'var(--color-accent)',
      color: 'white',
      border: 'none',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>{icon}</div>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.description}>{description}</p>
      {action && (
        <button style={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
};

// ==================== EMPTY CARD ====================

interface EmptyCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyCard: React.FC<EmptyCardProps> = ({
  title,
  description,
  icon,
  action,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      textAlign: 'center',
      background: 'var(--color-bg-secondary)',
      border: '2px dashed var(--color-border)',
      borderRadius: 8,
    },
    icon: {
      fontSize: 48,
      marginBottom: 16,
      opacity: 0.5,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 300,
    },
    action: {
      marginTop: 20,
      padding: '10px 20px',
      background: 'var(--color-accent)',
      color: 'white',
      border: 'none',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container}>
      {icon && <div style={styles.icon}>{icon}</div>}
      <h3 style={styles.title}>{title}</h3>
      {description && <p style={styles.description}>{description}</p>}
      {action && (
        <button style={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
};

// ==================== MEDIA CARD ====================

interface MediaCardProps {
  image: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: React.ReactNode;
  overlay?: boolean;
  onClick?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  image,
  title,
  subtitle,
  meta,
  badge,
  overlay = true,
  onClick,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      borderRadius: 8,
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
      aspectRatio: '16/9',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    overlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      background: overlay
        ? 'linear-gradient(transparent, rgba(0,0,0,0.8))'
        : 'transparent',
      color: 'white',
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      margin: 0,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      opacity: 0.8,
      margin: 0,
    },
    meta: {
      fontSize: 12,
      opacity: 0.6,
      margin: 0,
      marginTop: 4,
    },
    badge: {
      position: 'absolute',
      top: 12,
      right: 12,
    },
  };

  return (
    <div style={styles.container} onClick={onClick}>
      <img src={image} alt={title} style={styles.image} />
      {badge && <div style={styles.badge}>{badge}</div>}
      <div style={styles.overlay}>
        <h3 style={styles.title}>{title}</h3>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        {meta && <p style={styles.meta}>{meta}</p>}
      </div>
    </div>
  );
};

export default Card;
