// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LoadingStates - Reusable loading indicators for consistent UX.
 * Provides Skeleton, Spinner, ProgressBar, and Placeholder components.
 */

import React, { memo, useEffect, useState } from 'react';

// ======================================================================
// SKELETON COMPONENT
// ======================================================================

export interface SkeletonProps {
  /** Width in pixels or CSS string */
  width?: number | string;
  /** Height in pixels or CSS string */
  height?: number | string;
  /** Border radius in pixels */
  borderRadius?: number;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Optional variant for common shapes */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  /** Animation style */
  animation?: 'shimmer' | 'pulse' | 'wave' | 'none';
  /** Number of skeleton items to render (for lists) */
  count?: number;
  /** Gap between items when count > 1 */
  gap?: number;
}

/**
 * Skeleton placeholder for loading states.
 * Uses the global dex-skeleton class with shimmer animation.
 */
export const Skeleton = memo<SkeletonProps>(({
  width = '100%',
  height = 16,
  borderRadius,
  style,
  variant = 'rectangular',
  animation = 'shimmer',
  count = 1,
  gap = 8,
}) => {
  const baseRadius = (() => {
    if (borderRadius !== undefined) return borderRadius;
    switch (variant) {
      case 'circular': return '50%';
      case 'rounded': return 8;
      case 'text': return 4;
      default: return 0;
    }
  })();

  const animationClass = animation === 'shimmer' ? 'dex-skeleton' :
                         animation === 'pulse' ? 'skeleton-pulse' :
                         animation === 'wave' ? 'skeleton-wave' : '';

  const item = (key?: number) => (
    <div
      key={key}
      className={animationClass}
      role="status"
      aria-label="Loading"
      aria-busy="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof baseRadius === 'number' ? `${baseRadius}px` : baseRadius,
        background: 'var(--color-border-subtle)',
        ...style,
      }}
    />
  );

  if (count === 1) return item();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }, (_, i) => item(i))}
    </div>
  );
});

Skeleton.displayName = 'Skeleton';

// ======================================================================
// SPINNER COMPONENT
// ======================================================================

export interface SpinnerProps {
  /** Size in pixels */
  size?: number;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Color (defaults to accent) */
  color?: string;
  /** Optional label for screen readers */
  label?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Animated spinner indicator.
 * Uses CSS animation for smooth rotation.
 */
export const Spinner = memo<SpinnerProps>(({
  size = 24,
  strokeWidth = 2.5,
  color = 'var(--color-accent)',
  label = 'Loading',
  style,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      aria-busy="true"
      style={{
        animation: 'spin 1s linear infinite',
        ...style,
      }}
    >
      <circle
        cx="12"
        cy="12"
        r={10 - strokeWidth / 2}
        fill="none"
        stroke={`${color}30`}
        strokeWidth={strokeWidth}
      />
      <circle
        cx="12"
        cy="12"
        r={10 - strokeWidth / 2}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${Math.PI * (20 - strokeWidth) * 0.7} ${Math.PI * (20 - strokeWidth) * 0.3}`}
      />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
});

Spinner.displayName = 'Spinner';

// ======================================================================
// PROGRESS BAR COMPONENT
// ======================================================================

export interface ProgressBarProps {
  /** Progress value 0-100 */
  value: number;
  /** Height in pixels */
  height?: number;
  /** Color (defaults to accent) */
  color?: string;
  /** Background color */
  backgroundColor?: string;
  /** Show percentage label */
  showLabel?: boolean;
  /** Indeterminate mode (animated, ignores value) */
  indeterminate?: boolean;
  /** Border radius */
  borderRadius?: number;
  /** Animation duration in ms for value changes */
  animationDuration?: number;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Progress bar with determinate or indeterminate modes.
 * Animates smoothly between values.
 */
export const ProgressBar = memo<ProgressBarProps>(({
  value,
  height = 6,
  color = 'var(--color-accent)',
  backgroundColor = 'var(--color-border-subtle)',
  showLabel = false,
  indeterminate = false,
  borderRadius = 3,
  animationDuration = 300,
  style,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={indeterminate ? 'Loading' : `Progress: ${clampedValue}%`}
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius,
        background: backgroundColor,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        className={indeterminate ? 'progress-indeterminate' : undefined}
        style={{
          height: '100%',
          borderRadius,
          background: color,
          width: indeterminate ? '30%' : `${clampedValue}%`,
          transition: indeterminate ? 'none' : `width ${animationDuration}ms cubic-bezier(0.23, 1, 0.32, 1)`,
          willChange: 'width, transform',
        }}
      />
      {showLabel && !indeterminate && (
        <span style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}>
          {clampedValue}%
        </span>
      )}
      {indeterminate && (
        <style>{`
          .progress-indeterminate {
            animation: progress-indeterminate 1.5s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
          }
          @keyframes progress-indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      )}
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

// ======================================================================
// DOT LOADER COMPONENT
// ======================================================================

export interface DotLoaderProps {
  /** Dot size in pixels */
  size?: number;
  /** Color */
  color?: string;
  /** Number of dots */
  count?: number;
  /** Gap between dots */
  gap?: number;
  /** Optional label */
  label?: string;
  /** Style */
  style?: React.CSSProperties;
}

/**
 * Bouncing dot loader animation.
 */
export const DotLoader = memo<DotLoaderProps>(({
  size = 8,
  color = 'var(--color-accent)',
  count = 3,
  gap = 4,
  label = 'Loading',
  style,
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap,
        ...style,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            animation: `dot-bounce 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes dot-bounce {
          0% { transform: translateY(0); opacity: 0.4; }
          100% { transform: translateY(-${size * 0.75}px); opacity: 1; }
        }
      `}</style>
    </div>
  );
});

DotLoader.displayName = 'DotLoader';

// ======================================================================
// LOADING OVERLAY COMPONENT
// ======================================================================

export interface LoadingOverlayProps {
  /** Whether to show the overlay */
  visible: boolean;
  /** Content to display (defaults to spinner) */
  children?: React.ReactNode;
  /** Background color/opacity */
  background?: string;
  /** Z-index */
  zIndex?: number;
  /** Optional message */
  message?: string;
}

/**
 * Full-screen or container-filling loading overlay.
 */
export const LoadingOverlay = memo<LoadingOverlayProps>(({
  visible,
  children,
  background = 'rgba(0, 0, 0, 0.5)',
  zIndex = 100,
  message,
}) => {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label={message || 'Loading'}
      aria-busy="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        background,
        zIndex,
        backdropFilter: 'var(--blur-sm)',
      }}
    >
      {children || <Spinner size={40} />}
      {message && (
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>
          {message}
        </div>
      )}
    </div>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';

// ======================================================================
// SKELETON VARIANTS FOR COMMON PATTERNS
// ======================================================================

/** Skeleton for a text paragraph (multiple lines) */
export const SkeletonParagraph = memo<{ lines?: number; gap?: number }>(({
  lines = 3,
  gap = 6,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap }}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton
        key={i}
        height={14}
        width={i === lines - 1 ? '70%' : '100%'}
        variant="text"
      />
    ))}
  </div>
));

