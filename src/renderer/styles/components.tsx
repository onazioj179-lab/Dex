// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UI Components v3.7.3
 * 
 * Standardized, accessible UI primitives for consistent design across DEX.
 * All components use design tokens for spacing, colors, and sizing.
 */

import React, { useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { clampEventToViewport } from '../utils/menuPosition';
import { space, radius, fontSize, iconSize, zIndex, transition, padding, colors, button as buttonTokens, input as inputTokens, modal as modalTokens, emptyState as emptyStateTokens } from './tokens';

// ---------------------------------------------------------------------------
// DexButton
// ---------------------------------------------------------------------------
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface DexButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

const buttonStyles: Record<ButtonVariant, { bg: string; bgHover: string; text: string; border: string }> = {
  primary: {
    bg: 'var(--color-accent)',
    bgHover: 'var(--color-accent-hover)',
    text: '#000000',
    border: 'var(--color-accent)',
  },
  secondary: {
    bg: 'transparent',
    bgHover: 'var(--color-bg-hover)',
    text: 'var(--color-text-primary)',
    border: 'var(--color-border)',
  },
  ghost: {
    bg: 'transparent',
    bgHover: 'var(--color-bg-hover)',
    text: 'var(--color-text-secondary)',
    border: 'transparent',
  },
  danger: {
    bg: 'transparent',
    bgHover: 'var(--color-error-muted)',
    text: 'var(--color-error)',
    border: 'var(--color-error)',
  },
  success: {
    bg: 'transparent',
    bgHover: 'var(--color-success-muted)',
    text: 'var(--color-success)',
    border: 'var(--color-success)',
  },
};

export const DexButton = forwardRef<HTMLButtonElement, DexButtonProps>(({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props
}, ref) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const styles = buttonStyles[variant];
  
  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setHovered(true);
    onMouseEnter?.(e);
  }, [onMouseEnter]);
  
  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setHovered(false);
    setPressed(false);
    onMouseLeave?.(e);
  }, [onMouseLeave]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) setPressed(true);
    onMouseDown?.(e);
  }, [disabled, loading, onMouseDown]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setPressed(false);
    onMouseUp?.(e);
  }, [onMouseUp]);

  // Press animation scale - faster for snappier feel
  const pressScale = pressed && !disabled ? 'scale(0.96)' : 'scale(1)';

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: buttonTokens.iconGap,
    height: buttonTokens.height[size],
    minWidth: buttonTokens.minWidth[size],
    padding: padding.button[size],
    fontSize: size === 'sm' ? fontSize.sm : fontSize.base,
    fontWeight: 500,
    fontFamily: 'var(--font-family)',
    letterSpacing: '0.01em',
    color: styles.text,
    background: hovered && !disabled ? styles.bgHover : styles.bg,
    border: `1px solid ${styles.border}`,
    borderRadius: radius.sm,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transform: pressScale,
    // Faster transitions for snappier button response
    transition: `background 0.08s ease, border-color 0.08s ease, color 0.08s ease, transform 0.05s var(--pg-curve-standard, cubic-bezier(0.4,0,0.2,1)), opacity 0.1s ease`,
    outline: 'none',
    width: fullWidth ? '100%' : 'auto',
    textTransform: 'none' as const,
    // Minimum touch target for accessibility (44x44)
    minHeight: size === 'sm' ? 28 : 44,
    // Prevent double-tap zoom on mobile
    touchAction: 'manipulation',
    // Remove tap highlight on mobile
    WebkitTapHighlightColor: 'transparent',
    ...style,
  };

  return (
    <>
      <button
        ref={ref}
        className="dex-btn"
        disabled={disabled || loading}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={baseStyle}
        {...props}
      >
        {loading ? (
          <DexSpinner size={size === 'sm' ? 14 : 16} />
        ) : (
          <>
            {icon}
            {children}
            {iconRight}
          </>
        )}
      </button>
    </>
  );
});

DexButton.displayName = 'DexButton';

// ---------------------------------------------------------------------------
// DexInput
// ---------------------------------------------------------------------------
export interface DexInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
}

export const DexInput = forwardRef<HTMLInputElement, DexInputProps>(({
  size = 'md',
  error = false,
  icon,
  iconRight,
  fullWidth = false,
  disabled,
  style,
  containerStyle,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(e);
  }, [onFocus]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(e);
  }, [onBlur]);

  const wrapperStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    height: inputTokens.height[size],
    padding: padding.input[size],
    background: 'var(--color-bg-inset)',
    border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: radius.sm,
    transition: `border-color ${transition.fast}`,
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.4 : 1,
    boxShadow: focused ? 'var(--shadow-focus)' : 'none',
    ...containerStyle,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: size === 'sm' ? fontSize.sm : fontSize.base,
    fontFamily: 'var(--font-family)',
    letterSpacing: '0.01em',
    outline: 'none',
    width: '100%',
    ...style,
  };

  return (
    <div style={wrapperStyle}>
      {icon && <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>}
      <input
        ref={ref}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={inputStyle}
        {...props}
      />
      {iconRight && <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{iconRight}</span>}
    </div>
  );
});

DexInput.displayName = 'DexInput';

// ---------------------------------------------------------------------------
// DexTextarea
// ---------------------------------------------------------------------------
export interface DexTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  error?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export const DexTextarea = forwardRef<HTMLTextAreaElement, DexTextareaProps>(({
  error = false,
  fullWidth = false,
  disabled,
  style,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    setFocused(true);
    onFocus?.(e);
  }, [onFocus]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    setFocused(false);
    onBlur?.(e);
  }, [onBlur]);

  const textareaStyle: React.CSSProperties = {
    padding: padding.input.md,
    background: 'var(--color-bg-inset)',
    border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: radius.sm,
    color: 'var(--color-text-primary)',
    fontSize: fontSize.base,
    fontFamily: 'var(--font-family)',
    letterSpacing: '0.01em',
    outline: 'none',
    resize: 'vertical',
    minHeight: 80,
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.4 : 1,
    boxShadow: focused ? 'var(--shadow-focus)' : 'none',
    transition: `border-color ${transition.fast}, box-shadow ${transition.fast}`,
    ...style,
  };

  return (
    <textarea
      ref={ref}
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={textareaStyle}
      {...props}
    />
  );
});

DexTextarea.displayName = 'DexTextarea';

// ---------------------------------------------------------------------------
// DexModal
// ---------------------------------------------------------------------------
export interface DexModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Modal animation keyframes (injected once)
const MODAL_KEYFRAMES = `
@keyframes dex-modal-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes dex-modal-backdrop-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes dex-modal-enter { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes dex-modal-exit { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.95) translateY(8px); } }
`;

export const DexModal: React.FC<DexModalProps> = ({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnEscape = true,
  closeOnBackdrop = true,
  showCloseButton = true,
  className,
  style,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  // Track mounted state for exit animation
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Handle open/close with animation
  useEffect(() => {
    if (open && !mounted) {
      setMounted(true);
      setExiting(false);
    } else if (!open && mounted && !exiting) {
      setExiting(true);
      // Wait for exit animation to complete before unmounting
      const timer = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, 150); // Match exit animation duration
      return () => clearTimeout(timer);
    }
  }, [open, mounted, exiting]);

  // Handle escape key
  useEffect(() => {
    if (!mounted || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mounted, closeOnEscape, onClose]);

  // Focus trap
  useEffect(() => {
    if (!mounted) return;
    const prev = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    return () => prev?.focus?.();
  }, [mounted]);

  if (!mounted) return null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.modal,
    padding: space[6],
    animation: exiting 
      ? 'dex-modal-backdrop-out 0.15s var(--pg-curve-accelerate, cubic-bezier(0.4, 0, 1, 1)) forwards'
      : 'dex-modal-backdrop-in 0.2s var(--pg-curve-decelerate, cubic-bezier(0, 0, 0.2, 1)) forwards',
  };

  const modalStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: modalTokens.width[size],
    maxHeight: modalTokens.maxHeight,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: modalTokens.borderRadius,
    boxShadow: 'var(--shadow-xl)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    outline: 'none',
    animation: exiting
      ? 'dex-modal-exit 0.15s var(--pg-curve-accelerate, cubic-bezier(0.4, 0, 1, 1)) forwards'
      : 'dex-modal-enter 0.2s var(--pg-curve-emphasized, cubic-bezier(0.16, 1, 0.3, 1)) forwards',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${space[4]}px ${space[6]}px`,
    borderBottom: '1px solid var(--color-border-subtle)',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: space[6],
    overflowY: 'auto',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space[3],
    padding: `${space[4]}px ${space[6]}px`,
    borderTop: '1px solid var(--color-border-subtle)',
  };

  return (
    <>
      <style>{MODAL_KEYFRAMES}</style>
      <div 
        style={backdropStyle} 
        onClick={closeOnBackdrop ? onClose : undefined}
        role="presentation"
      >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div style={headerStyle}>
            {title && (
              <h2 id="modal-title" style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close modal"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: radius.sm,
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  transition: `background ${transition.fast}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div style={contentStyle}>{children}</div>
        {footer && <div style={footerStyle}>{footer}</div>}
      </div>
    </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DexSpinner
// ---------------------------------------------------------------------------
export interface DexSpinnerProps {
  size?: number | 'sm' | 'md' | 'lg';
  color?: string;
}

const spinnerSizes = { sm: 16, md: 24, lg: 32 };

export const DexSpinner: React.FC<DexSpinnerProps> = ({ 
  size = 20,
  color = 'currentColor',
}) => {
  const sizeValue = typeof size === 'number' ? size : spinnerSizes[size] || 24;
  return (
    <svg
      width={sizeValue}
      height={sizeValue}
      viewBox="0 0 24 24"
      style={{ animation: 'dex-spin 0.8s linear infinite' }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="31.4"
        strokeDashoffset="10"
      />
      <style>{`
        @keyframes dex-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// DexSkeleton
// ---------------------------------------------------------------------------
export interface DexSkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexSkeleton: React.FC<DexSkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = radius.md,
  className,
  style,
}) => {
  const skeletonStyle: React.CSSProperties = {
    width,
    height,
    borderRadius,
    background: 'var(--color-border-subtle)',
    animation: 'dex-pulse 1.5s ease-in-out infinite',
    ...style,
  };

  return (
    <>
      <div className={className} style={skeletonStyle} />
      <style>{`
        @keyframes dex-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
};

// ---------------------------------------------------------------------------
// DexEmptyState
// ---------------------------------------------------------------------------
export interface DexEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  accentColor?: string;
  style?: React.CSSProperties;
}

export const DexEmptyState: React.FC<DexEmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  accentColor = 'var(--color-accent)',
  style,
}) => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: space[8],
    gap: emptyStateTokens.gap,
    ...style,
  };

  const iconBoxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: emptyStateTokens.iconSize,
    height: emptyStateTokens.iconSize,
    borderRadius: emptyStateTokens.iconRadius,
    background: `color-mix(in srgb, ${accentColor} ${emptyStateTokens.iconBgOpacity * 100}%, transparent)`,
    color: accentColor,
  };

  return (
    <div style={containerStyle}>
      <div style={iconBoxStyle}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
        <h3 style={{ margin: 0, fontSize: fontSize.base, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        {description && (
          <p style={{ margin: 0, fontSize: fontSize.sm, color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: space[2] }}>{action}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexTooltip
// ---------------------------------------------------------------------------
export interface DexTooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const DexTooltip: React.FC<DexTooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
}) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number>();

  const showTooltip = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
  };

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    padding: '4px 8px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: radius.sm,
    boxShadow: 'var(--shadow-md)',
    color: 'var(--color-text-primary)',
    fontSize: fontSize.xs,
    whiteSpace: 'nowrap',
    zIndex: zIndex.tooltip,
    pointerEvents: 'none',
    opacity: visible ? 1 : 0,
    transition: `opacity ${transition.fast}`,
    ...positionStyles[position],
  };

  // Tooltips are off unless turned on in Settings > Help (services/tooltips).
  if (typeof document !== 'undefined' && !document.documentElement.hasAttribute('data-dex-tooltips')) return children;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <span role="tooltip" style={tooltipStyle}>{content}</span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// DexBadge
// ---------------------------------------------------------------------------
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface DexBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  style?: React.CSSProperties;
}

const badgeColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'var(--color-border)', text: 'var(--color-text-primary)' },
  success: { bg: 'var(--color-success-muted)', text: 'var(--color-success)' },
  warning: { bg: 'var(--color-warning-muted)', text: 'var(--color-warning)' },
  error: { bg: 'var(--color-error-muted)', text: 'var(--color-error)' },
  info: { bg: 'var(--color-accent-light)', text: 'var(--color-accent)' },
};

