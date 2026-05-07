// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: storage breakdown by category, with cleanup suggestions.
 */

// DEX v3.8.9 wave E - storage pane

import React, { useMemo } from 'react';
import { Button } from '../../ui/Button';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle, formatBytes } from './SettingsPaneShell';
import {
  summariseUsage, cleanupSuggestions, largestItems,
  type UsageItem, type UsageCategory,
} from '../../../shared/cloud/storageBreakdown';

export interface StoragePaneProps {
  items: UsageItem[];
  now?: number;
  onCleanCategory?: (category: UsageCategory) => void;
}

export function StoragePane({ items, now, onCleanCategory }: StoragePaneProps): React.JSX.Element {
  const breakdown = useMemo(() => summariseUsage(items), [items]);
  const suggestions = useMemo(() => cleanupSuggestions(items, { now }), [items, now]);
  const top = useMemo(() => largestItems(items, 5), [items]);
  const categoryRows = (Object.keys(breakdown.totals) as UsageCategory[])
    .filter((c) => breakdown.totals[c] > 0)
    .sort((a, b) => breakdown.totals[b] - breakdown.totals[a]);

  return (
    <SettingsPaneShell
      title="Storage"
      description={`${formatBytes(breakdown.total)} used across ${categoryRows.length} categories.`}
      testId="settings-pane-storage"
    >
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="storage-categories">
        {categoryRows.map((cat) => {
          const bytes = breakdown.totals[cat];
          const pct = breakdown.total > 0 ? (bytes / breakdown.total) * 100 : 0;
          return (
            <li key={cat} style={settingsRowStyle} data-testid={`storage-cat-${cat}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], flex: 1 }}>
                <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>{cat}</span>
                <div style={{ height: 4, background: colors.bg.inset, borderRadius: radius.full, overflow: 'hidden' }}>
                  <div style={{ width: `${pct.toFixed(1)}%`, height: '100%', background: colors.accent.default }} />
                </div>
                <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{formatBytes(bytes)} · {pct.toFixed(1)}%</span>
              </div>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => onCleanCategory?.(cat)}
                data-testid={`storage-clean-${cat}`}
              >
                Clean
              </Button>
            </li>
          );
        })}
      </ul>
      {suggestions.length > 0 ? (
        <div data-testid="storage-suggestions">
          <h3 style={{ margin: 0, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary }}>
            Suggested cleanups
          </h3>
          <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }}>
            {suggestions.map((s) => (
              <li key={`${s.category}:${s.reason}`} data-testid={`storage-suggest-${s.category}`} style={settingsRowStyle}>
                <span style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                  {s.category} · {formatBytes(s.bytes)} · {s.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {top.length > 0 ? (
        <div data-testid="storage-largest">
          <h3 style={{ margin: 0, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary }}>
            Largest items
          </h3>
          <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }}>
            {top.map((it) => (
              <li key={it.id} data-testid={`storage-item-${it.id}`} style={settingsRowStyle}>
                <span style={{ fontSize: fontSize.sm, color: colors.text.primary }}>{it.label ?? it.id}</span>
                <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{formatBytes(it.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsPaneShell>
  );
}