SkeletonParagraph.displayName = 'SkeletonParagraph';

/** Skeleton for a card with avatar, title, and description */
export const SkeletonCard = memo<{ width?: number | string }>(({ width = '100%' }) => (
  <div style={{
    width,
    padding: 'var(--space-4)',
    borderRadius: 10,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-subtle)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
      <Skeleton variant="circular" width={40} height={40} />
      <div style={{ flex: 1 }}>
        <Skeleton width="60%" height={14} variant="text" />
        <Skeleton width="40%" height={12} variant="text" style={{ marginTop: 6 }} />
      </div>
    </div>
    <SkeletonParagraph lines={2} />
  </div>
));

SkeletonCard.displayName = 'SkeletonCard';

/** Skeleton for a list item */
export const SkeletonListItem = memo<{ count?: number; height?: number }>(({
  count = 5,
  height = 56,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height }}>
        <Skeleton variant="circular" width={36} height={36} />
        <div style={{ flex: 1 }}>
          <Skeleton width="50%" height={14} variant="text" />
          <Skeleton width="30%" height={12} variant="text" style={{ marginTop: 4 }} />
        </div>
      </div>
    ))}
  </div>
));

SkeletonListItem.displayName = 'SkeletonListItem';

// ======================================================================
// DELAYED LOADING (PREVENTS FLASH)
// ======================================================================

export interface DelayedLoadingProps {
  /** Minimum delay before showing loader (ms) */
  delay?: number;
  /** Whether loading is in progress */
  loading: boolean;
  /** Content to show while loading */
  fallback?: React.ReactNode;
  /** Content to show when loaded */
  children: React.ReactNode;
}

/**
 * Shows loading state only after a delay to prevent flash.
 */
export const DelayedLoading = memo<DelayedLoadingProps>(({
  delay = 300,
  loading,
  fallback = <Spinner />,
  children,
}) => {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setShowLoader(true), delay);
      return () => clearTimeout(timer);
    } else {
      setShowLoader(false);
    }
  }, [loading, delay]);

  if (!loading) return <>{children}</>;
  if (showLoader) return <>{fallback}</>;
  return null;
});

DelayedLoading.displayName = 'DelayedLoading';
