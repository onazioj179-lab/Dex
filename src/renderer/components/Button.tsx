/**
 * DEX Button Components
 * Various button styles and variants
 */

import React, { useState, forwardRef } from 'react';

// ==================== TYPES ====================

type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'link' | 'soft';
type ButtonColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'default';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  rounded?: boolean;
  active?: boolean;
}

interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children' | 'loadingText'> {
  icon: React.ReactNode;
  'aria-label': string;
}

interface ButtonGroupProps {
  children: React.ReactNode;
  attached?: boolean;
  orientation?: 'horizontal' | 'vertical';
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
}

// ==================== COLOR CONFIG ====================

const colorConfig: Record<ButtonColor, { bg: string; hover: string; text: string; border: string }> = {
  primary: {
    bg: 'var(--color-accent)',
    hover: 'var(--color-accent-hover)',
    text: 'white',
    border: 'var(--color-accent)',
  },
  secondary: {
    bg: 'var(--color-bg-tertiary)',
    hover: 'var(--color-bg-hover)',
    text: 'var(--color-text)',
    border: 'var(--color-border)',
  },
  success: {
    bg: '#10b981',
    hover: '#059669',
    text: 'white',
    border: '#10b981',
  },
  warning: {
    bg: '#f59e0b',
    hover: '#d97706',
    text: 'white',
    border: '#f59e0b',
  },
  error: {
    bg: '#ef4444',
    hover: '#dc2626',
    text: 'white',
    border: '#ef4444',
  },
  default: {
    bg: 'var(--color-bg-secondary)',
    hover: 'var(--color-bg-hover)',
    text: 'var(--color-text)',
    border: 'var(--color-border)',
  },
};

// ==================== SIZE CONFIG ====================

const sizeConfig: Record<ButtonSize, { height: number; padding: string; fontSize: number; iconSize: number }> = {
  xs: { height: 24, padding: '0 8px', fontSize: 11, iconSize: 12 },
  sm: { height: 32, padding: '0 12px', fontSize: 13, iconSize: 14 },
  md: { height: 40, padding: '0 16px', fontSize: 14, iconSize: 16 },
  lg: { height: 48, padding: '0 24px', fontSize: 16, iconSize: 18 },
  xl: { height: 56, padding: '0 32px', fontSize: 18, iconSize: 20 },
};

// ==================== BUTTON ====================

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'solid',
  color = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  loadingText,
  fullWidth = false,
  rounded = false,
  active = false,
  disabled,
  children,
  style,
  ...props
}, ref) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const colors = colorConfig[color];
  const sizes = sizeConfig[size];

  const getVariantStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      transition: 'all 0.15s ease',
    };

    switch (variant) {
      case 'solid':
        return {
          ...base,
          background: isPressed ? colors.hover : isHovered ? colors.hover : colors.bg,
          color: colors.text,
          border: 'none',
        };
      case 'outline':
        return {
          ...base,
          background: isHovered || isPressed ? `${colors.bg}10` : 'transparent',
          color: colors.bg === 'var(--color-bg-secondary)' ? colors.text : colors.bg,
          border: `1px solid ${colors.border}`,
        };
      case 'ghost':
        return {
          ...base,
          background: isHovered || isPressed ? `${colors.bg}10` : 'transparent',
          color: colors.bg === 'var(--color-bg-secondary)' ? colors.text : colors.bg,
          border: 'none',
        };
      case 'link':
        return {
          ...base,
          background: 'transparent',
          color: colors.bg === 'var(--color-bg-secondary)' ? colors.text : colors.bg,
          border: 'none',
          textDecoration: isHovered ? 'underline' : 'none',
          padding: 0,
          height: 'auto',
        };
      case 'soft':
        return {
          ...base,
          background: isPressed
            ? `${colors.bg}30`
            : isHovered
            ? `${colors.bg}20`
            : `${colors.bg}15`,
          color: colors.bg === 'var(--color-bg-secondary)' ? colors.text : colors.bg,
          border: 'none',
        };
      default:
        return base;
    }
  };

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: variant === 'link' ? 'auto' : sizes.height,
    padding: variant === 'link' ? 0 : sizes.padding,
    fontSize: sizes.fontSize,
    fontWeight: 500,
    borderRadius: rounded ? 100 : 6,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    outline: 'none',
    userSelect: 'none',
    ...getVariantStyles(),
    ...(active && { background: colors.hover }),
    ...style,
  };

  const Spinner = () => (
    <span
      style={{
        width: sizes.iconSize,
        height: sizes.iconSize,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );

  return (
    <>
      <style>
        {`@keyframes spin { to { transform: rotate(360deg); } }`}
      </style>
      <button
        ref={ref}
        disabled={disabled || loading}
        style={styles}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsPressed(false);
        }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        {...props}
      >
        {loading && <Spinner />}
        {!loading && leftIcon}
        {loading && loadingText ? loadingText : children}
        {!loading && rightIcon}
      </button>
    </>
  );
});

Button.displayName = 'Button';

