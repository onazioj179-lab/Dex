// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AppShell — the standardized chrome frame every DEX app renders inside.
 *
 * It owns NO document state. It is pure layout + chrome:
 *   - a top chrome bar: declarative MenuBar (File/Edit/View/Tools/Help) +
 *     optional title and a `toolbar` slot for genuinely momentary controls
 *     (play, undo, zoom) and an end-aligned `toolbarEnd` slot;
 *   - a body that hosts the app, with an optional right `inspector` panel;
 *   - an optional bottom StatusBar.
 *
 * Adoption is opt-in: an app wraps its return in <AppShell …> and passes its
 * menus as data. Loose tool-icon rows collapse into the MenuBar; the shell
 * keeps every app visually consistent (one chrome, one StatusBar, one menu
 * engine) without each app re-implementing it.
 */

import React from 'react';
import { MenuBar } from './MenuBar';
import { StatusBar } from '../StatusBar';
import { colors, fontStack, hairline } from '../../styles/tokens';
import type { MenuGroup } from './menuTypes';
import { WindowToolbar } from '../../shell/windowChrome';

export type AppShellSurface = 'glass' | 'creative-panel' | 'plain';

export interface AppShellStatus {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}

export interface AppShellProps {
  /** App id (for data attributes / future per-app wiring). */
  appId: string;
  /** Declarative top menus. Omit for apps that only need a toolbar. */
  menus?: MenuGroup[];
  /** Central menu dispatch (receives the selected action id). */
  onMenuSelect?: (actionId: string) => void;
  /** Title/brand shown after the menus. */
  title?: React.ReactNode;
  /** Momentary controls placed after the title (play, undo/redo, zoom…). */
  toolbar?: React.ReactNode;
  /** End-aligned chrome (AI command bar, export, status pills…). */
  toolbarEnd?: React.ReactNode;
  /** Optional right-edge inspector panel. */
  inspector?: React.ReactNode;
  /** Inspector width in px (default 280). */
  inspectorWidth?: number;
  /** Bottom status strip slots; omit to hide the StatusBar. */
  status?: AppShellStatus;
  /** Surface treatment: shell apps use 'glass', creative apps 'creative-panel'. */
  surface?: AppShellSurface;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const surfaceClass: Record<AppShellSurface, string> = {
  glass: 'dex-liquid-glass',
  'creative-panel': 'dex-creative-panel',
  plain: '',
};

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  minHeight: 0,
  background: 'var(--color-bg-base)',
  color: colors.text.primary,
  fontFamily: fontStack.ui,
  overflow: 'hidden',
};

const chromeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--app-header-height, 38px)',
  padding: '4px var(--space-2)',
  background: 'var(--color-bg-elevated)',
  borderBottom: hairline.default,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: colors.text.secondary,
  whiteSpace: 'nowrap',
  marginLeft: 4,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  minWidth: 0,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

export const AppShell: React.FC<AppShellProps> = ({
  appId,
  menus,
  onMenuSelect,
  title,
  toolbar,
  toolbarEnd,
  inspector,
  inspectorWidth = 280,
  status,
  surface = 'plain',
  className,
  style,
  children,
}) => {
  const cls = ['dex-app-shell', surfaceClass[surface], className].filter(Boolean).join(' ');

  return (
    <div className={cls} style={{ ...rootStyle, ...style }} data-app-shell={appId}>
      {/* In a unified window this bar lives in the window header (no second strip). */}
      <WindowToolbar inline={(bar) => <header style={chromeStyle}>{bar}</header>}>
        {menus && menus.length > 0 && <MenuBar groups={menus} onSelect={onMenuSelect} />}
        {title && <span style={titleStyle}>{title}</span>}
        {toolbar && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{toolbar}</div>}
        {toolbarEnd && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            {toolbarEnd}
          </div>
        )}
      </WindowToolbar>

      <div style={bodyStyle}>
        <main style={mainStyle}>{children}</main>
        {inspector && (
          <aside
            style={{
              width: inspectorWidth,
              flexShrink: 0,
              minHeight: 0,
              overflow: 'auto',
              background: 'var(--color-bg-surface)',
              borderLeft: hairline.default,
            }}
            aria-label="Inspector"
          >
            {inspector}
          </aside>
        )}
      </div>

      {status && (
        <StatusBar left={status.left} center={status.center} right={status.right} />
      )}
    </div>
  );
};

export default AppShell;
