// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- AppShell
// Standardized chrome for standalone apps (DexCode, Vinx, Imosion, Nexus, ...).
// Provides a consistent title strip, optional icon, toolbar slot, optional
// status bar. Apps own their main content area (children).
// ===========================================================================
import React from 'react';
import { space, radius } from '../styles/tokens';

export interface AppShellProps {
  /** App name shown in the title strip. */
  title: string;
  /** Optional short subtitle/breadcrumb shown after title. */
  subtitle?: string;
  /** Optional inline icon (SVG element or pre-rendered node). */
  icon?: React.ReactNode;
  /** Right-hand controls in the title strip (window-level actions). */
  headerRight?: React.ReactNode;
  /** Toolbar shown below the title strip (filters, view modes, ...). */
  toolbar?: React.ReactNode;
  /** Optional bottom status bar (cursor pos, selection info, ...). */
  statusBar?: React.ReactNode;
  /** Optional explicit background; defaults to surface token. */
  background?: string;
  /** Children fill the remaining vertical space. */
  children: React.ReactNode;
  /** Extra style for the outer container. */
  style?: React.CSSProperties;
  /** Test hook. */
  'data-testid'?: string;
}

/**
 * AppShell — opt-in chrome wrapper. Apps that adopt it inherit:
 *   - 34px title strip with icon + title + subtitle + headerRight (matches the
 *     shell top bar so stacked chrome shares one height rhythm)
 *   - Optional toolbar row (40px, the canonical large-control rung) below it
 *   - Flex column layout, children take remaining space
 *   - Optional status bar at the bottom
 */
export const AppShell: React.FC<AppShellProps> = ({
  title,
  subtitle,
  icon,
  headerRight,
  toolbar,
  statusBar,
  background,
  children,
  style,
  'data-testid': testId,
}) => {
  return (
    <div
      data-app-shell="true"
      data-testid={testId ?? 'dex-app-shell'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: background ?? 'var(--color-bg-app, #0E0E10)',
        color: 'var(--color-text-primary, #fff)',
        borderRadius: radius.lg,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Title strip --------------------------------------------------- */}
      <div
        data-app-shell-title="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          padding: `0 ${space[3]}px`,
          height: 34,
          flexShrink: 0,
          minWidth: 0,
          background: 'var(--color-bg-titlebar, rgba(255,255,255,0.02))',
          borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
        }}
      >
        {icon && (
          <span
            data-app-shell-icon="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.2,
            color: 'var(--color-text-primary, #fff)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary, rgba(255,255,255,0.55))',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginLeft: space[1],
            }}
          >
            {subtitle}
          </span>
        )}
        <div style={{ flex: 1, minWidth: space[2] }} />
        {headerRight && (
          <div
            data-app-shell-header-right="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: space[2],
              minWidth: 0,
              maxWidth: '60%',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'thin',
            }}
          >
            {headerRight}
          </div>
        )}
      </div>

      {/* Toolbar ------------------------------------------------------- */}
      {toolbar && (
        <div
          data-app-shell-toolbar="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            padding: `0 ${space[3]}px`,
            height: 40,
            flexShrink: 0,
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'thin',
            borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
          }}
        >
          {toolbar}
        </div>
      )}

      {/* Body --------------------------------------------------------- */}
      <div
        data-app-shell-body="true"
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto' }}
      >
        {children}
      </div>

      {/* Status bar --------------------------------------------------- */}
      {statusBar && (
        <div
          data-app-shell-status="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            padding: `0 ${space[3]}px`,
            height: 24,
            flexShrink: 0,
            fontSize: 11,
            color: 'var(--color-text-secondary, rgba(255,255,255,0.55))',
            background: 'var(--color-bg-titlebar, rgba(255,255,255,0.02))',
            borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
          }}
        >
          {statusBar}
        </div>
      )}
    </div>
  );
};

AppShell.displayName = 'AppShell';

// ---------------------------------------------------------------------------
// Toolbar -- inline grouping helper for headerRight + toolbar slots
// ---------------------------------------------------------------------------
export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual separator above/below the row (when used outside AppShell). */
  bordered?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  bordered = false,
  style,
  children,
  ...rest
}) => (
  <div
    data-toolbar="true"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: space[2],
      minWidth: 0,
      maxWidth: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'thin',
      borderTop: bordered ? '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))' : undefined,
      borderBottom: bordered ? '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))' : undefined,
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);

Toolbar.displayName = 'Toolbar';