export const DexBadge: React.FC<DexBadgeProps> = ({
  variant = 'default',
  children,
  dot = false,
  style,
}) => {
  const colors = badgeColors[variant];

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: dot ? '4px 8px' : '2px 8px',
    background: colors.bg,
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: 500,
    borderRadius: radius.full,
    ...style,
  };

  const dotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: colors.text,
  };

  return (
    <span style={badgeStyle}>
      {dot && <span style={dotStyle} />}
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// DexSelect
// ---------------------------------------------------------------------------
export interface DexSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DexSelectProps {
  options: DexSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export const DexSelect: React.FC<DexSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  size = 'md',
  disabled = false,
  error = false,
  fullWidth = false,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  // Immediate close on outside click using capture phase
  useEffect(() => {
    if (!isOpen) return;
    
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    
    const handleBlur = () => setIsOpen(false);
    
    document.addEventListener('pointerdown', handler, { capture: true });
    document.addEventListener('keydown', handleEscape, { capture: true });
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('pointerdown', handler, { capture: true });
      document.removeEventListener('keydown', handleEscape, { capture: true });
      window.removeEventListener('blur', handleBlur);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      const currentIdx = options.findIndex(o => o.value === value);
      const nextIdx = options.findIndex((o, i) => i > currentIdx && !o.disabled);
      if (nextIdx !== -1) onChange?.(options[nextIdx].value);
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      const currentIdx = options.findIndex(o => o.value === value);
      let prevIdx = -1;
      for (let i = currentIdx - 1; i >= 0; i--) {
        if (!options[i].disabled) { prevIdx = i; break; }
      }
      if (prevIdx !== -1) onChange?.(options[prevIdx].value);
    }
  }, [disabled, isOpen, options, value, onChange]);

  const heights = { sm: 32, md: 36, lg: 44 };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    width: fullWidth ? '100%' : 'auto',
  };

  const triggerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    height: heights[size],
    padding: `0 ${space[3]}px`,
    background: 'var(--color-bg-inset)',
    border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: radius.md,
    color: selectedOption ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
    fontSize: size === 'sm' ? fontSize.sm : fontSize.base,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `border-color ${transition.fast}`,
    outline: 'none',
    minWidth: 120,
    ...style,
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: space[1],
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: radius.md,
    boxShadow: 'var(--shadow-lg)',
    zIndex: zIndex.dropdown,
    maxHeight: 200,
    overflowY: 'auto',
    padding: `${space[1]}px 0`,
  };

  const optionStyle = (opt: DexSelectOption, isSelected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: `${space[2]}px ${space[3]}px`,
    fontSize: size === 'sm' ? fontSize.sm : fontSize.base,
    color: opt.disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
    background: isSelected ? 'var(--color-accent-light)' : 'transparent',
    cursor: opt.disabled ? 'not-allowed' : 'pointer',
    transition: `background ${transition.fast}`,
  });

  return (
    <div ref={containerRef} style={containerStyle}>
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={triggerStyle}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption?.label || placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${transition.fast}` }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {isOpen && (
        <div role="listbox" style={dropdownStyle}>
          {options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled}
              style={optionStyle(opt, opt.value === value)}
              onClick={() => {
                if (!opt.disabled) {
                  onChange?.(opt.value);
                  setIsOpen(false);
                }
              }}
              onMouseEnter={(e) => {
                if (!opt.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = opt.value === value ? 'var(--color-accent-light)' : 'transparent';
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexSwitch
// ---------------------------------------------------------------------------
export interface DexSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  style?: React.CSSProperties;
}

export const DexSwitch: React.FC<DexSwitchProps> = ({
  checked = false,
  onChange,
  disabled = false,
  size = 'md',
  label,
  style,
}) => {
  const handleClick = useCallback(() => {
    if (!disabled) onChange?.(!checked);
  }, [disabled, checked, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange?.(!checked);
    }
  }, [disabled, checked, onChange]);

  const sizes = {
    sm: { width: 32, height: 18, knob: 14 },
    md: { width: 44, height: 24, knob: 20 },
  };
  const s = sizes[size];

  const trackStyle: React.CSSProperties = {
    position: 'relative',
    width: s.width,
    height: s.height,
    background: checked ? 'var(--color-accent-fill)' : 'var(--color-border)',
    borderRadius: s.height / 2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background ${transition.fast}`,
    outline: 'none',
    flexShrink: 0,
  };

  const knobStyle: React.CSSProperties = {
    position: 'absolute',
    top: (s.height - s.knob) / 2,
    left: checked ? s.width - s.knob - (s.height - s.knob) / 2 : (s.height - s.knob) / 2,
    width: s.knob,
    height: s.knob,
    background: '#fff',
    borderRadius: '50%',
    boxShadow: 'var(--pg-shadow-chip)',
    transition: `left ${transition.fast}`,
  };

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    ...style,
  };

  return (
    <div style={containerStyle}>
      <div
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={trackStyle}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div style={knobStyle} />
      </div>
      {label && (
        <span 
          style={{ 
            fontSize: size === 'sm' ? fontSize.sm : fontSize.base, 
            color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          onClick={handleClick}
        >
          {label}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexSlider
// ---------------------------------------------------------------------------
export interface DexSliderProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  size?: 'sm' | 'md';
  label?: string;
  style?: React.CSSProperties;
}

export const DexSlider: React.FC<DexSliderProps> = ({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  showValue = false,
  formatValue = (v) => String(v),
  size = 'md',
  label,
  style,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = ((value - min) / (max - min)) * 100;

  const updateValue = useCallback((clientX: number) => {
    if (!trackRef.current || disabled) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawValue = min + pct * (max - min);
    const steppedValue = Math.round(rawValue / step) * step;
    onChange?.(Math.max(min, Math.min(max, steppedValue)));
  }, [min, max, step, disabled, onChange]);

  // Mouse drag handling
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => updateValue(e.clientX);
    const handleUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, updateValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    let newValue = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      newValue = Math.min(max, value + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      newValue = Math.max(min, value - step);
    } else if (e.key === 'Home') {
      newValue = min;
    } else if (e.key === 'End') {
      newValue = max;
    } else {
      return;
    }
    e.preventDefault();
    onChange?.(newValue);
  }, [disabled, value, min, max, step, onChange]);

  const sizes = {
    sm: { track: 4, thumb: 14 },
    md: { track: 6, thumb: 18 },
  };
  const s = sizes[size];

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: space[1],
    ...style,
  };

  const labelRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: size === 'sm' ? fontSize.xs : fontSize.sm,
    color: 'var(--color-text-secondary)',
  };

  const trackContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: s.thumb,
    display: 'flex',
    alignItems: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };

  const trackStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: s.track,
    background: 'var(--color-border)',
    borderRadius: s.track / 2,
  };

  const fillStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    width: `${percent}%`,
    height: s.track,
    background: 'var(--color-accent-fill)',
    borderRadius: s.track / 2,
    transition: isDragging ? 'none' : `width ${transition.fast}`,
  };

  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${percent}% - ${s.thumb / 2}px)`,
    width: s.thumb,
    height: s.thumb,
    background: 'var(--color-accent-fill)',
    border: '3px solid #fff',
    borderRadius: '50%',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    cursor: disabled ? 'not-allowed' : 'grab',
    transition: isDragging ? 'none' : `left ${transition.fast}`,
    outline: 'none',
  };

  return (
    <div style={containerStyle}>
      {(label || showValue) && (
        <div style={labelRowStyle}>
          <span>{label}</span>
          {showValue && <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{formatValue(value)}</span>}
        </div>
      )}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={trackContainerStyle}
        onMouseDown={(e) => {
          if (!disabled) {
            setIsDragging(true);
            updateValue(e.clientX);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <div style={trackStyle} />
        <div style={fillStyle} />
        <div style={thumbStyle} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexCheckbox
// ---------------------------------------------------------------------------
export interface DexCheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  style?: React.CSSProperties;
}

export const DexCheckbox: React.FC<DexCheckboxProps> = ({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  size = 'md',
  label,
  style,
}) => {
  const handleClick = useCallback(() => {
    if (!disabled) onChange?.(!checked);
  }, [disabled, checked, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange?.(!checked);
    }
  }, [disabled, checked, onChange]);

  const sizes = { sm: 16, md: 20 };
  const boxSize = sizes[size];

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  const boxStyle: React.CSSProperties = {
    width: boxSize,
    height: boxSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: checked || indeterminate ? 'var(--color-accent-fill)' : 'transparent',
    border: `2px solid ${checked || indeterminate ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: radius.sm,
    transition: `all ${transition.fast}`,
    flexShrink: 0,
    outline: 'none',
  };

  return (
    <div style={containerStyle} onClick={handleClick}>
      <div
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        style={boxStyle}
        onKeyDown={handleKeyDown}
      >
        {checked && !indeterminate && (
          <svg width={boxSize * 0.7} height={boxSize * 0.7} viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {indeterminate && (
          <svg width={boxSize * 0.6} height={boxSize * 0.6} viewBox="0 0 10 10" fill="none">
            <path d="M2 5H8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      {label && (
        <span style={{ 
          fontSize: size === 'sm' ? fontSize.sm : fontSize.base, 
          color: 'var(--color-text-primary)',
        }}>
          {label}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexRadio
// ---------------------------------------------------------------------------
export interface DexRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DexRadioGroupProps {
  options: DexRadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  direction?: 'horizontal' | 'vertical';
  style?: React.CSSProperties;
}

export const DexRadioGroup: React.FC<DexRadioGroupProps> = ({
  options,
  value,
  onChange,
  name,
  disabled = false,
  size = 'md',
  direction = 'vertical',
  style,
}) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentValue: string) => {
    if (disabled) return;
    
    const currentIdx = options.findIndex(o => o.value === currentValue);
    let nextIdx = currentIdx;
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextIdx = (currentIdx + 1) % options.length;
      while (options[nextIdx].disabled && nextIdx !== currentIdx) {
        nextIdx = (nextIdx + 1) % options.length;
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIdx = (currentIdx - 1 + options.length) % options.length;
      while (options[nextIdx].disabled && nextIdx !== currentIdx) {
        nextIdx = (nextIdx - 1 + options.length) % options.length;
      }
    } else {
      return;
    }

    if (!options[nextIdx].disabled) {
      onChange?.(options[nextIdx].value);
    }
  }, [disabled, options, onChange]);

  const sizes = { sm: 16, md: 20 };
  const radioSize = sizes[size];

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'vertical' ? 'column' : 'row',
    gap: direction === 'vertical' ? space[2] : space[4],
    ...style,
  };

  const itemStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  const circleStyle = (isSelected: boolean, isDisabled: boolean): React.CSSProperties => ({
    width: radioSize,
    height: radioSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: `2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: '50%',
    transition: `all ${transition.fast}`,
    flexShrink: 0,
    opacity: isDisabled ? 0.5 : 1,
    outline: 'none',
  });

  const dotStyle: React.CSSProperties = {
    width: radioSize * 0.5,
    height: radioSize * 0.5,
    background: 'var(--color-accent-fill)',
    borderRadius: '50%',
  };

  return (
    <div role="radiogroup" aria-label={name} style={containerStyle}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const isDisabled = disabled || opt.disabled;
        
        return (
          <div
            key={opt.value}
            style={itemStyle}
            onClick={() => !isDisabled && onChange?.(opt.value)}
          >
            <div
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              tabIndex={isDisabled ? -1 : isSelected ? 0 : -1}
              style={circleStyle(isSelected, !!isDisabled)}
              onKeyDown={(e) => handleKeyDown(e, opt.value)}
            >
              {isSelected && <div style={dotStyle} />}
            </div>
            <span style={{ 
              fontSize: size === 'sm' ? fontSize.sm : fontSize.base, 
              color: isDisabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            }}>
              {opt.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexProgress
// ---------------------------------------------------------------------------
export interface DexProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

export const DexProgress: React.FC<DexProgressProps> = ({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = false,
  label,
  animated = false,
  style,
}) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  const heights = { sm: 4, md: 8, lg: 12 };
  const trackHeight = heights[size];

  const variantColors: Record<string, string> = {
    default: 'var(--color-accent)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: space[1],
    width: '100%',
    ...style,
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: fontSize.sm,
    color: 'var(--color-text-secondary)',
  };

  const trackStyle: React.CSSProperties = {
    width: '100%',
    height: trackHeight,
    background: 'var(--color-border)',
    borderRadius: trackHeight / 2,
    overflow: 'hidden',
  };

  const fillStyle: React.CSSProperties = {
    height: '100%',
    width: `${percent}%`,
    background: variantColors[variant],
    borderRadius: trackHeight / 2,
    transition: `width ${transition.normal}`,
    ...(animated && {
      backgroundImage: `linear-gradient(
        45deg,
        rgba(255,255,255,0.15) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255,255,255,0.15) 50%,
        rgba(255,255,255,0.15) 75%,
        transparent 75%,
        transparent
      )`,
      backgroundSize: '1rem 1rem',
      animation: 'dex-progress-stripes 1s linear infinite',
    }),
  };

  return (
    <div style={containerStyle}>
      {(showLabel || label) && (
        <div style={labelStyle}>
          <span>{label}</span>
          {showLabel && <span>{Math.round(percent)}%</span>}
        </div>
      )}
      <div 
        role="progressbar" 
        aria-valuenow={value} 
        aria-valuemin={0} 
        aria-valuemax={max}
        style={trackStyle}
      >
        <div style={fillStyle} />
      </div>
      {animated && (
        <style>{`
          @keyframes dex-progress-stripes {
            from { background-position: 1rem 0; }
            to { background-position: 0 0; }
          }
        `}</style>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexSearchInput
// ---------------------------------------------------------------------------
export interface DexSearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'style' | 'onSubmit'> {
  size?: 'sm' | 'md' | 'lg';
  onClear?: () => void;
  /** Fired with the current value when the user presses Enter. Replaces the
   *  native form onSubmit (an input never form-submits), hence the Omit above. */
  onSubmit?: (value: string) => void;
  loading?: boolean;
  fullWidth?: boolean;
  reserveClearSpace?: boolean;
  style?: React.CSSProperties;
}

export const DexSearchInput = forwardRef<HTMLInputElement, DexSearchInputProps>(({
  size = 'md',
  onClear,
  onSubmit,
  loading = false,
  fullWidth = false,
  reserveClearSpace = false,
  value,
  onChange,
  onKeyDown,
  disabled,
  placeholder = 'Search...',
  style,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== '';

  // Standard search-field keyboard affordances: Enter submits the current value,
  // Escape clears it. Both are opt-in (no-op unless the caller wires a handler)
  // and chain to any onKeyDown the caller passed, so existing call sites are
  // unaffected.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && onSubmit) onSubmit(String(value ?? ''));
    else if (event.key === 'Escape' && onClear) onClear();
  };

  // Canonical control rhythm -- identical to Button/TextInput heights so a search
  // field lines up pixel-for-pixel with every other control on the same row.
  const heights = { sm: 28, md: 32, lg: 40 };

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[2],
    height: heights[size],
    padding: `0 ${space[3]}px`,
    background: 'var(--color-bg-inset)',
    // Full pill, NO focus highlight/glow. Focus only nudges the hairline a shade
    // brighter (neutral, not accent) -- no ring, no halo. The inner input's global
    // :focus-visible outline is suppressed via .dex-search-field, so the field
    // never shows a highlight box. One calm, consistent search field everywhere.
    border: `1px solid ${focused ? 'var(--color-border-strong, var(--color-border))' : 'var(--color-border)'}`,
    borderRadius: 9999,
    boxShadow: 'none',
    transition: `border-color ${transition.fast}`,
    width: fullWidth ? '100%' : 'auto',
    // No hard 200px floor -- it broke compact toolbars (e.g. Vinx side panels).
    // Callers size via fullWidth or an explicit width in style.
    minWidth: fullWidth ? 0 : 140,
    boxSizing: 'border-box',
    ...style,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    fontSize: size === 'sm' ? fontSize.sm : fontSize.base,
    fontFamily: 'inherit',
    outline: 'none',
  };

  const iconStyle: React.CSSProperties = {
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  };

  const clearBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    padding: 0,
    background: 'var(--color-bg-hover)',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    opacity: hasValue ? 1 : 0,
    pointerEvents: hasValue ? 'auto' : 'none',
    transition: `opacity ${transition.fast}`,
  };

  return (
    <div style={containerStyle}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={iconStyle}>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="text"
        role="searchbox"
        className="dex-search-field"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyle}
        {...props}
      />
      {loading ? (
        <DexSpinner size={14} />
      ) : (hasValue && !disabled) ? (
        <button
          type="button"
          aria-label="Clear search"
          style={clearBtnStyle}
          onClick={onClear}
          tabIndex={-1}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : reserveClearSpace ? <span aria-hidden="true" style={{ width: 18, flexShrink: 0 }} /> : null}
    </div>
  );
});

DexSearchInput.displayName = 'DexSearchInput';

// ---------------------------------------------------------------------------
// DexConfirmDialog
// ---------------------------------------------------------------------------
export interface DexConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export const DexConfirmDialog: React.FC<DexConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
}) => {
  return (
    <DexModal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <DexButton variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </DexButton>
          <DexButton 
            variant={variant === 'danger' ? 'danger' : 'primary'} 
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </DexButton>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: fontSize.base }}>
        {message}
      </p>
    </DexModal>
  );
};

// ---------------------------------------------------------------------------
// DexToast (notification system)
// ---------------------------------------------------------------------------
export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toastQueue: ToastItem[] = [];

const notifyListeners = () => {
  toastListeners.forEach(fn => fn([...toastQueue]));
};

export const toast = {
  show: (message: string, variant: ToastVariant = 'default', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toastQueue.push({ id, message, variant, duration });
    notifyListeners();
    setTimeout(() => {
      toastQueue = toastQueue.filter(t => t.id !== id);
      notifyListeners();
    }, duration);
  },
  success: (message: string, duration?: number) => toast.show(message, 'success', duration),
  error: (message: string, duration?: number) => toast.show(message, 'error', duration),
  warning: (message: string, duration?: number) => toast.show(message, 'warning', duration),
  info: (message: string, duration?: number) => toast.show(message, 'info', duration),
};

export const DexToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToasts(newToasts);
    toastListeners.push(listener);
    // Bridge legacy `dex-toast` CustomEvents (dispatched from across the app
    // and from sub-apps that don't import the toast() API) into the queue.
    // Without this, hundreds of `window.dispatchEvent('dex-toast', ...)`
    // calls were going to /dev/null.
    const onDexToast = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string; type?: ToastVariant; duration?: number }>).detail;
      if (!detail || !detail.message) return;
      toast.show(detail.message, detail.type ?? 'info', detail.duration ?? 4000);
    };
    window.addEventListener('dex-toast', onDexToast as EventListener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
      window.removeEventListener('dex-toast', onDexToast as EventListener);
    };
  }, []);

  if (toasts.length === 0) return null;

  const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
    default: { bg: 'var(--color-bg-elevated)', border: 'var(--color-border)', icon: 'var(--color-text-secondary)' },
    success: { bg: 'var(--color-success-muted)', border: 'var(--color-success)', icon: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning-muted)', border: 'var(--color-warning)', icon: 'var(--color-warning)' },
    error: { bg: 'var(--color-error-muted)', border: 'var(--color-error)', icon: 'var(--color-error)' },
    info: { bg: 'var(--color-accent-light)', border: 'var(--color-accent)', icon: 'var(--color-accent)' },
  };

  const icons: Record<ToastVariant, React.ReactNode> = {
    default: null,
    success: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 9L8 11.5L12.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    warning: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16 15H2L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 7V10M9 12.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    error: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 6L12 12M12 6L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    info: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 8V13M9 5.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: space[6],
    right: space[6],
    display: 'flex',
    flexDirection: 'column',
    gap: space[2],
    zIndex: zIndex.tooltip + 100,
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle} role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => {
        const styles = variantStyles[t.variant];
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[3],
              padding: `${space[3]}px ${space[4]}px`,
              background: styles.bg,
              border: `1px solid ${styles.border}`,
              borderRadius: radius.lg,
              boxShadow: 'var(--shadow-lg)',
              color: 'var(--color-text-primary)',
              fontSize: fontSize.sm,
              pointerEvents: 'auto',
              animation: 'dex-toast-enter 0.2s ease',
            }}
          >
            {icons[t.variant] && <span style={{ color: styles.icon, display: 'flex' }}>{icons[t.variant]}</span>}
            <span>{t.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes dex-toast-enter {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexProgressRing (circular progress)
// ---------------------------------------------------------------------------
export interface DexProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

export const DexProgressRing: React.FC<DexProgressRingProps> = ({
  value,
  max = 100,
  size = 48,
  strokeWidth = 4,
  variant = 'default',
  showLabel = false,
  label,
  style,
}) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;

  const variantColors: Record<string, string> = {
    default: 'var(--color-accent)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
  };

  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={variantColors[variant]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: `stroke-dashoffset ${transition.normal}` }}
        />
      </svg>
      {(showLabel || label) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size < 40 ? fontSize.xs : fontSize.sm,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          {label ?? `${Math.round(percent)}%`}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexScrollShadow (overflow indicators)
// ---------------------------------------------------------------------------
export interface DexScrollShadowProps {
  direction?: 'vertical' | 'horizontal' | 'both';
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const DexScrollShadow: React.FC<DexScrollShadowProps> = ({
  direction = 'vertical',
  children,
  style,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateShadows = () => {
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el;
      
      if (direction === 'vertical' || direction === 'both') {
        setShowTop(scrollTop > 0);
        setShowBottom(scrollTop < scrollHeight - clientHeight - 1);
      }
      if (direction === 'horizontal' || direction === 'both') {
        setShowLeft(scrollLeft > 0);
        setShowRight(scrollLeft < scrollWidth - clientWidth - 1);
      }
    };

    updateShadows();
    el.addEventListener('scroll', updateShadows, { passive: true });
    const observer = new ResizeObserver(updateShadows);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateShadows);
      observer.disconnect();
    };
  }, [direction]);

  const shadowSize = 40;
  const shadowColor = 'rgba(0,0,0,0.15)';

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  const innerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflowX: direction === 'horizontal' || direction === 'both' ? 'auto' : 'hidden',
    overflowY: direction === 'vertical' || direction === 'both' ? 'auto' : 'hidden',
  };

  const shadowBase: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 1,
    transition: `opacity ${transition.fast}`,
  };

  return (
    <div style={containerStyle} className={className}>
      <div ref={containerRef} style={innerStyle} className="dex-scroll">
        {children}
      </div>
      {/* Top shadow */}
      {(direction === 'vertical' || direction === 'both') && (
        <div
          style={{
            ...shadowBase,
            top: 0,
            left: 0,
            right: 0,
            height: shadowSize,
            background: `linear-gradient(to bottom, ${shadowColor}, transparent)`,
            opacity: showTop ? 1 : 0,
          }}
        />
      )}
      {/* Bottom shadow */}
      {(direction === 'vertical' || direction === 'both') && (
        <div
          style={{
            ...shadowBase,
            bottom: 0,
            left: 0,
            right: 0,
            height: shadowSize,
            background: `linear-gradient(to top, ${shadowColor}, transparent)`,
            opacity: showBottom ? 1 : 0,
          }}
        />
      )}
      {/* Left shadow */}
      {(direction === 'horizontal' || direction === 'both') && (
        <div
          style={{
            ...shadowBase,
            top: 0,
            bottom: 0,
            left: 0,
            width: shadowSize,
            background: `linear-gradient(to right, ${shadowColor}, transparent)`,
            opacity: showLeft ? 1 : 0,
          }}
        />
      )}
      {/* Right shadow */}
      {(direction === 'horizontal' || direction === 'both') && (
        <div
          style={{
            ...shadowBase,
            top: 0,
            bottom: 0,
            right: 0,
            width: shadowSize,
            background: `linear-gradient(to left, ${shadowColor}, transparent)`,
            opacity: showRight ? 1 : 0,
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexDrawer -- slide-in panel from edge of screen
// ---------------------------------------------------------------------------

export interface DexDrawerProps {
  open: boolean;
  onClose: () => void;
  position?: 'left' | 'right' | 'bottom';
  width?: number | string;
  height?: number | string;
  title?: string;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DexDrawer: React.FC<DexDrawerProps> = ({
  open,
  onClose,
  position = 'right',
  width = 400,
  height = '50vh',
  title,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
  className,
  style,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle escape key
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  // Handle open/close animation
  useEffect(() => {
    let rafId: number;
    if (open) {
      setIsVisible(true);
      rafId = requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
    return () => cancelAnimationFrame(rafId);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (open && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [open]);

  if (!isVisible) return null;

  const isHorizontal = position === 'left' || position === 'right';
  
  const getTransform = () => {
    if (!isAnimating) {
      switch (position) {
        case 'left': return 'translateX(-100%)';
        case 'right': return 'translateX(100%)';
        case 'bottom': return 'translateY(100%)';
      }
    }
    return 'translate(0)';
  };

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: modalTokens.backdropColor,
    opacity: isAnimating ? 1 : 0,
    transition: `opacity ${transition.normal}`,
    zIndex: zIndex.sheet,
  };

  const drawerStyle: React.CSSProperties = {
    position: 'fixed',
    backgroundColor: 'var(--color-bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: zIndex.sheet + 1,
    transform: getTransform(),
    transition: `transform ${transition.slow} ${isAnimating ? 'ease-out' : 'ease-in'}`,
    ...(position === 'left' && { top: 0, left: 0, bottom: 0, width }),
    ...(position === 'right' && { top: 0, right: 0, bottom: 0, width }),
    ...(position === 'bottom' && { left: 0, right: 0, bottom: 0, height, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }),
    boxShadow: '0 0 40px rgba(0,0,0,0.3), 0 0 10px rgba(0,0,0,0.2)',
    outline: 'none',
    ...style,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${space[4]} ${space[5]}`,
    borderBottom: `1px solid var(--color-border)`,
    flexShrink: 0,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: space[5],
  };

  return (
    <>
      <div
        style={backdropStyle}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Drawer'}
        tabIndex={-1}
        style={drawerStyle}
        className={className}
      >
        {(title || showCloseButton) && (
          <div style={headerStyle}>
            {title && (
              <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600 }}>
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close drawer"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: space[2],
                  cursor: 'pointer',
                  borderRadius: radius.sm,
                  color: 'var(--color-text-secondary)',
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div style={contentStyle} className="dex-scroll">
          {children}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DexErrorBanner -- dismissible error banner
// ---------------------------------------------------------------------------

export interface DexErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  variant?: 'error' | 'warning' | 'info';
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const errorBannerColors = {
  error: { bg: 'rgba(255, 82, 82, 0.15)', border: 'var(--color-error)', icon: 'var(--color-error)' },
  warning: { bg: 'rgba(255, 204, 0, 0.15)', border: 'var(--color-warning)', icon: 'var(--color-warning)' },
  info: { bg: 'rgba(0, 122, 255, 0.15)', border: 'var(--color-info)', icon: 'var(--color-info)' },
};

export const DexErrorBanner: React.FC<DexErrorBannerProps> = ({
  message,
  onDismiss,
  onRetry,
  variant = 'error',
  icon,
  className,
  style,
}) => {
  const colorScheme = errorBannerColors[variant];

  const bannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
    padding: `${space[3]} ${space[4]}`,
    // Quiet card: the icon carries the tone. No coloured side stripe.
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
    borderRadius: radius.lg,
    ...style,
  };

  const defaultIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colorScheme.icon} strokeWidth="2">
      {variant === 'error' && <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
      {variant === 'warning' && <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>}
      {variant === 'info' && <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>}
    </svg>
  );

  return (
    <div role="alert" style={bannerStyle} className={className}>
      <span style={{ flexShrink: 0 }}>{icon || defaultIcon}</span>
      <span style={{ flex: 1, fontSize: fontSize.sm, color: 'var(--color-text-primary)' }}>
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: 'none',
            border: 'none',
            padding: `${space[1]} ${space[2]}`,
            color: colorScheme.border,
            cursor: 'pointer',
            fontSize: fontSize.sm,
            fontWeight: 500,
          }}
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            padding: space[1],
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            display: 'flex',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexErrorInline -- inline error message for form fields
// ---------------------------------------------------------------------------

export interface DexErrorInlineProps {
  message: string;
  className?: string;
  style?: React.CSSProperties;
}

export const DexErrorInline: React.FC<DexErrorInlineProps> = ({
  message,
  className,
  style,
}) => {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[1],
        marginTop: space[1],
        color: 'var(--color-error)',
        fontSize: fontSize.xs,
        ...style,
      }}
      className={className}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      {message}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexAlertDialog -- alert dialog for important messages
// ---------------------------------------------------------------------------

export interface DexAlertDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'default' | 'warning' | 'error';
  className?: string;
}

export const DexAlertDialog: React.FC<DexAlertDialogProps> = ({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'OK',
  variant = 'default',
  className,
}) => {
  const variantColors = {
    default: 'var(--color-accent)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
  };

  return (
    <DexModal open={open} onClose={onClose} title={title} size="sm" className={className}>
      <div style={{ padding: `0 0 ${space[4]} 0` }}>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: fontSize.base, lineHeight: 1.5 }}>
          {message}
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DexButton
          onClick={onClose}
          variant={variant === 'error' ? 'danger' : 'primary'}
        >
          {confirmLabel}
        </DexButton>
      </div>
    </DexModal>
  );
};

