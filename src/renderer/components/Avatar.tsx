/**
 * DEX Avatar Component
 * User avatars and profile images
 */

import React, { useState } from 'react';

// ==================== TYPES ====================

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type AvatarShape = 'circle' | 'square' | 'rounded';
type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  status?: AvatarStatus;
  showStatus?: boolean;
  fallback?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: AvatarSize;
  spacing?: number;
}

interface InitialsAvatarProps {
  name: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  colorScheme?: 'random' | 'fixed' | string;
}

// ==================== SIZE CONFIG ====================

const sizeConfig: Record<AvatarSize, { size: number; fontSize: number; statusSize: number }> = {
  xs: { size: 24, fontSize: 10, statusSize: 6 },
  sm: { size: 32, fontSize: 12, statusSize: 8 },
  md: { size: 40, fontSize: 14, statusSize: 10 },
  lg: { size: 48, fontSize: 16, statusSize: 12 },
  xl: { size: 64, fontSize: 20, statusSize: 14 },
  '2xl': { size: 96, fontSize: 32, statusSize: 18 },
};

// ==================== AVATAR ====================

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  shape = 'circle',
  status,
  showStatus = false,
  fallback,
  style,
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);
  const config = sizeConfig[size];

  const getInitials = (name?: string): string => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getColorFromName = (name?: string): string => {
    const colors = [
      '#f87171', '#fb923c', '#fbbf24', '#a3e635',
      '#34d399', '#22d3d8', '#38bdf8', '#818cf8',
      '#a78bfa', '#e879f9', '#fb7185',
    ];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getBorderRadius = (): string | number => {
    switch (shape) {
      case 'circle': return '50%';
      case 'square': return 0;
      case 'rounded': return 8;
      default: return '50%';
    }
  };

  const statusColors: Record<AvatarStatus, string> = {
    online: '#10b981',
    offline: '#6b7280',
    busy: '#ef4444',
    away: '#f59e0b',
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: config.size,
      height: config.size,
      borderRadius: getBorderRadius(),
      overflow: 'hidden',
      background: getColorFromName(name),
      cursor: onClick ? 'pointer' : 'default',
      flexShrink: 0,
      ...style,
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    initials: {
      fontSize: config.fontSize,
      fontWeight: 600,
      color: 'white',
      textTransform: 'uppercase',
      userSelect: 'none',
    },
    status: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: config.statusSize,
      height: config.statusSize,
      borderRadius: '50%',
      border: '2px solid var(--color-bg-primary)',
      background: status ? statusColors[status] : statusColors.offline,
    },
  };

  const renderContent = () => {
    if (src && !imgError) {
      return (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          style={styles.image}
          onError={() => setImgError(true)}
        />
      );
    }

    if (fallback) {
      return fallback;
    }

    return <span style={styles.initials}>{getInitials(name)}</span>;
  };

  return (
    <div style={styles.container} onClick={onClick}>
      {renderContent()}
      {showStatus && status && <div style={styles.status} />}
    </div>
  );
};

// ==================== INITIALS AVATAR ====================

export const InitialsAvatar: React.FC<InitialsAvatarProps> = ({
  name,
  size = 'md',
  shape = 'circle',
  colorScheme = 'random',
}) => {
  const config = sizeConfig[size];

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getColor = (): string => {
    if (colorScheme !== 'random' && colorScheme !== 'fixed') {
      return colorScheme;
    }

    const colors = [
      '#f87171', '#fb923c', '#fbbf24', '#a3e635',
      '#34d399', '#22d3d8', '#38bdf8', '#818cf8',
      '#a78bfa', '#e879f9', '#fb7185',
    ];

    if (colorScheme === 'fixed') {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    }

    return colors[Math.floor(Math.random() * colors.length)];
  };

  const getBorderRadius = (): string | number => {
    switch (shape) {
      case 'circle': return '50%';
      case 'square': return 0;
      case 'rounded': return 8;
      default: return '50%';
    }
  };

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: config.size,
    height: config.size,
    borderRadius: getBorderRadius(),
    background: getColor(),
    fontSize: config.fontSize,
    fontWeight: 600,
    color: 'white',
    userSelect: 'none',
  };

  return <div style={styles}>{getInitials(name)}</div>;
};

