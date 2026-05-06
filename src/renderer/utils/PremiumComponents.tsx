// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Premium UI Components (Phase 1: Items 901-925)
// Premium visual components for the entire DEX ecosystem
// =============================================================================

import React, { useEffect, useRef, useState, useCallback, memo, ReactNode } from 'react';
import {
  useDepthShadow,
  useHoverGlow,
  useAmbientColor,
  useSpringValue,
  useMagneticSnap,
  useParallaxDepth,
  useCountUp,
  useStaggeredEntry,
  useFocusRing,
  getSurfaceMaterial,
  surfacePresets,
  getStaggerDelay,
  springPresets,
  getSpringTransition,
} from './premium';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShimmerProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  className?: string;
}

export interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: 'default' | 'frosted' | 'tinted' | 'matte';
  elevation?: 1 | 2 | 3 | 4;
  hasEdgeHighlight?: boolean;
  hasNoise?: boolean;
}

export interface PremiumButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
  magnetic?: boolean;
}

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export interface StaggeredListProps {
  children: ReactNode[];
  baseDelay?: number;
  className?: string;
}

export interface ParallaxContainerProps {
  children: ReactNode;
  depth?: number;
  className?: string;
}

export interface AmbientGlowProps {
  imageUrl: string;
  children: ReactNode;
  intensity?: number;
  className?: string;
}

export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: number | string;
  height?: number | string;
  lines?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shimmer Component (Item 916)
// ---------------------------------------------------------------------------