// ---------------------------------------------------------------------------
// DexPromptDialog -- prompt dialog for user input
// ---------------------------------------------------------------------------

export interface DexPromptDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  className?: string;
}

export const DexPromptDialog: React.FC<DexPromptDialogProps> = ({
  open,
  onClose,
  onSubmit,
  title,
  message,
  defaultValue = '',
  placeholder,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  required = false,
  className,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, defaultValue]);

  const handleSubmit = () => {
    if (required && !value.trim()) return;
    onSubmit(value);
    onClose();
  };

  return (
    <DexModal open={open} onClose={onClose} title={title} size="sm" className={className}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        {message && (
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: fontSize.sm }}>
            {message}
          </p>
        )}
        <DexInput
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
          <DexButton variant="ghost" onClick={onClose}>
            {cancelLabel}
          </DexButton>
          <DexButton
            variant="primary"
            onClick={handleSubmit}
            disabled={required && !value.trim()}
          >
            {submitLabel}
          </DexButton>
        </div>
      </div>
    </DexModal>
  );
};

// ---------------------------------------------------------------------------
// Typography Components
// ---------------------------------------------------------------------------

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

const headingSizes: Record<HeadingLevel, { fontSize: string; lineHeight: number }> = {
  1: { fontSize: '2rem', lineHeight: 1.2 },
  2: { fontSize: '1.5rem', lineHeight: 1.25 },
  3: { fontSize: '1.25rem', lineHeight: 1.3 },
  4: { fontSize: '1.125rem', lineHeight: 1.35 },
  5: { fontSize: '1rem', lineHeight: 1.4 },
  6: { fontSize: '0.875rem', lineHeight: 1.4 },
};