// ==================== AVATAR GROUP ====================

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  children,
  max = 5,
  size = 'md',
  spacing = -8,
}) => {
  const childArray = React.Children.toArray(children);
  const displayedChildren = childArray.slice(0, max);
  const remaining = childArray.length - max;
  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
    },
    avatarWrapper: {
      marginLeft: spacing,
      border: '2px solid var(--color-bg-primary)',
      borderRadius: '50%',
      background: 'var(--color-bg-primary)',
    },
    firstWrapper: {
      marginLeft: 0,
    },
    remaining: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: config.size,
      height: config.size,
      marginLeft: spacing,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      border: '2px solid var(--color-bg-primary)',
      fontSize: config.fontSize - 2,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {displayedChildren.map((child, index) => (
        <div
          key={index}
          style={{
            ...styles.avatarWrapper,
            ...(index === 0 ? styles.firstWrapper : {}),
            zIndex: displayedChildren.length - index,
          }}
        >
          {React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, { size })
            : child}
        </div>
      ))}
      {remaining > 0 && (
        <div style={styles.remaining}>+{remaining}</div>
      )}
    </div>
  );
};

// ==================== AVATAR WITH TEXT ====================

interface AvatarWithTextProps extends AvatarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  reverse?: boolean;
}

export const AvatarWithText: React.FC<AvatarWithTextProps> = ({
  title,
  subtitle,
  action,
  reverse = false,
  ...avatarProps
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexDirection: reverse ? 'row-reverse' : 'row',
    },
    content: {
      flex: 1,
      minWidth: 0,
      textAlign: reverse ? 'right' : 'left',
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    subtitle: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      margin: 0,
      marginTop: 2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    action: {
      flexShrink: 0,
    },
  };

  return (
    <div style={styles.container}>
      <Avatar {...avatarProps} />
      <div style={styles.content}>
        <p style={styles.title}>{title}</p>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
};

// ==================== AVATAR UPLOAD ====================

interface AvatarUploadProps {
  src?: string;
  size?: AvatarSize;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  src,
  size = 'xl',
  onUpload,
  onRemove,
  accept = 'image/*',
  maxSize = 5 * 1024 * 1024, // 5MB
  disabled = false,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const config = sizeConfig[size];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > maxSize) {
      setError(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    onUpload?.(file);
  };

  const handleRemove = () => {
    setPreview(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onRemove?.();
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    },
    avatarWrapper: {
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
    },
    avatar: {
      width: config.size,
      height: config.size,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      border: '2px dashed var(--color-border)',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    placeholder: {
      fontSize: config.fontSize + 8,
      color: 'var(--color-text-muted)',
    },
    overlay: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      borderRadius: '50%',
      opacity: 0,
      transition: 'opacity 0.2s',
      color: 'white',
      fontSize: 20,
    },
    input: {
      display: 'none',
    },
    actions: {
      display: 'flex',
      gap: 8,
    },
    button: {
      padding: '4px 12px',
      fontSize: 12,
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      background: 'var(--color-bg-secondary)',
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    error: {
      fontSize: 12,
      color: 'var(--color-error)',
    },
  };

  const imageSrc = preview || src;

  return (
    <div style={styles.container}>
      <div
        style={styles.avatarWrapper}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <div style={styles.avatar}>
          {imageSrc ? (
            <img src={imageSrc} alt="Avatar" style={styles.image} />
          ) : (
            <span style={styles.placeholder}>camera</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
          style={styles.input}
        />
      </div>

      {imageSrc && (
        <div style={styles.actions}>
          <button
            style={styles.button}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            Change
          </button>
          <button
            style={styles.button}
            onClick={handleRemove}
            disabled={disabled}
          >
            Remove
          </button>
        </div>
      )}

      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
};

// ==================== AVATAR STACK ====================

interface AvatarStackProps {
  avatars: Array<{ src?: string; name?: string }>;
  size?: AvatarSize;
  direction?: 'left' | 'right';
  max?: number;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({
  avatars,
  size = 'sm',
  direction = 'right',
  max = 4,
}) => {
  const displayed = avatars.slice(0, max);
  const remaining = avatars.length - max;
  const config = sizeConfig[size];
  const overlap = config.size * 0.3;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      flexDirection: direction === 'left' ? 'row-reverse' : 'row',
    },
    avatar: {
      marginLeft: direction === 'right' ? -overlap : 0,
      marginRight: direction === 'left' ? -overlap : 0,
      border: '2px solid var(--color-bg-primary)',
      borderRadius: '50%',
    },
    first: {
      marginLeft: 0,
      marginRight: 0,
    },
    remaining: {
      width: config.size,
      height: config.size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: direction === 'right' ? -overlap : 0,
      marginRight: direction === 'left' ? -overlap : 0,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      border: '2px solid var(--color-bg-primary)',
      fontSize: config.fontSize - 2,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {displayed.map((avatar, index) => (
        <div
          key={index}
          style={{
            ...styles.avatar,
            ...(index === 0 ? styles.first : {}),
            zIndex: direction === 'right' ? displayed.length - index : index,
          }}
        >
          <Avatar src={avatar.src} name={avatar.name} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div style={{ ...styles.remaining, zIndex: 0 }}>
          +{remaining}
        </div>
      )}
    </div>
  );
};

export default Avatar;
