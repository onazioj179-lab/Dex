// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Shared shell + helpers for the v3.8.9 Wave E settings panes. Each pane
 * is a stateless presentational component that takes data + callbacks
 * from the host. The host (Settings.tsx) owns the persisted state.
 */

// DEX v3.8.9 wave E - settings shell

import React from 'react';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

export interface SettingsPaneShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
}

/** Card-style wrapper used by every Wave E pane for visual consistency. */
export function SettingsPaneShell({ title, description, children, testId }: SettingsPaneShellProps): React.JSX.Element {
  return (
    <section
      data-testid={testId}
      style={{
        background: colors.bg.surface,
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        padding: space[5],
        display: 'flex',
        flexDirection: 'column',
        gap: space[4],
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text.primary }}>
          {title}
        </h2>
        {description ? (
          <p style={{ margin: 0, fontSize: fontSize.sm, color: colors.text.secondary }}>
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export const settingsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[3],
  padding: `${space[3]}px 0`,
  borderTop: `1px solid ${colors.border.subtle}`,
};

export const settingsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

/** Format bytes -- re-exported from the shared format canonical. */
import { formatBytes } from '../../../shared/format/units';
export { formatBytes };

/** Format a ms timestamp as a relative "5m ago" / "2d ago" string. */
export function formatRelative(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}
