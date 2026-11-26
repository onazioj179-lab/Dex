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
// DEX LOADER — the one canonical DEX loading surface
// ======================================================================
//
// The platform had a generic <Spinner>, a bespoke per-app spinner, a button
// spinner and several ad-hoc "<div>Loading…</div>" strings — no shared identity,
// so surfaces kept reinventing (or skipping) the loading state. DexLoader is the
// single, branded answer: a precision mark + an optional task label + optional
// determinate progress, in three sizes (inline / panel / screen) for the states
// the platform actually has (a control, an app/asset load, a startup/recovery
// screen). It is FLAT (no backdrop blur, per the DEX-Sharp identity) and honors
// prefers-reduced-motion.

export interface DexLoadingMarkProps {
  /** Pixel size of the mark. */
  size?: number;
  /** Accent color of the active arc. */
  accent?: string;
  /** 0-100 makes the mark determinate (a filled arc, no spin). */
  progress?: number;
  /** Mark the SVG decorative when a parent element already labels the status. */
  decorative?: boolean;
  style?: React.CSSProperties;
}

/**
 * The DEX loading mark — a precision instrument cue, not a generic spinner: a
 * hairline track with four cardinal ticks (a reticle), a bright accent arc and a
 * center point. Indeterminate, the arc sweeps at a calm, constant rate; given
 * `progress` it becomes a determinate arc. Motion is GPU-only (transform) and
 * stops under prefers-reduced-motion.
 */
export const DexLoadingMark = memo<DexLoadingMarkProps>(({
  size = 36,
  accent = 'var(--color-accent)',
  progress,
  decorative = false,
  style,
}) => {
  const determinate = typeof progress === 'number';
  const C = 2 * Math.PI * 9; // circumference of the r=9 ring
  const pct = determinate ? Math.min(100, Math.max(0, progress as number)) : 0;
  const ticks: ReadonlyArray<readonly [number, number]> = [[12, 3], [21, 12], [12, 21], [3, 12]];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={decorative ? 'presentation' : 'status'}
      aria-label={decorative ? undefined : 'Loading'}
      aria-busy={decorative ? undefined : 'true'}
      style={style}
    >
      {/* hairline track */}
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-border-subtle)" strokeWidth="1.5" />
      {/* reticle ticks */}
      {ticks.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.85" fill="var(--color-border-strong, var(--color-border))" />
      ))}
      {/* active arc */}
      <circle
        className={determinate ? undefined : 'dex-mark-arc'}
        cx="12" cy="12" r="9" fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={determinate ? `${(pct / 100) * C} ${C}` : `${C * 0.3} ${C * 0.7}`}
        transform={determinate ? 'rotate(-90 12 12)' : undefined}
        style={determinate
          ? { transition: 'stroke-dasharray 300ms cubic-bezier(0.23,1,0.32,1)' }
          : { transformOrigin: '12px 12px' }}
      />
      {/* center point */}
      <circle cx="12" cy="12" r="1.1" fill={accent} />
      <style>{`
        .dex-mark-arc { animation: dex-mark-spin 1.1s linear infinite; transform-origin: 12px 12px; }
        @keyframes dex-mark-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .dex-mark-arc { animation: none; } }
      `}</style>
    </svg>
  );
});

DexLoadingMark.displayName = 'DexLoadingMark';

export interface DexLoaderProps {
  /** `inline` for controls/menus, `panel` to fill a container, `screen` to cover it. */
  variant?: 'inline' | 'panel' | 'screen';
  /** Primary task label, e.g. "Opening Notes". */
  label?: string;
  /** Secondary detail, e.g. "Preparing workspace…". */
  sublabel?: string;
  /** 0-100 → determinate (shows a progress bar + a filled mark). */
  progress?: number;
  /** Mark size override. */
  size?: number;
  /** Accent color override. */
  accent?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The canonical DEX loading surface. Prefer this over a bare spinner or a
 * "Loading…" string anywhere the user waits for content.
 */
export interface AppOpeningProps {
  name: string;
  /** The app's icon element (DexIcon), drawn on its tile. */
  icon?: React.ReactNode;
  /** App accent, used for the tile tint and the bar. */
  accent?: string;
  /** One line under the name (a loading milestone). */
  sublabel?: string;
  /** Show nothing for this long (ms), so a fast open never flashes a loader. */
  delayMs?: number;
}

/**
 * The open state for an app: its icon on a rounded tile, "Opening <name>",
 * and a thin pill bar that sweeps. Respects reduced motion.
 */
export const AppOpening = memo<AppOpeningProps>(({ name, icon, accent = 'var(--color-accent)', sublabel, delayMs = 120 }) => {
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={`Opening ${name}`}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        opacity: shown ? 1 : 0, transition: 'opacity 0.18s ease',
      }}
    >
      <style>{`
        @keyframes dexAppOpenBar { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
        @media (prefers-reduced-motion: reduce) { .dex-app-open-bar { animation: none !important; transform: none !important; width: 100% !important; opacity: 0.5; } }
      `}</style>
      <div style={{
        width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${accent} 14%, var(--color-bg-elevated))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 28%, transparent), 0 6px 18px rgba(0,0,0,0.18)`,
        color: accent,
      }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>Opening {name}</div>
        {sublabel && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sublabel}</div>}
      </div>
      <div style={{ width: 140, height: 3, borderRadius: 9999, background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
        <div className="dex-app-open-bar" style={{ width: '40%', height: '100%', borderRadius: 9999, background: accent, animation: 'dexAppOpenBar 1.1s cubic-bezier(0.45, 0, 0.25, 1) infinite' }} />
      </div>
    </div>
  );
});

AppOpening.displayName = 'AppOpening';

export const DexLoader = memo<DexLoaderProps>(({
  variant = 'panel',
  label,
  sublabel,
  progress,
  size,
  accent,
  className,
  style,
}) => {
  const determinate = typeof progress === 'number';

  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-label={label || 'Loading'}
        aria-busy="true"
        className={className}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          color: 'var(--color-text-tertiary)', fontSize: 12, ...style,
        }}
      >
        <DexLoadingMark size={size ?? 16} accent={accent} progress={progress} decorative />
        {label && <span>{label}</span>}
      </span>
    );
  }

  const isScreen = variant === 'screen';
  return (
    <div
      role="status"
      aria-label={label || 'Loading'}
      aria-busy="true"
      className={className}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-3)',
        width: '100%', height: '100%', minHeight: isScreen ? '100%' : 120,
        padding: 'var(--space-6)', textAlign: 'center', boxSizing: 'border-box',
        ...(isScreen
          ? { position: 'absolute', inset: 0, background: 'var(--color-bg-base, var(--color-bg-primary))', zIndex: 1 }
          : null),
        ...style,
      }}
    >
      <DexLoadingMark size={size ?? 36} accent={accent} progress={progress} decorative />
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', color: 'var(--color-text-secondary)' }}>
          {label}
        </div>
      )}
      {sublabel && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', maxWidth: 280, lineHeight: 1.4 }}>
          {sublabel}
        </div>
      )}
      {determinate && (
        <ProgressBar value={progress as number} height={4} style={{ width: 180, maxWidth: '70%' }} />
      )}
    </div>
  );
});

DexLoader.displayName = 'DexLoader';

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
      }}
    >
      {children || <DexLoadingMark size={40} decorative />}
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