const textSizes: Record<TextSize, string> = {
  xs: `${fontSize.xs}px`,
  sm: `${fontSize.sm}px`,
  base: `${fontSize.base}px`,
  lg: `${fontSize.lg}px`,
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '2rem',
};

const fontWeights: Record<TextWeight, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export interface DexHeadingProps {
  level?: HeadingLevel;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  truncate?: boolean;
  color?: 'primary' | 'secondary' | 'muted';
}

export const DexHeading: React.FC<DexHeadingProps> = ({
  level = 2,
  children,
  className,
  style,
  truncate = false,
  color = 'primary',
}) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  const sizeConfig = headingSizes[level];
  
  const colorMap = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    muted: 'var(--color-text-muted)',
  };

  const headingStyle: React.CSSProperties = {
    margin: 0,
    fontSize: sizeConfig.fontSize,
    fontWeight: level <= 3 ? 600 : 500,
    lineHeight: sizeConfig.lineHeight,
    color: colorMap[color],
    ...(truncate && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    ...style,
  };

  return React.createElement(Tag, { className, style: headingStyle }, children);
};

export interface DexTextProps {
  size?: TextSize;
  weight?: TextWeight;
  color?: 'primary' | 'secondary' | 'muted' | 'error' | 'success' | 'warning';
  as?: 'p' | 'span' | 'div' | 'label';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  truncate?: boolean;
  lineClamp?: number;
}

export const DexText: React.FC<DexTextProps> = ({
  size = 'base',
  weight = 'normal',
  color = 'primary',
  as: Tag = 'p',
  children,
  className,
  style,
  truncate = false,
  lineClamp,
}) => {
  const colorMap = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    muted: 'var(--color-text-muted)',
    error: 'var(--color-error)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
  };

  const textStyle: React.CSSProperties = {
    margin: Tag === 'p' ? `0 0 ${space[2]} 0` : 0,
    fontSize: textSizes[size],
    fontWeight: fontWeights[weight],
    lineHeight: 1.5,
    color: colorMap[color],
    ...(truncate && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    ...(lineClamp && {
      display: '-webkit-box',
      WebkitLineClamp: lineClamp,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
    }),
    ...style,
  };

  return React.createElement(Tag, { className, style: textStyle }, children);
};

export interface DexLabelProps {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DexLabel: React.FC<DexLabelProps> = ({
  htmlFor,
  required = false,
  children,
  className,
  style,
}) => {
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: space[1],
    fontSize: fontSize.sm,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    ...style,
  };

  return (
    <label htmlFor={htmlFor} className={className} style={labelStyle}>
      {children}
      {required && (
        <span style={{ color: 'var(--color-error)', marginLeft: space[1] }}>*</span>
      )}
    </label>
  );
};

export interface DexCaptionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: 'default' | 'error' | 'success';
}

export const DexCaption: React.FC<DexCaptionProps> = ({
  children,
  className,
  style,
  variant = 'default',
}) => {
  const colorMap = {
    default: 'var(--color-text-muted)',
    error: 'var(--color-error)',
    success: 'var(--color-success)',
  };

  const captionStyle: React.CSSProperties = {
    margin: 0,
    fontSize: fontSize.xs,
    lineHeight: 1.4,
    color: colorMap[variant],
    ...style,
  };

  return (
    <p className={className} style={captionStyle}>
      {children}
    </p>
  );
};

// ---------------------------------------------------------------------------
// DexAccordion -- collapsible content sections
// ---------------------------------------------------------------------------

export interface DexAccordionItemProps {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export interface DexAccordionProps {
  items: DexAccordionItemProps[];
  allowMultiple?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DexAccordion: React.FC<DexAccordionProps> = ({
  items,
  allowMultiple = false,
  className,
  style,
}) => {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const defaultOpen = new Set<string>();
    items.forEach(item => {
      if (item.defaultOpen) defaultOpen.add(item.id);
    });
    return defaultOpen;
  });