export const Shimmer = memo(function Shimmer({
  width = '100%',
  height = 16,
  borderRadius = 4,
  className = '',
}: ShimmerProps) {
  return (
    <div
      className={`dex-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Skeleton Loader (Item 916)
// ---------------------------------------------------------------------------

export const Skeleton = memo(function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}: SkeletonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'circular':
        return {
          width: width ?? 40,
          height: height ?? 40,
          borderRadius: '50%',
        };
      case 'rectangular':
        return {
          width: width ?? '100%',
          height: height ?? 100,
          borderRadius: 0,
        };
      case 'rounded':
        return {
          width: width ?? '100%',
          height: height ?? 100,
          borderRadius: 8,
        };
      case 'text':
      default:
        return {
          width: width ?? '100%',
          height: height ?? 14,
          borderRadius: 4,
        };
    }
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="dex-shimmer"
            style={{
              ...getVariantStyles(),
              width: i === lines - 1 ? '60%' : '100%', // Last line shorter
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`dex-shimmer ${className}`}
      style={getVariantStyles()}
    />
  );
});

// ---------------------------------------------------------------------------
// Glass Panel (Items 907, 909, 922)
// ---------------------------------------------------------------------------

export const GlassPanel = memo(function GlassPanel({
  children,
  className = '',
  style,
  variant = 'default',
  elevation = 2,
  hasEdgeHighlight = true,
  hasNoise = false,
}: GlassPanelProps) {
  const materialStyles = getSurfaceMaterial(
    variant === 'default' ? surfacePresets.glassPanel :
    variant === 'frosted' ? surfacePresets.frostedCard :
    variant === 'tinted' ? surfacePresets.tintedOverlay :
    surfacePresets.mattePanel
  );

  const shadowMap = {
    1: 'var(--shadow-premium-sm)',
    2: 'var(--shadow-premium-md)',
    3: 'var(--shadow-premium-lg)',
    4: 'var(--shadow-premium-xl)',
  };

  return (
    <div
      className={`dex-glass-panel ${hasEdgeHighlight ? 'dex-glass-edge' : ''} ${hasNoise ? 'dex-noise' : ''} ${className}`}
      style={{
        ...materialStyles,
        boxShadow: shadowMap[elevation],
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 12,
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Premium Button (Items 904, 912)
// ---------------------------------------------------------------------------

export const PremiumButton = memo(function PremiumButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  icon,
  magnetic = false,
}: PremiumButtonProps) {
  const { ref, offset } = useMagneticSnap(magnetic ? 15 : 0, 0.2);
  const { focusProps, focusStyle } = useFocusRing();

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: 12, minHeight: 28, gap: 4 },
    md: { padding: '8px 16px', fontSize: 13, minHeight: 32, gap: 6 },
    lg: { padding: '10px 20px', fontSize: 14, minHeight: 40, gap: 8 },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-accent)',
      color: '#FFFFFF',
      boxShadow: 'var(--shadow-premium-sm)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.08)',
      color: 'var(--color-text-primary)',
      border: '1px solid rgba(255, 255, 255, 0.14)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      onClick={onClick}
      disabled={disabled}
      className={`dex-btn-premium dex-focus-premium ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: getSpringTransition('all', springPresets.gentle),
        transform: magnetic ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...focusStyle,
      }}
      {...focusProps}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Animated Counter (Item 920)
// ---------------------------------------------------------------------------

export const AnimatedCounter = memo(function AnimatedCounter({
  value,
  duration = 1000,
  className = '',
  prefix = '',
  suffix = '',
}: AnimatedCounterProps) {
  const displayValue = useCountUp(value, duration);

  return (
    <span className={`dex-count-animate tabular-nums ${className}`}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Staggered List (Item 917)
// ---------------------------------------------------------------------------

export const StaggeredList = memo(function StaggeredList({
  children,
  baseDelay = 50,
  className = '',
}: StaggeredListProps) {
  const visibleIndices = useStaggeredEntry(children.length, baseDelay);

  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <div
          key={index}
          style={{
            opacity: visibleIndices.includes(index) ? 1 : 0,
            transform: visibleIndices.includes(index) ? 'translateY(0)' : 'translateY(8px)',
            transition: `opacity 300ms ease-out ${getStaggerDelay(index, baseDelay)}ms, transform 300ms ease-out ${getStaggerDelay(index, baseDelay)}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Parallax Container (Item 913)
// ---------------------------------------------------------------------------

export const ParallaxContainer = memo(function ParallaxContainer({
  children,
  depth = 10,
  className = '',
}: ParallaxContainerProps) {
  const offset = useParallaxDepth({ depth, smoothing: 0.1 });

  return (
    <div
      className={className}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: 'transform 50ms linear',
      }}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Ambient Glow Container (Item 903)
// ---------------------------------------------------------------------------

export const AmbientGlow = memo(function AmbientGlow({
  imageUrl,
  children,
  intensity = 0.15,
  className = '',
}: AmbientGlowProps) {
  const { color, loading } = useAmbientColor(imageUrl);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
      }}
    >
      {/* Ambient glow background */}
      <div
        style={{
          position: 'absolute',
          inset: -50,
          background: `radial-gradient(ellipse at center, ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}, transparent 70%)`,
          filter: 'blur(40px)',
          opacity: loading ? 0 : 1,
          transition: 'opacity 500ms ease',
          pointerEvents: 'none',
        }}
      />
      {/* Content */}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Hover Glow Card (Item 905)
// ---------------------------------------------------------------------------

export const HoverGlowCard = memo(function HoverGlowCard({
  children,
  className = '',
  glowColor = 'rgba(74, 158, 255, 0.2)',
  style,
}: {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: '50%', y: '50%' });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x: `${x}%`, y: `${y}%` });
  }, []);

  return (
    <div
      ref={containerRef}
      className={`dex-hover-glow ${className}`}
      onMouseMove={handleMouseMove}
      style={{
        '--mouse-x': mousePos.x,
        '--mouse-y': mousePos.y,
        ...style,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Glow Pulse Badge (Item 919)
// ---------------------------------------------------------------------------

export const GlowPulseBadge = memo(function GlowPulseBadge({
  children,
  color = 'var(--color-accent)',
  className = '',
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`dex-glow-pulse ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        background: color,
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Spring Value Display (Item 904)
// ---------------------------------------------------------------------------

export const SpringValue = memo(function SpringValue({
  value,
  className = '',
  format = (v: number) => v.toFixed(0),
}: {
  value: number;
  className?: string;
  format?: (value: number) => string;
}) {
  const springValue = useSpringValue(value, springPresets.gentle);

  return (
    <span className={`tabular-nums ${className}`}>
      {format(springValue)}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Depth Shadow Card (Item 901)
// ---------------------------------------------------------------------------

export const DepthShadowCard = memo(function DepthShadowCard({
  children,
  elevation = 2,
  className = '',
  style,
}: {
  children: ReactNode;
  elevation?: 0 | 1 | 2 | 3 | 4;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { ref, shadow } = useDepthShadow(elevation);

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={{
        boxShadow: shadow,
        transition: 'box-shadow 200ms ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Surface Material Card (Item 922)
// ---------------------------------------------------------------------------

export const SurfaceCard = memo(function SurfaceCard({
  children,
  material = 'glass',
  className = '',
  style,
}: {
  children: ReactNode;
  material?: 'glass' | 'frosted' | 'tinted' | 'matte';
  className?: string;
  style?: React.CSSProperties;
}) {
  const presetMap = {
    glass: surfacePresets.glassPanel,
    frosted: surfacePresets.frostedCard,
    tinted: surfacePresets.tintedOverlay,
    matte: surfacePresets.mattePanel,
  };

  const materialStyle = getSurfaceMaterial(presetMap[material]);

  return (
    <div
      className={className}
      style={{
        ...materialStyle,
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.12)',
        ...style,
      }}
    >
      {children}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Premium Input (Item 925)
// ---------------------------------------------------------------------------

export const PremiumInput = memo(function PremiumInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
  error = false,
  success = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  error?: boolean;
  success?: boolean;
}) {
  const { focusProps, focused } = useFocusRing();

  const getFocusRing = () => {
    if (error) return 'var(--focus-ring-error)';
    if (success) return 'var(--focus-ring-success)';
    return 'var(--focus-ring-premium)';
  };

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${error ? 'var(--color-error)' : success ? 'var(--color-success)' : 'rgba(255, 255, 255, 0.14)'}`,
        background: 'rgba(0, 0, 0, 0.25)',
        color: 'var(--color-text-primary)',
        fontSize: 13,
        outline: 'none',
        transition: 'all 150ms ease',
        boxShadow: focused ? getFocusRing() : 'none',
      }}
      {...focusProps}
    />
  );
});

// ---------------------------------------------------------------------------
// Progress Ring (Premium)
// ---------------------------------------------------------------------------

export const ProgressRing = memo(function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  color = 'var(--color-accent)',
  className = '',
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}) {
  const springProgress = useSpringValue(progress, springPresets.gentle);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (springProgress / 100) * circumference;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)' }}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 200ms ease' }}
      />
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Re-export hooks from premium.ts
  useDepthShadow,
  useHoverGlow,
  useAmbientColor,
  useSpringValue,
  useMagneticSnap,
  useParallaxDepth,
  useCountUp,
  useStaggeredEntry,
  useFocusRing,
};