// ==================== ICON BUTTON ====================

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  size = 'md',
  rounded = true,
  ...props
}, ref) => {
  const sizes = sizeConfig[size];

  return (
    <Button
      ref={ref}
      size={size}
      rounded={rounded}
      style={{
        width: sizes.height,
        padding: 0,
        minWidth: sizes.height,
      }}
      {...props}
    >
      {icon}
    </Button>
  );
});

IconButton.displayName = 'IconButton';

// ==================== BUTTON GROUP ====================

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  attached = false,
  orientation = 'horizontal',
  size,
  variant,
  color,
}) => {
  const isVertical = orientation === 'vertical';

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    flexDirection: isVertical ? 'column' : 'row',
    gap: attached ? 0 : 8,
  };

  const childArray = React.Children.toArray(children);

  return (
    <div style={styles}>
      {childArray.map((child, index) => {
        if (!React.isValidElement(child)) return child;

        const isFirst = index === 0;
        const isLast = index === childArray.length - 1;

        let borderRadius = '6px';
        if (attached) {
          if (isVertical) {
            if (isFirst) borderRadius = '6px 6px 0 0';
            else if (isLast) borderRadius = '0 0 6px 6px';
            else borderRadius = '0';
          } else {
            if (isFirst) borderRadius = '6px 0 0 6px';
            else if (isLast) borderRadius = '0 6px 6px 0';
            else borderRadius = '0';
          }
        }

        return React.cloneElement(child as React.ReactElement<any>, {
          size: size || child.props.size,
          variant: variant || child.props.variant,
          color: color || child.props.color,
          style: {
            ...child.props.style,
            borderRadius,
            ...(attached && !isFirst && {
              [isVertical ? 'marginTop' : 'marginLeft']: -1,
            }),
          },
        });
      })}
    </div>
  );
};

// ==================== SPLIT BUTTON ====================

interface SplitButtonProps extends Omit<ButtonProps, 'onClick'> {
  mainAction: {
    label: string;
    onClick: () => void;
  };
  menuItems: Array<{
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
  }>;
}

export const SplitButton: React.FC<SplitButtonProps> = ({
  mainAction,
  menuItems,
  size = 'md',
  variant = 'solid',
  color = 'primary',
  disabled,
  ...props
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const sizes = sizeConfig[size];

  const menuStyles: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 150,
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100,
    display: menuOpen ? 'block' : 'none',
    overflow: 'hidden',
  };

  const menuItemStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    fontSize: sizes.fontSize,
    color: 'var(--color-text)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <ButtonGroup attached>
        <Button
          variant={variant}
          color={color}
          size={size}
          disabled={disabled}
          onClick={mainAction.onClick}
          {...props}
        >
          {mainAction.label}
        </Button>
        <Button
          variant={variant}
          color={color}
          size={size}
          disabled={disabled}
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ padding: '0 8px' }}
        >
          ▼
        </Button>
      </ButtonGroup>

      <div style={menuStyles}>
        {menuItems.map((item, index) => (
          <button
            key={index}
            style={{
              ...menuItemStyles,
              opacity: item.disabled ? 0.5 : 1,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
            }}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              setMenuOpen(false);
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {menuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
};

// ==================== TOGGLE BUTTON ====================

interface ToggleButtonProps extends Omit<ButtonProps, 'onClick'> {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(({
  pressed: controlledPressed,
  defaultPressed = false,
  onPressedChange,
  variant = 'outline',
  color = 'default',
  children,
  ...props
}, ref) => {
  const [internalPressed, setInternalPressed] = useState(defaultPressed);
  const pressed = controlledPressed ?? internalPressed;

  const handleClick = () => {
    const newPressed = !pressed;
    setInternalPressed(newPressed);
    onPressedChange?.(newPressed);
  };

  return (
    <Button
      ref={ref}
      variant={pressed ? 'solid' : variant}
      color={pressed ? 'primary' : color}
      active={pressed}
      onClick={handleClick}
      aria-pressed={pressed}
      {...props}
    >
      {children}
    </Button>
  );
});

ToggleButton.displayName = 'ToggleButton';

// ==================== CLOSE BUTTON ====================

interface CloseButtonProps {
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  'aria-label'?: string;
}

export const CloseButton: React.FC<CloseButtonProps> = ({
  onClick,
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel = 'Close',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const sizeMap = {
    sm: { size: 24, iconSize: 12 },
    md: { size: 32, iconSize: 16 },
    lg: { size: 40, iconSize: 20 },
  };

  const config = sizeMap[size];

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: config.size,
    height: config.size,
    padding: 0,
    background: isHovered ? 'var(--color-bg-hover)' : 'transparent',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--color-text-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s',
    fontSize: config.iconSize,
  };

  return (
    <button
      style={styles}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      x
    </button>
  );
};

// ==================== COPY BUTTON ====================

interface CopyButtonProps {
  value: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: ButtonVariant;
  onCopy?: () => void;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  size = 'sm',
  variant = 'ghost',
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <IconButton
      icon={copied ? 'check' : 'clipboard'}
      size={size}
      variant={variant}
      color={copied ? 'success' : 'default'}
      aria-label={copied ? 'Copied' : 'Copy'}
      onClick={handleCopy}
    />
  );
};

export default Button;
