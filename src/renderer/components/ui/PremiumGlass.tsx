// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Premium Glass UI primitives (UI polish pass).
 *
 * Shared, dependency-free building blocks for the standardized DEX glass
 * surfaces: sidebar shell, navigation rows, toolbars, surfaces, cards,
 * section headers and status dots. Built strictly on the design tokens in
 * design-system.css and the style objects in styles/glassMenu.ts.
 *
 * No emojis are used in this module by design.
 */

import React from 'react';
import {
  premiumGlassPanel,
  premiumGlassSidebar,
  premiumGlassToolbar,
  premiumGlassCard,
  premiumGlassRow,
  premiumGlassRowActive,
} from '../../styles/glassMenu';

// ---------------------------------------------------------------------------
// GlassSurface -- generic premium-glass surface block.
// ---------------------------------------------------------------------------
export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'panel' | 'card' | 'toolbar';
  inset?: boolean;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  variant = 'panel',
  style,
  inset,
  children,
  ...rest
}) => {
  const base =
    variant === 'card' ? premiumGlassCard
    : variant === 'toolbar' ? premiumGlassToolbar
    : premiumGlassPanel;
  return (
    <div
      {...rest}
      style={{
        ...base,
        ...(inset ? { borderRadius: 0, border: 'none', boxShadow: 'none' } : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// GlassSidebar -- vertical premium-glass nav strip.
// ---------------------------------------------------------------------------
export interface GlassSidebarProps {
  width?: number;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export const GlassSidebar: React.FC<GlassSidebarProps> = ({
  width,
  header,
  footer,
  children,
  style,
  ariaLabel,
}) => {
  return (
    <nav
      aria-label={ariaLabel ?? 'Sidebar'}
      style={{
        ...premiumGlassSidebar,
        ...(width ? { width } : null),
        ...style,
      }}
    >
      {header && (
        <div
          style={{
            padding: '14px 14px 10px',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          {header}
        </div>
      )}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 'var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          style={{
            padding: '10px var(--space-3)',
            borderTop: '1px solid var(--pg-border)',
          }}
        >
          {footer}
        </div>
      )}
    </nav>
  );
};

// ---------------------------------------------------------------------------
// GlassNavItem -- standardized sidebar row used inside GlassSidebar.
// ---------------------------------------------------------------------------
export interface GlassNavItemProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}

export const GlassNavItem: React.FC<GlassNavItemProps> = ({
  icon,
  label,
  active,
  trailing,
  onClick,
  title,
  disabled,
}) => {
  const [hover, setHover] = React.useState(false);
  const styleMerged: React.CSSProperties = {
    ...premiumGlassRow,
    ...(active ? premiumGlassRowActive : null),
    ...(hover && !active && !disabled
      ? { background: 'var(--pg-row-hover)', color: 'var(--color-text-primary)' }
      : null),
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'default' : 'pointer',
    position: 'relative',
  };
  return (
    <button
      type="button"
      title={title}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styleMerged,
        background: styleMerged.background ?? 'transparent',
        border: 'none',
        textAlign: 'left',
        font: 'inherit',
        width: '100%',
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            background: 'var(--color-accent-fill)',
            borderRadius: 2,
          }}
        />
      )}
      {icon && (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            color: active ? 'var(--color-accent)' : 'currentColor',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: active ? 600 : 500,
          letterSpacing: 0.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      {trailing && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {trailing}
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// GlassToolbar -- horizontal premium-glass header strip.
// ---------------------------------------------------------------------------
export interface GlassToolbarProps {
  leading?: React.ReactNode;
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const GlassToolbar: React.FC<GlassToolbarProps> = ({
  leading,
  title,
  trailing,
  children,
  style,
}) => {
  return (
    <div style={{ ...premiumGlassToolbar, ...style }}>
      {leading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {leading}
        </div>
      )}
      {title && (
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: 0.1,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ flex: 1 }}>{children}</div>
      {trailing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {trailing}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SectionHeader -- caps-styled grouping label inside sidebars/panels.
// ---------------------------------------------------------------------------
export interface SectionHeaderProps {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  trailing,
  style,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) 10px 4px',
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--color-text-tertiary)',
        ...style,
      }}
    >
      <span>{children}</span>
      {trailing}
    </div>
  );
};

// ---------------------------------------------------------------------------
// StatusDot -- small color dot. Red is reserved for alert/error/blocked.
// ---------------------------------------------------------------------------
export type StatusDotTone = 'blue' | 'teal' | 'purple' | 'green' | 'red' | 'muted';

export interface StatusDotProps {
  tone?: StatusDotTone;
  pulse?: boolean;
  size?: number;
  title?: string;
  style?: React.CSSProperties;
}

const TONE_COLOR: Record<StatusDotTone, string> = {
  blue: 'var(--pg-dot-blue)',
  teal: 'var(--pg-dot-teal)',
  purple: 'var(--pg-dot-purple)',
  green: 'var(--pg-dot-green)',
  red: 'var(--pg-dot-red)',
  muted: 'var(--color-text-tertiary)',
};

export const StatusDot: React.FC<StatusDotProps> = ({
  tone = 'blue',
  pulse,
  size,
  title,
  style,
}) => {
  const color = TONE_COLOR[tone];
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-block',
        width: size ?? 'var(--pg-dot-size)',
        height: size ?? 'var(--pg-dot-size)',
        borderRadius: '50%',
        background: color,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
        animation: pulse ? 'pg-dot-pulse 1.6s ease-in-out infinite' : undefined,
        ...style,
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Inline keyframes for StatusDot pulse (injected once on first import).
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined' && !document.getElementById('pg-keyframes')) {
  const style = document.createElement('style');
  style.id = 'pg-keyframes';
  style.textContent = `
    @keyframes pg-dot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.85); }
    }
  `;
  document.head.appendChild(style);
}