  const toggleItem = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {items.map((item, index) => {
        const isOpen = openIds.has(item.id);
        return (
          <div
            key={item.id}
            style={{
              borderTop: index === 0 ? `1px solid var(--color-border)` : 'none',
              borderBottom: `1px solid var(--color-border)`,
            }}
          >
            <button
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
              aria-controls={`accordion-content-${item.id}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${space[3]} ${space[4]}`,
                background: 'none',
                border: 'none',
                fontSize: fontSize.base,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{item.title}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: `transform ${transition.fast}`,
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div
              id={`accordion-content-${item.id}`}
              role="region"
              aria-labelledby={`accordion-header-${item.id}`}
              style={{
                overflow: 'hidden',
                maxHeight: isOpen ? '1000px' : '0',
                opacity: isOpen ? 1 : 0,
                transition: `max-height ${transition.slow}, opacity ${transition.normal}`,
              }}
            >
              <div style={{ padding: `0 ${space[4]} ${space[4]} ${space[4]}` }}>
                {item.children}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexShimmer -- loading placeholder animation
// ---------------------------------------------------------------------------

export interface DexShimmerProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const DexShimmer: React.FC<DexShimmerProps> = ({
  width = '100%',
  height = 20,
  borderRadius = radius.md,
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(
          90deg,
          var(--color-bg-hover) 0%,
          var(--color-bg-surface) 50%,
          var(--color-bg-hover) 100%
        )`,
        backgroundSize: '200% 100%',
        animation: 'dex-shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
};

// Inject shimmer keyframes
let shimmerStyleInjected = false;
if (typeof document !== 'undefined' && !shimmerStyleInjected) {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dex-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;
  document.head.appendChild(style);
  shimmerStyleInjected = true;
}

// ---------------------------------------------------------------------------
// DexTabs -- tabbed navigation component
// ---------------------------------------------------------------------------

export interface DexTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: number | string;
}

export interface DexTabsProps {
  tabs: DexTabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DexTabs: React.FC<DexTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className,
  style,
}) => {
  const sizeStyles = {
    sm: { padding: `${space[1]} ${space[3]}`, fontSize: fontSize.xs },
    md: { padding: `${space[2]} ${space[4]}`, fontSize: fontSize.sm },
    lg: { padding: `${space[3]} ${space[5]}`, fontSize: fontSize.base },
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: variant === 'pills' ? space[2] : 0,
    borderBottom: variant === 'underline' ? `1px solid var(--color-border)` : 'none',
    backgroundColor: variant === 'default' ? 'var(--color-bg-elevated)' : 'transparent',
    borderRadius: variant === 'default' ? radius.lg : 0,
    padding: variant === 'default' ? space[1] : 0,
    ...style,
  };

  const getTabStyle = (tab: DexTabItem): React.CSSProperties => {
    const isActive = tab.id === activeTab;
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: space[2],
      ...sizeStyles[size],
      fontWeight: 500,
      border: 'none',
      cursor: tab.disabled ? 'not-allowed' : 'pointer',
      opacity: tab.disabled ? 0.5 : 1,
      transition: `all ${transition.fast}`,
      flex: fullWidth ? 1 : 'none',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
    };

    if (variant === 'default') {
      return {
        ...base,
        background: isActive ? 'var(--color-bg-surface)' : 'transparent',
        color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderRadius: radius.md,
        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
      };
    }

    if (variant === 'pills') {
      return {
        ...base,
        background: isActive ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)',
        color: isActive ? '#000' : 'var(--color-text-secondary)',
        borderRadius: radius.full,
      };
    }

    // underline variant
    return {
      ...base,
      background: 'transparent',
      color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
      borderBottom: isActive ? `2px solid var(--color-accent)` : '2px solid transparent',
      marginBottom: '-1px',
      borderRadius: 0,
    };
  };

  return (
    <div role="tablist" className={className} style={containerStyle}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          aria-disabled={tab.disabled}
          onClick={() => !tab.disabled && onChange(tab.id)}
          style={getTabStyle(tab)}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.badge !== undefined && (
            <span
              style={{
                padding: `0 ${space[2]}`,
                fontSize: fontSize.xs,
                backgroundColor: tab.id === activeTab ? 'rgba(0,0,0,0.2)' : 'var(--color-bg-hover)',
                borderRadius: radius.full,
                minWidth: '20px',
                textAlign: 'center',
              }}
            >
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexCard -- versatile card container
// ---------------------------------------------------------------------------

export interface DexCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'outlined' | 'elevated' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DexCard: React.FC<DexCardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  onClick,
  header,
  footer,
  className,
  style,
}) => {
  const [hovered, setHovered] = useState(false);

  const paddingValues = {
    none: 0,
    sm: space[3],
    md: space[4],
    lg: space[6],
  };

  const getCardStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      borderRadius: radius.lg,
      overflow: 'hidden',
      transition: `all ${transition.fast}`,
      ...style,
    };

    switch (variant) {
      case 'outlined':
        return {
          ...base,
          backgroundColor: 'transparent',
          border: `1px solid var(--color-border)`,
        };
      case 'elevated':
        return {
          ...base,
          backgroundColor: 'var(--color-bg-surface)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
        };
      case 'interactive':
        return {
          ...base,
          backgroundColor: 'var(--color-bg-surface)',
          border: `1px solid ${hovered ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'none',
          boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
        };
      default:
        return {
          ...base,
          backgroundColor: 'var(--color-bg-surface)',
          border: `1px solid var(--color-border)`,
        };
    }
  };

  return (
    <div
      className={className}
      style={getCardStyle()}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {header && (
        <div
          style={{
            padding: paddingValues[padding],
            borderBottom: `1px solid var(--color-border)`,
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: paddingValues[padding] }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: paddingValues[padding],
            borderTop: `1px solid var(--color-border)`,
            backgroundColor: 'var(--color-bg-elevated)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexAvatar -- user avatar with fallback
// ---------------------------------------------------------------------------

export interface DexAvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'circle' | 'rounded' | 'square';
  status?: 'online' | 'offline' | 'away' | 'busy';
  className?: string;
  style?: React.CSSProperties;
}

const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const statusColors = {
  online: '#30D158',
  offline: '#8E8E93',
  away: '#FFD60A',
  busy: '#FF453A',
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  ];
  return colors[Math.abs(hash) % colors.length];
};

export const DexAvatar: React.FC<DexAvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  variant = 'circle',
  status,
  className,
  style,
}) => {
  const [imgError, setImgError] = useState(false);
  const dimension = avatarSizes[size];
  
  const borderRadii = {
    circle: '50%',
    rounded: radius.md,
    square: radius.sm,
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: dimension,
    height: dimension,
    borderRadius: borderRadii[variant],
    overflow: 'hidden',
    backgroundColor: name ? stringToColor(name) : 'var(--color-bg-hover)',
    color: '#fff',
    fontSize: dimension * 0.4,
    fontWeight: 600,
    flexShrink: 0,
    ...style,
  };

  const statusSize = Math.max(8, dimension * 0.25);
  const statusStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: statusSize,
    height: statusSize,
    borderRadius: '50%',
    backgroundColor: status ? statusColors[status] : 'transparent',
    border: `2px solid var(--color-bg-surface)`,
  };

  return (
    <div className={className} style={containerStyle}>
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : name ? (
        <span>{getInitials(name)}</span>
      ) : (
        <svg width={dimension * 0.5} height={dimension * 0.5} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      )}
      {status && <div style={statusStyle} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexBreadcrumb -- navigation breadcrumbs
// ---------------------------------------------------------------------------

export interface DexBreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export interface DexBreadcrumbProps {
  items: DexBreadcrumbItem[];
  separator?: React.ReactNode;
  maxItems?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexBreadcrumb: React.FC<DexBreadcrumbProps> = ({
  items,
  separator,
  maxItems,
  className,
  style,
}) => {
  const defaultSeparator = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );

  // Handle collapsed breadcrumbs
  let displayItems = items;
  const [expanded, setExpanded] = useState(false);

  if (maxItems && items.length > maxItems && !expanded) {
    displayItems = [
      items[0],
      { label: '...', onClick: () => setExpanded(true) },
      ...items.slice(-(maxItems - 1)),
    ];
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space[1],
    fontSize: fontSize.sm,
    ...style,
  };

  return (
    <nav aria-label="Breadcrumb" className={className} style={containerStyle}>
      <ol style={{ display: 'flex', alignItems: 'center', gap: space[1], margin: 0, padding: 0, listStyle: 'none' }}>
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isClickable = item.href || item.onClick;

          return (
            <li key={index} style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
              {index > 0 && (
                <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>
                  {separator || defaultSeparator}
                </span>
              )}
              {isClickable ? (
                <button
                  onClick={item.onClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[1],
                    padding: `${space[1]} ${space[2]}`,
                    background: 'none',
                    border: 'none',
                    borderRadius: radius.sm,
                    color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontWeight: isLast ? 500 : 400,
                    transition: `background ${transition.fast}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isLast) e.currentTarget.style.background = 'var(--color-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ) : (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[1],
                    padding: `${space[1]} ${space[2]}`,
                    color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontWeight: isLast ? 500 : 400,
                  }}
                >
                  {item.icon}
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// DexDropdown -- dropdown menu
// ---------------------------------------------------------------------------

export interface DexDropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export interface DexDropdownProps {
  trigger: React.ReactNode;
  items: DexDropdownItem[];
  align?: 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

export const DexDropdown: React.FC<DexDropdownProps> = ({
  trigger,
  items,
  align = 'left',
  className,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const overlayIdRef = useRef<string | null>(null);

  // Immediate close on outside click using capture phase
  useEffect(() => {
    if (!open) {
      if (overlayIdRef.current) {
        overlayIdRef.current = null;
      }
      return;
    }

    // Use pointerdown with capture for instant response
    const handleClickOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusedIndex(-1);
      }
    };

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setFocusedIndex(-1);
      }
    };

    // Handle window blur (user switches apps)
    const handleBlur = () => {
      setOpen(false);
      setFocusedIndex(-1);
    };

    document.addEventListener('pointerdown', handleClickOutside, { capture: true });
    document.addEventListener('keydown', handleEscape, { capture: true });
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, { capture: true });
      document.removeEventListener('keydown', handleEscape, { capture: true });
      window.removeEventListener('blur', handleBlur);
    };
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    const selectableItems = items.filter(i => !i.divider && !i.disabled);

    switch (e.key) {
      case 'Escape':
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % selectableItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + selectableItems.length) % selectableItems.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          const item = selectableItems[focusedIndex];
          item.onClick?.();
          setOpen(false);
        }
        break;
    }
  };

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    [align]: 0,
    marginTop: space[1],
    minWidth: 180,
    backgroundColor: 'var(--color-bg-surface)',
    border: `1px solid var(--color-border)`,
    borderRadius: radius.lg,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    padding: space[1],
    zIndex: zIndex.dropdown,
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(-8px)',
    pointerEvents: open ? 'auto' : 'none',
    transition: `opacity ${transition.fast}, transform ${transition.fast}`,
  };

  let selectableIndex = -1;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      onKeyDown={handleKeyDown}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}
        tabIndex={0}
        role="button"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>
      <div ref={menuRef} role="menu" style={menuStyle}>
        {items.map((item, index) => {
          if (item.divider) {
            return (
              <div
                key={index}
                style={{
                  height: 1,
                  backgroundColor: 'var(--color-border)',
                  margin: `${space[1]} 0`,
                }}
              />
            );
          }

          if (!item.disabled) selectableIndex++;
          const isFocused = selectableIndex === focusedIndex;

          return (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
                width: '100%',
                padding: `${space[2]} ${space[3]}`,
                background: isFocused ? 'var(--color-bg-hover)' : 'none',
                border: 'none',
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                color: item.danger
                  ? 'var(--color-error)'
                  : item.disabled
                  ? 'var(--color-text-muted)'
                  : 'var(--color-text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: `background ${transition.fast}`,
              }}
              onMouseEnter={() => !item.disabled && setFocusedIndex(selectableIndex)}
            >
              {item.icon && <span style={{ width: 16, display: 'flex' }}>{item.icon}</span>}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexScrollProgressBar -- scroll progress indicator
// ---------------------------------------------------------------------------

export interface DexScrollProgressBarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  color?: string;
  height?: number;
  position?: 'top' | 'bottom';
  className?: string;
  style?: React.CSSProperties;
}

export const DexScrollProgressBar: React.FC<DexScrollProgressBarProps> = ({
  containerRef,
  color = 'var(--color-accent)',
  height = 3,
  position = 'top',
  className,
  style,
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScroll = scrollHeight - clientHeight;
      setProgress(maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0);
    };

    updateProgress();
    container.addEventListener('scroll', updateProgress, { passive: true });
    return () => container.removeEventListener('scroll', updateProgress);
  }, [containerRef]);

  const barStyle: React.CSSProperties = {
    position: 'fixed',
    [position]: 0,
    left: 0,
    width: `${progress}%`,
    height,
    backgroundColor: color,
    zIndex: zIndex.sticky,
    transition: 'width 0.1s ease-out',
    ...style,
  };

  return <div className={className} style={barStyle} />;
};

// ---------------------------------------------------------------------------
// DexAvatarGroup -- stacked avatars
// ---------------------------------------------------------------------------

export interface DexAvatarGroupProps {
  avatars: Array<{ src?: string; name?: string; alt?: string }>;
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

export const DexAvatarGroup: React.FC<DexAvatarGroupProps> = ({
  avatars,
  max = 4,
  size = 'md',
  className,
  style,
}) => {
  const displayed = avatars.slice(0, max);
  const remaining = avatars.length - max;
  const dimension = avatarSizes[size];
  const overlap = dimension * 0.3;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        ...style,
      }}
    >
      {displayed.map((avatar, index) => (
        <div
          key={index}
          style={{
            marginLeft: index > 0 ? -overlap : 0,
            zIndex: displayed.length - index,
            border: '2px solid var(--color-bg-surface)',
            borderRadius: '50%',
          }}
        >
          <DexAvatar {...avatar} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          style={{
            marginLeft: -overlap,
            width: dimension,
            height: dimension,
            borderRadius: '50%',
            backgroundColor: 'var(--color-bg-elevated)',
            border: '2px solid var(--color-bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: dimension * 0.35,
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexContextMenu -- right-click context menu
// ---------------------------------------------------------------------------

export interface DexContextMenuProps {
  items: DexDropdownItem[];
  children: React.ReactNode;
  className?: string;
}

export const DexContextMenu: React.FC<DexContextMenuProps> = ({
  items,
  children,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { left, top } = clampEventToViewport(e, { width: 200, height: 300 });
    setPosition({ x: left, y: top });
    setOpen(true);
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    minWidth: 180,
    backgroundColor: 'var(--color-bg-surface)',
    border: `1px solid var(--color-border)`,
    borderRadius: radius.lg,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    padding: space[1],
    zIndex: zIndex.contextMenu,
    opacity: open ? 1 : 0,
    transform: open ? 'scale(1)' : 'scale(0.95)',
    transformOrigin: 'top left',
    pointerEvents: open ? 'auto' : 'none',
    transition: `opacity ${transition.fast}, transform ${transition.fast}`,
  };

  return (
    <>
      <div onContextMenu={handleContextMenu} className={className}>
        {children}
      </div>
      <div ref={menuRef} role="menu" style={menuStyle}>
        {items.map((item, index) => {
          if (item.divider) {
            return (
              <div
                key={index}
                style={{
                  height: 1,
                  backgroundColor: 'var(--color-border)',
                  margin: `${space[1]} 0`,
                }}
              />
            );
          }

          return (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
                width: '100%',
                padding: `${space[2]} ${space[3]}`,
                background: 'none',
                border: 'none',
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                color: item.danger
                  ? 'var(--color-error)'
                  : item.disabled
                  ? 'var(--color-text-muted)'
                  : 'var(--color-text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: `background ${transition.fast}`,
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
            >
              {item.icon && <span style={{ width: 16, display: 'flex' }}>{item.icon}</span>}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DexTag -- tag/chip component
// ---------------------------------------------------------------------------

export interface DexTagProps {
  label: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const tagColors = {
  default: { bg: 'var(--color-bg-hover)', text: 'var(--color-text-primary)' },
  primary: { bg: 'rgba(0, 122, 255, 0.15)', text: 'var(--color-accent)' },
  success: { bg: 'rgba(48, 209, 88, 0.15)', text: 'var(--color-success)' },
  warning: { bg: 'rgba(255, 204, 0, 0.15)', text: 'var(--color-warning)' },
  error: { bg: 'rgba(255, 82, 82, 0.15)', text: 'var(--color-error)' },
  info: { bg: 'rgba(90, 200, 250, 0.15)', text: 'var(--color-info)' },
};

export const DexTag: React.FC<DexTagProps> = ({
  label,
  variant = 'default',
  size = 'md',
  removable = false,
  onRemove,
  icon,
  className,
  style,
}) => {
  const colors = tagColors[variant];
  const isSmall = size === 'sm';

  const tagStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[1],
    padding: isSmall ? `${space[0]} ${space[2]}` : `${space[1]} ${space[2]}`,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: isSmall ? fontSize.xs : fontSize.sm,
    fontWeight: 500,
    borderRadius: radius.full,
    ...style,
  };

  return (
    <span className={className} style={tagStyle}>
      {icon}
      {label}
      {removable && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            width: isSmall ? 14 : 16,
            height: isSmall ? 14 : 16,
            background: 'none',
            border: 'none',
            borderRadius: '50%',
            color: 'inherit',
            cursor: 'pointer',
            opacity: 0.7,
            transition: `opacity ${transition.fast}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
        >
          <svg width={isSmall ? 10 : 12} height={isSmall ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// DexLoadingOverlay -- full-screen or container loading overlay
// ---------------------------------------------------------------------------

export interface DexLoadingOverlayProps {
  visible: boolean;
  text?: string;
  blur?: boolean;
  fullScreen?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DexLoadingOverlay: React.FC<DexLoadingOverlayProps> = ({
  visible,
  text,
  blur = true,
  fullScreen = false,
  className,
  style,
}) => {
  if (!visible) return null;

  const overlayStyle: React.CSSProperties = {
    position: fullScreen ? 'fixed' : 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    backgroundColor: blur ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
    backdropFilter: blur ? 'blur(4px)' : 'none',
    zIndex: fullScreen ? zIndex.modal : zIndex.overlay,
    ...style,
  };

  return (
    <div className={className} style={overlayStyle}>
      <DexSpinner size="lg" />
      {text && (
        <span style={{ color: '#fff', fontSize: `${fontSize.sm}px`, fontWeight: 500 }}>
          {text}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexStepper -- step indicator for multi-step processes
// ---------------------------------------------------------------------------

export interface DexStepperStep {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface DexStepperProps {
  steps: DexStepperStep[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
  onStepClick?: (index: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DexStepper: React.FC<DexStepperProps> = ({
  steps,
  currentStep,
  orientation = 'horizontal',
  onStepClick,
  className,
  style,
}) => {
  const isVertical = orientation === 'vertical';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isVertical ? 'column' : 'row',
    alignItems: isVertical ? 'stretch' : 'center',
    gap: isVertical ? space[2] : 0,
    ...style,
  };

  return (
    <div className={className} style={containerStyle}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isClickable = onStepClick && (isCompleted || isCurrent);

        return (
          <React.Fragment key={step.id}>
            <div
              style={{
                display: 'flex',
                flexDirection: isVertical ? 'row' : 'column',
                alignItems: 'center',
                gap: space[2],
                cursor: isClickable ? 'pointer' : 'default',
                opacity: !isCompleted && !isCurrent ? 0.5 : 1,
              }}
              onClick={() => isClickable && onStepClick?.(index)}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCompleted
                    ? 'var(--color-success)'
                    : isCurrent
                    ? 'var(--color-accent-fill)'
                    : 'var(--color-bg-hover)',
                  color: isCompleted || isCurrent ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  transition: `all ${transition.fast}`,
                }}
              >
                {isCompleted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : step.icon ? (
                  step.icon
                ) : (
                  index + 1
                )}
              </div>
              <div style={{ textAlign: isVertical ? 'left' : 'center' }}>
                <div
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  {step.label}
                </div>
                {step.description && (
                  <div style={{ fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>
                    {step.description}
                  </div>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: isVertical ? 24 : 2,
                  width: isVertical ? 2 : 'auto',
                  minWidth: isVertical ? undefined : 40,
                  backgroundColor: index < currentStep ? 'var(--color-success)' : 'var(--color-border)',
                  marginLeft: isVertical ? 15 : 0,
                  transition: `background-color ${transition.fast}`,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexPopover -- positioned popover
// ---------------------------------------------------------------------------

export interface DexPopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

export const DexPopover: React.FC<DexPopoverProps> = ({
  trigger,
  content,
  open: controlledOpen,
  onOpenChange,
  placement = 'bottom',
  className,
  style,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, setOpen]);

  const getPositionStyle = (): React.CSSProperties => {
    const offset = space[2];
    switch (placement) {
      case 'top':
        return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: offset };
      case 'bottom':
        return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: offset };
      case 'left':
        return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: offset };
      case 'right':
        return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: offset };
    }
  };

  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    ...getPositionStyle(),
    backgroundColor: 'var(--color-bg-surface)',
    border: `1px solid var(--color-border)`,
    borderRadius: radius.lg,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    padding: space[3],
    zIndex: zIndex.popover,
    opacity: open ? 1 : 0,
    pointerEvents: open ? 'auto' : 'none',
    transition: `opacity ${transition.fast}`,
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      <div style={popoverStyle}>
        {content}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexSplitButton -- button with dropdown
// ---------------------------------------------------------------------------

export interface DexSplitButtonProps {
  label: string;
  onClick: () => void;
  items: DexDropdownItem[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DexSplitButton: React.FC<DexSplitButtonProps> = ({
  label,
  onClick,
  items,
  variant = 'secondary',
  size = 'md',
  icon,
  disabled = false,
  className,
  style,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ display: 'inline-flex', position: 'relative', ...style }}
    >
      <DexButton
        variant={variant}
        size={size}
        icon={icon}
        onClick={onClick}
        disabled={disabled}
        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
      >
        {label}
      </DexButton>
      <DexButton
        variant={variant}
        size={size}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        style={{
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: `1px solid rgba(255,255,255,0.2)`,
          minWidth: 'auto',
          padding: `0 ${space[2]}`,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </DexButton>
      <div
        role="menu"
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: space[1],
          minWidth: 180,
          backgroundColor: 'var(--color-bg-surface)',
          border: `1px solid var(--color-border)`,
          borderRadius: radius.lg,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          padding: space[1],
          zIndex: zIndex.dropdown,
          opacity: dropdownOpen ? 1 : 0,
          transform: dropdownOpen ? 'translateY(0)' : 'translateY(-8px)',
          pointerEvents: dropdownOpen ? 'auto' : 'none',
          transition: `opacity ${transition.fast}, transform ${transition.fast}`,
        }}
      >
        {items.map((item, index) => {
          if (item.divider) {
            return (
              <div
                key={index}
                style={{
                  height: 1,
                  backgroundColor: 'var(--color-border)',
                  margin: `${space[1]} 0`,
                }}
              />
            );
          }

          return (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                setDropdownOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
                width: '100%',
                padding: `${space[2]} ${space[3]}`,
                background: 'none',
                border: 'none',
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                color: item.danger
                  ? 'var(--color-error)'
                  : item.disabled
                  ? 'var(--color-text-muted)'
                  : 'var(--color-text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: `background ${transition.fast}`,
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
            >
              {item.icon && <span style={{ width: 16, display: 'flex' }}>{item.icon}</span>}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};





// ---------------------------------------------------------------------------
// DexColorInput -- color picker
// ---------------------------------------------------------------------------
export interface DexColorInputProps { value: string; onChange: (c: string) => void; label?: string; disabled?: boolean; className?: string; style?: React.CSSProperties; }

export const DexColorInput: React.FC<DexColorInputProps> = ({ value, onChange, label, disabled = false, className, style }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: space[2], ...style }}>
      {label && <span style={{ fontSize: fontSize.sm, color: "var(--color-text-secondary)" }}>{label}</span>}
      <div onClick={() => !disabled && inputRef.current?.click()} style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: value, border: "2px solid var(--color-border)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }} />
      <input ref={inputRef} type="color" value={colorInputValue(value)} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ display: "none" }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexNumberInput -- number with +/- buttons
// ---------------------------------------------------------------------------
export interface DexNumberInputProps { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; size?: "sm" | "md" | "lg"; className?: string; style?: React.CSSProperties; }

export const DexNumberInput: React.FC<DexNumberInputProps> = ({ value, onChange, min, max, step = 1, disabled = false, size = "md", className, style }) => {
  const sizes = { sm: 28, md: 36, lg: 44 }; const h = sizes[size];
  const inc = () => { const n = value + step; if (max === undefined || n <= max) onChange(n); };
  const dec = () => { const n = value - step; if (min === undefined || n >= min) onChange(n); };
  const btn: React.CSSProperties = { width: h, height: h, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 };
  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center", ...style }}>
      <button onClick={dec} aria-label="Decrease value" disabled={disabled || (min !== undefined && value <= min)} style={{ ...btn, borderRadius: radius.md + " 0 0 " + radius.md }}>-</button>
      <input type="number" value={value} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }} min={min} max={max} step={step} disabled={disabled} style={{ width: 60, height: h, padding: "0 " + space[2], backgroundColor: "var(--color-bg-input)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)", borderLeft: "none", borderRight: "none", fontSize: fontSize.sm, color: "var(--color-text-primary)", textAlign: "center" }} />
      <button onClick={inc} aria-label="Increase value" disabled={disabled || (max !== undefined && value >= max)} style={{ ...btn, borderRadius: "0 " + radius.md + " " + radius.md + " 0" }}>+</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexPinInput -- PIN/OTP input
// ---------------------------------------------------------------------------
export interface DexPinInputProps { length?: number; value: string; onChange: (v: string) => void; mask?: boolean; disabled?: boolean; autoFocus?: boolean; onComplete?: (v: string) => void; className?: string; style?: React.CSSProperties; }

export const DexPinInput: React.FC<DexPinInputProps> = ({ length = 4, value, onChange, mask = false, disabled = false, autoFocus = false, onComplete, className, style }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const handleChange = (i: number, ch: string) => { if (!/^[0-9]?$/.test(ch)) return; const nv = value.split(""); nv[i] = ch; const r = nv.join("").slice(0, length); onChange(r); if (ch && i < length - 1) refs.current[i + 1]?.focus(); if (r.length === length && onComplete) onComplete(r); };
  const handleKey = (e: React.KeyboardEvent, i: number) => { if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus(); };
  return (
    <div className={className} style={{ display: "flex", gap: space[2], ...style }}>
      {Array.from({ length }).map((_, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} type={mask ? "password" : "text"} inputMode="numeric" maxLength={1} value={value[i] || ""} onChange={(e) => handleChange(i, e.target.value)} onKeyDown={(e) => handleKey(e, i)} disabled={disabled} autoFocus={autoFocus && i === 0} style={{ width: 48, height: 56, padding: 0, backgroundColor: "var(--color-bg-input)", border: "2px solid var(--color-border)", borderRadius: radius.lg, fontSize: fontSize.xl, fontWeight: 600, color: "var(--color-text-primary)", textAlign: "center", outline: "none", opacity: disabled ? 0.5 : 1 }} onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }} />)}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexListItem -- list item
// ---------------------------------------------------------------------------
export interface DexListItemProps { title: string; subtitle?: string; leading?: React.ReactNode; trailing?: React.ReactNode; onClick?: () => void; selected?: boolean; disabled?: boolean; className?: string; style?: React.CSSProperties; }

export const DexListItem: React.FC<DexListItemProps> = ({ title, subtitle, leading, trailing, onClick, selected = false, disabled = false, className, style }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div className={className} onClick={!disabled ? onClick : undefined} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ display: "flex", alignItems: "center", gap: space[3], padding: space[3] + " " + space[4], backgroundColor: selected ? "var(--color-accent-muted)" : hovered && !disabled ? "var(--color-bg-hover)" : "transparent", cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default", opacity: disabled ? 0.5 : 1, borderRadius: radius.md, ...style }}>
      {leading && <div style={{ flexShrink: 0 }}>{leading}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.md, fontWeight: selected ? 600 : 400, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {subtitle && <div style={{ fontSize: fontSize.sm, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
      </div>
      {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexStatCard -- statistic card
// ---------------------------------------------------------------------------
export interface DexStatCardProps { title: string; value: string | number; change?: number; changeLabel?: string; icon?: React.ReactNode; trend?: "up" | "down" | "neutral"; className?: string; style?: React.CSSProperties; }

export const DexStatCard: React.FC<DexStatCardProps> = ({ title, value, change, changeLabel, icon, trend, className, style }) => {
  const tc = trend === "up" ? "var(--color-success)" : trend === "down" ? "var(--color-error)" : "var(--color-text-secondary)";
  return (
    <div className={className} style={{ backgroundColor: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: radius.xl, padding: space[5], ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ fontSize: fontSize.sm, color: "var(--color-text-secondary)" }}>{title}</div>
        {icon && <div style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: "var(--color-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}>{icon}</div>}
      </div>
      <div style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: "var(--color-text-primary)", marginTop: space[2] }}>{value}</div>
      {(change !== undefined || changeLabel) && <div style={{ display: "flex", alignItems: "center", gap: space[1], marginTop: space[2] }}>{change !== undefined && <span style={{ color: tc, fontSize: fontSize.sm, fontWeight: 500 }}>{trend === "up" && "+"}{change}%</span>}{changeLabel && <span style={{ color: "var(--color-text-muted)", fontSize: fontSize.sm }}>{changeLabel}</span>}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexRating -- star rating
// ---------------------------------------------------------------------------
export interface DexRatingProps { value: number; max?: number; onChange?: (v: number) => void; readOnly?: boolean; size?: "sm" | "md" | "lg"; className?: string; style?: React.CSSProperties; }

export const DexRating: React.FC<DexRatingProps> = ({ value, max = 5, onChange, readOnly = false, size = "md", className, style }) => {
  const [hv, setHv] = useState<number | null>(null);
  const sz: Record<string, number> = { sm: 16, md: 24, lg: 32 }; const starSize = sz[size]; const dv = hv ?? value;
  return (
    <div className={className} style={{ display: "inline-flex", gap: space[1], cursor: readOnly ? "default" : "pointer", ...style }} onMouseLeave={() => setHv(null)}>
      {Array.from({ length: max }).map((_, i) => { const filled = dv >= i + 1; return (<div key={i} style={{ position: "relative", width: starSize, height: starSize }} onClick={() => { if (!readOnly && onChange) onChange(i + 1); }} onMouseMove={() => { if (!readOnly) setHv(i + 1); }}><svg width={starSize} height={starSize} viewBox="0 0 24 24" fill={filled ? "var(--color-warning)" : "none"} stroke="var(--color-warning)" strokeWidth="2" style={{ position: "absolute", top: 0, left: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg></div>); })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexTimeline -- vertical timeline
// ---------------------------------------------------------------------------
export interface DexTimelineItem { id: string; title: string; description?: string; date?: string; icon?: React.ReactNode; color?: string; }
export interface DexTimelineProps { items: DexTimelineItem[]; align?: "left" | "right" | "alternate"; className?: string; style?: React.CSSProperties; }

export const DexTimeline: React.FC<DexTimelineProps> = ({ items, align = "left", className, style }) => (
  <div className={className} style={{ position: "relative", ...style }}>
    <div style={{ position: "absolute", left: align === "right" ? "auto" : align === "alternate" ? "50%" : 16, right: align === "right" ? 16 : "auto", top: 0, bottom: 0, width: 2, backgroundColor: "var(--color-border)", transform: align === "alternate" ? "translateX(-50%)" : "none" }} />
    {items.map((it, i) => { const isR = align === "right" || (align === "alternate" && i % 2 === 1); return (<div key={it.id} style={{ display: "flex", flexDirection: isR ? "row-reverse" : "row", alignItems: "flex-start", gap: space[3], marginBottom: space[4], paddingLeft: align === "alternate" ? (isR ? 0 : "50%") : 0, paddingRight: align === "alternate" ? (isR ? "50%" : 0) : 0 }}><div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: it.color || "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, zIndex: 1 }}>{it.icon || <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fff" }} />}</div><div style={{ flex: 1, textAlign: isR ? "right" : "left" }}>{it.date && <div style={{ fontSize: fontSize.xs, color: "var(--color-text-muted)", marginBottom: space[1] }}>{it.date}</div>}<div style={{ fontSize: fontSize.md, fontWeight: 600, color: "var(--color-text-primary)" }}>{it.title}</div>{it.description && <div style={{ fontSize: fontSize.sm, color: "var(--color-text-secondary)", marginTop: space[1] }}>{it.description}</div>}</div></div>); })}
  </div>
);

// ---------------------------------------------------------------------------
// DexCollapsible -- collapsible content
// ---------------------------------------------------------------------------
export interface DexCollapsibleProps { open?: boolean; onOpenChange?: (o: boolean) => void; trigger: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string; style?: React.CSSProperties; }

export const DexCollapsible: React.FC<DexCollapsibleProps> = ({ open: co, onOpenChange, trigger, children, defaultOpen = false, className, style }) => {
  const [io, sio] = useState(defaultOpen); const o = co ?? io; const so = onOpenChange ?? sio;
  const r = useRef<HTMLDivElement>(null); const [h, sh] = useState<number | string>(defaultOpen ? "auto" : 0);
  useEffect(() => { if (r.current) { if (o) { sh(r.current.scrollHeight); const t = setTimeout(() => sh("auto"), 200); return () => clearTimeout(t); } else { sh(r.current.scrollHeight); const raf = requestAnimationFrame(() => sh(0)); return () => cancelAnimationFrame(raf); } } }, [o]);
  return <div className={className} style={style}><div onClick={() => so(!o)} style={{ cursor: "pointer" }} role="button" aria-expanded={o}>{trigger}</div><div style={{ height: h, overflow: "hidden", transition: "height " + transition.normal + " ease" }}><div ref={r}>{children}</div></div></div>;
};

// ---------------------------------------------------------------------------
// DexDivider -- divider line
// ---------------------------------------------------------------------------
export interface DexDividerProps { orientation?: "horizontal" | "vertical"; label?: string; className?: string; style?: React.CSSProperties; }

export const DexDivider: React.FC<DexDividerProps> = ({ orientation = "horizontal", label, className, style }) => {
  const v = orientation === "vertical";
  if (label && !v) return <div className={className} style={{ display: "flex", alignItems: "center", gap: space[3], ...style }}><div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} /><span style={{ fontSize: fontSize.sm, color: "var(--color-text-muted)" }}>{label}</span><div style={{ flex: 1, height: 1, backgroundColor: "var(--color-border)" }} /></div>;
  return <div className={className} style={{ backgroundColor: "var(--color-border)", ...(v ? { width: 1, height: "100%", minHeight: 20 } : { height: 1, width: "100%" }), ...style }} />;
};


// ---------------------------------------------------------------------------
// DexZoomControls -- zoom controls for canvas apps
// ---------------------------------------------------------------------------
export interface DexZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit?: () => void;
  min?: number;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexZoomControls: React.FC<DexZoomControlsProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  min = 0.1,
  max = 10,
  className,
  style,
}) => {
  const percent = Math.round(scale * 100);
  const canZoomIn = scale < max;
  const canZoomOut = scale > min;

  const btnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    borderRadius: radius.md,
    transition: `background ${transition.fast}`,
  };

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: space[1], backgroundColor: 'var(--color-bg-surface)', borderRadius: radius.lg, padding: `${space[1]} ${space[2]}`, ...style }}>
      <button onClick={onZoomOut} disabled={!canZoomOut} style={{ ...btnStyle, opacity: canZoomOut ? 1 : 0.4 }} title="Zoom Out">-</button>
      <button onClick={onReset} style={{ ...btnStyle, width: 'auto', padding: `0 ${space[2]}`, fontSize: fontSize.sm }} title="Reset Zoom">{percent}%</button>
      <button onClick={onZoomIn} disabled={!canZoomIn} style={{ ...btnStyle, opacity: canZoomIn ? 1 : 0.4 }} title="Zoom In">+</button>
      {onFit && <button onClick={onFit} style={{ ...btnStyle, marginLeft: space[1] }} title="Fit to View">Fit</button>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexPanControls -- pan/navigation controls
// ---------------------------------------------------------------------------
export interface DexPanControlsProps {
  onPan: (dx: number, dy: number) => void;
  onCenter?: () => void;
  step?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexPanControls: React.FC<DexPanControlsProps> = ({
  onPan,
  onCenter,
  step = 50,
  className,
  style,
}) => {
  const btnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    borderRadius: radius.sm,
    fontSize: fontSize.sm,
  };

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 2, ...style }}>
      <div />
      <button onClick={() => onPan(0, step)} style={btnStyle} title="Pan Up">^</button>
      <div />
      <button onClick={() => onPan(step, 0)} style={btnStyle} title="Pan Left">&lt;</button>
      {onCenter ? <button onClick={onCenter} style={btnStyle} title="Center">o</button> : <div />}
      <button onClick={() => onPan(-step, 0)} style={btnStyle} title="Pan Right">&gt;</button>
      <div />
      <button onClick={() => onPan(0, -step)} style={btnStyle} title="Pan Down">v</button>
      <div />
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexLayerList -- layer management for creative apps
// ---------------------------------------------------------------------------
export interface DexLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  thumbnail?: string;
  opacity?: number;
  blendMode?: string;
}

export interface DexLayerListProps {
  layers: DexLayer[];
  activeId?: string;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onReorder?: (layers: DexLayer[]) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DexLayerList: React.FC<DexLayerListProps> = ({
  layers,
  activeId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  className,
  style,
}) => {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 2, ...style }}>
      {layers.map(layer => (
        <div
          key={layer.id}
          onClick={() => onSelect(layer.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            padding: `${space[2]} ${space[3]}`,
            backgroundColor: activeId === layer.id ? 'var(--color-accent-muted)' : 'transparent',
            borderRadius: radius.md,
            cursor: 'pointer',
            opacity: layer.visible ? 1 : 0.5,
          }}
        >
          {layer.thumbnail && (
            <div style={{ width: 32, height: 32, borderRadius: radius.sm, overflow: 'hidden', flexShrink: 0 }}>
              <img src={layer.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fontSize.sm, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{layer.name}</div>
            {layer.opacity !== undefined && layer.opacity < 1 && (
              <div style={{ fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>{Math.round(layer.opacity * 100)}%</div>
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: space[1], color: layer.visible ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }} title={layer.visible ? 'Hide' : 'Show'}>
            {layer.visible ? 'O' : '-'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: space[1], color: layer.locked ? 'var(--color-warning)' : 'var(--color-text-muted)' }} title={layer.locked ? 'Unlock' : 'Lock'}>
            {layer.locked ? 'L' : 'U'}
          </button>
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: space[1], color: 'var(--color-error)' }} title="Delete">X</button>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexColorWheel -- HSL color wheel picker
// ---------------------------------------------------------------------------
export interface DexColorWheelProps {
  value: string;
  onChange: (color: string) => void;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexColorWheel: React.FC<DexColorWheelProps> = ({
  value,
  onChange,
  size = 200,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius - 25;

    // Draw hue ring
    for (let angle = 0; angle < 360; angle++) {
      const startAngle = (angle - 1) * Math.PI / 180;
      const endAngle = (angle + 1) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
      ctx.fill();
    }

    // Draw saturation/lightness square
    const sqSize = innerRadius * 1.2;
    const sqX = centerX - sqSize / 2;
    const sqY = centerY - sqSize / 2;
    
    const gradH = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
    gradH.addColorStop(0, '#fff');
    gradH.addColorStop(1, `hsl(${hue}, 100%, 50%)`);
    ctx.fillStyle = gradH;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    const gradV = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
    gradV.addColorStop(0, 'transparent');
    gradV.addColorStop(1, '#000');
    ctx.fillStyle = gradV;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);
  }, [size, hue]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const distance = Math.sqrt(x * x + y * y);
    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius - 25;

    if (distance >= innerRadius && distance <= outerRadius) {
      const angle = Math.atan2(y, x) * 180 / Math.PI + 180;
      setHue(Math.round(angle));
      onChange(`hsl(${Math.round(angle)}, ${saturation}%, ${lightness}%)`);
    } else if (distance < innerRadius) {
      const sqSize = innerRadius * 1.2;
      const sqX = -sqSize / 2;
      const sqY = -sqSize / 2;
      if (x >= sqX && x <= sqX + sqSize && y >= sqY && y <= sqY + sqSize) {
        const newSat = Math.round(((x - sqX) / sqSize) * 100);
        const newLight = Math.round(100 - ((y - sqY) / sqSize) * 100);
        setSaturation(newSat);
        setLightness(newLight);
        onChange(`hsl(${hue}, ${newSat}%, ${newLight}%)`);
      }
    }
  };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space[3], ...style }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onClick={handleClick}
        style={{ cursor: 'crosshair', borderRadius: '50%' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <div style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: value, border: '2px solid var(--color-border)' }} />
        <span style={{ fontSize: fontSize.sm, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{value}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexBrushPreview -- brush preview for painting apps
// ---------------------------------------------------------------------------
export interface DexBrushPreviewProps {
  size: number;
  hardness: number;
  opacity: number;
  color: string;
  className?: string;
  style?: React.CSSProperties;
}

export const DexBrushPreview: React.FC<DexBrushPreviewProps> = ({
  size,
  hardness,
  opacity,
  color,
  className,
  style,
}) => {
  const previewSize = 80;
  const displaySize = Math.min(size, previewSize - 10);
  const blur = (1 - hardness) * displaySize * 0.5;

  return (
    <div className={className} style={{ width: previewSize, height: previewSize, backgroundColor: 'var(--color-bg-input)', borderRadius: radius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <div style={{
        width: displaySize,
        height: displaySize,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        filter: `blur(${blur}px)`,
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexToolbar -- creative app toolbar
// ---------------------------------------------------------------------------
export interface DexToolbarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface DexToolbarProps {
  items: DexToolbarItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  style?: React.CSSProperties;
}

export const DexToolbar: React.FC<DexToolbarProps> = ({
  items,
  activeId,
  onSelect,
  orientation = 'vertical',
  className,
  style,
}) => {
  const isHorizontal = orientation === 'horizontal';
  return (
    <div className={className} style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      gap: space[1],
      padding: space[2],
      backgroundColor: 'var(--color-bg-surface)',
      borderRadius: radius.lg,
      ...style,
    }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => !item.disabled && onSelect(item.id)}
          disabled={item.disabled}
          title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: activeId === item.id ? 'var(--color-accent-fill)' : 'none',
            border: 'none',
            borderRadius: radius.md,
            color: activeId === item.id ? '#000' : 'var(--color-text-primary)',
            cursor: item.disabled ? 'not-allowed' : 'pointer',
            opacity: item.disabled ? 0.4 : 1,
            transition: `all ${transition.fast}`,
          }}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexPropertyPanel -- property inspector panel
// ---------------------------------------------------------------------------
export interface DexPropertyItem {
  id: string;
  label: string;
  type: 'number' | 'slider' | 'color' | 'select' | 'checkbox' | 'text';
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface DexPropertyPanelProps {
  title: string;
  items: DexPropertyItem[];
  onChange: (id: string, value: unknown) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DexPropertyPanel: React.FC<DexPropertyPanelProps> = ({
  title,
  items,
  onChange,
  collapsed = false,
  onToggleCollapse,
  className,
  style,
}) => {
  return (
    <div className={className} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: radius.lg, overflow: 'hidden', ...style }}>
      <div
        onClick={onToggleCollapse}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${space[3]} ${space[4]}`,
          cursor: onToggleCollapse ? 'pointer' : 'default',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontSize: fontSize.sm, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</span>
        {onToggleCollapse && <span style={{ color: 'var(--color-text-muted)' }}>{collapsed ? '+' : '-'}</span>}
      </div>
      {!collapsed && (
        <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
              <label style={{ flex: '0 0 80px', fontSize: fontSize.sm, color: 'var(--color-text-secondary)' }}>{item.label}</label>
              <div style={{ flex: 1 }}>
                {item.type === 'number' && (
                  <input
                    type="number"
                    value={item.value as number}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    onChange={(e) => onChange(item.id, parseFloat(e.target.value))}
                    style={{ width: '100%', padding: `${space[2]} ${space[3]}`, backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: radius.md, color: 'var(--color-text-primary)', fontSize: fontSize.sm }}
                  />
                )}
                {item.type === 'slider' && (
                  <input
                    type="range"
                    value={item.value as number}
                    min={item.min ?? 0}
                    max={item.max ?? 100}
                    step={item.step ?? 1}
                    onChange={(e) => onChange(item.id, parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                )}
                {item.type === 'color' && (
                  <input
                    type="color"
                    value={colorInputValue(item.value as string)}
                    onChange={(e) => onChange(item.id, e.target.value)}
                    style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }}
                  />
                )}
                {item.type === 'checkbox' && (
                  <input
                    type="checkbox"
                    checked={item.value as boolean}
                    onChange={(e) => onChange(item.id, e.target.checked)}
                  />
                )}
                {item.type === 'text' && (
                  <input
                    type="text"
                    value={item.value as string}
                    onChange={(e) => onChange(item.id, e.target.value)}
                    style={{ width: '100%', padding: `${space[2]} ${space[3]}`, backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: radius.md, color: 'var(--color-text-primary)', fontSize: fontSize.sm }}
                  />
                )}
                {item.type === 'select' && (
                  <select
                    value={item.value as string}
                    onChange={(e) => onChange(item.id, e.target.value)}
                    style={{ width: '100%', padding: `${space[2]} ${space[3]}`, backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: radius.md, color: 'var(--color-text-primary)', fontSize: fontSize.sm }}
                  >
                    {item.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexTimeline -- timeline for animation/video apps
// ---------------------------------------------------------------------------
export interface DexKeyframe {
  time: number;
  value: number;
  easing?: string;
}

export interface DexTimelineTrack {
  id: string;
  name: string;
  keyframes: DexKeyframe[];
  color?: string;
}

export interface DexAnimationTimelineProps {
  tracks: DexTimelineTrack[];
  currentTime: number;
  duration: number;
  fps?: number;
  onSeek: (time: number) => void;
  onKeyframeSelect?: (trackId: string, index: number) => void;
  onKeyframeMove?: (trackId: string, index: number, newTime: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DexAnimationTimeline: React.FC<DexAnimationTimelineProps> = ({
  tracks,
  currentTime,
  duration,
  fps = 30,
  onSeek,
  onKeyframeSelect,
  className,
  style,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadPosition = (currentTime / duration) * 100;

  const handleClick = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration;
    onSeek(Math.max(0, Math.min(duration, time)));
  };

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const frames = Math.floor((t % 1) * fps);
    return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className={className} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: radius.lg, overflow: 'hidden', ...style }}>
      {/* Time ruler */}
      <div style={{ height: 24, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${space[3]}`, fontSize: fontSize.xs, color: 'var(--color-text-muted)' }}>
        <span>{formatTime(0)}</span>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      
      {/* Tracks */}
      <div ref={timelineRef} onClick={handleClick} style={{ position: 'relative', cursor: 'pointer' }}>
        {tracks.map(track => (
          <div key={track.id} style={{ height: 32, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', position: 'relative' }}>
            <div style={{ width: 100, padding: `0 ${space[2]}`, fontSize: fontSize.xs, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{track.name}</div>
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              {track.keyframes.map((kf, i) => (
                <div
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onKeyframeSelect?.(track.id, i); }}
                  style={{
                    position: 'absolute',
                    left: `${(kf.time / duration) * 100}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 10,
                    height: 10,
                    backgroundColor: track.color || 'var(--color-accent)',
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        
        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `calc(100px + ${playheadPosition}% * (100% - 100px) / 100)`,
          top: 0,
          bottom: 0,
          width: 2,
          backgroundColor: 'var(--color-error)',
          pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', top: -4, left: -4, width: 10, height: 10, backgroundColor: 'var(--color-error)', borderRadius: '50%' }} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexHistogram -- color histogram display
// ---------------------------------------------------------------------------
export interface DexHistogramProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexHistogram: React.FC<DexHistogramProps> = ({
  data,
  color = 'var(--color-text-muted)',
  height = 60,
  className,
  style,
}) => {
  const max = Math.max(...data, 1);
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-end', height, gap: 1, backgroundColor: 'var(--color-bg-input)', borderRadius: radius.md, padding: space[2], ...style }}>
      {data.map((value, i) => (
        <div key={i} style={{ flex: 1, height: `${(value / max) * 100}%`, backgroundColor: color, minHeight: 1 }} />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexWaveform -- audio waveform display
// ---------------------------------------------------------------------------
export interface DexWaveformProps {
  samples: number[];
  currentTime?: number;
  duration?: number;
  color?: string;
  progressColor?: string;
  height?: number;
  onSeek?: (time: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DexWaveform: React.FC<DexWaveformProps> = ({
  samples,
  currentTime = 0,
  duration = 1,
  color = 'var(--color-border)',
  progressColor = 'var(--color-accent)',
  height = 64,
  onSeek,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const max = Math.max(...samples.map(Math.abs), 0.01);

  const handleClick = (e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration;
    onSeek(Math.max(0, Math.min(duration, time)));
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        backgroundColor: 'var(--color-bg-input)',
        borderRadius: radius.md,
        cursor: onSeek ? 'pointer' : 'default',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%', gap: 1 }}>
        {samples.map((sample, i) => {
          const h = Math.abs(sample / max) * 100;
          const isPlayed = (i / samples.length) * 100 < progress;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                minHeight: 2,
                backgroundColor: isPlayed ? progressColor : color,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexMiniMap -- overview minimap for large documents/canvases
// ---------------------------------------------------------------------------
export interface DexMiniMapProps {
  viewportRatio: { x: number; y: number; width: number; height: number };
  onViewportChange?: (x: number, y: number) => void;
  thumbnail?: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexMiniMap: React.FC<DexMiniMapProps> = ({
  viewportRatio,
  onViewportChange,
  thumbnail,
  width = 120,
  height = 80,
  className,
  style,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onViewportChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onViewportChange(x, y);
  };

  return (
    <div
      className={className}
      onClick={handleClick}
      style={{
        width,
        height,
        backgroundColor: 'var(--color-bg-input)',
        borderRadius: radius.md,
        position: 'relative',
        cursor: onViewportChange ? 'pointer' : 'default',
        overflow: 'hidden',
        ...style,
      }}
    >
      {thumbnail && <img src={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />}
      <div style={{
        position: 'absolute',
        left: `${viewportRatio.x * 100}%`,
        top: `${viewportRatio.y * 100}%`,
        width: `${viewportRatio.width * 100}%`,
        height: `${viewportRatio.height * 100}%`,
        border: '2px solid var(--color-accent)',
        backgroundColor: 'rgba(0, 122, 255, 0.1)',
        borderRadius: 2,
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// DexRuler -- ruler for measurements
// ---------------------------------------------------------------------------
export interface DexRulerProps {
  length: number;
  unit?: 'px' | 'in' | 'cm' | 'mm';
  scale?: number;
  orientation?: 'horizontal' | 'vertical';
  offset?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DexRuler: React.FC<DexRulerProps> = ({
  length,
  unit = 'px',
  scale = 1,
  orientation = 'horizontal',
  offset = 0,
  className,
  style,
}) => {
  const isHorizontal = orientation === 'horizontal';
  const majorInterval = unit === 'px' ? 100 : unit === 'in' ? 1 : unit === 'cm' ? 1 : 10;
  const minorInterval = majorInterval / 10;
  const ticks: { pos: number; major: boolean; label?: string }[] = [];

  for (let i = 0; i <= length / scale; i += minorInterval) {
    const isMajor = i % majorInterval === 0;
    ticks.push({ pos: i * scale, major: isMajor, label: isMajor ? `${Math.round(i)}` : undefined });
  }

  return (
    <div className={className} style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'column' : 'row',
      backgroundColor: 'var(--color-bg-surface)',
      [isHorizontal ? 'height' : 'width']: 20,
      [isHorizontal ? 'width' : 'height']: length,
      position: 'relative',
      overflow: 'hidden',
      fontSize: 9,
      color: 'var(--color-text-muted)',
      ...style,
    }}>
      {ticks.map((tick, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            [isHorizontal ? 'left' : 'top']: tick.pos + offset,
            [isHorizontal ? 'bottom' : 'right']: 0,
            [isHorizontal ? 'width' : 'height']: 1,
            [isHorizontal ? 'height' : 'width']: tick.major ? 10 : 5,
            backgroundColor: 'var(--color-border)',
          }}
        >
          {tick.label && (
            <span style={{
              position: 'absolute',
              [isHorizontal ? 'left' : 'top']: 2,
              [isHorizontal ? 'top' : 'left']: 0,
              whiteSpace: 'nowrap',
            }}>{tick.label}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Export token re-exports
// ---------------------------------------------------------------------------
export {
  space,
  radius,
  fontSize,
  iconSize,
  zIndex,
  transition,
  padding,
  colors,
} from './tokens';
import { colorInputValue } from '../utils/canvasTheme';
