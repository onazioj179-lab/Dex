// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: searchable activity log with text + CSV export.
 */

// DEX v3.8.9 wave E - activity pane

import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/TextInput';
import { colors, fontSize, fontWeight, space } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle, formatRelative } from './SettingsPaneShell';
import {
  queryAudit, formatAuditAsText, formatAuditAsCsv,
  type AuditEvent, type AuditLogState,
} from '../../../shared/account/auditLog';

export interface ActivityPaneProps {
  log: AuditLogState;
  now?: number;
  onExport?: (format: 'text' | 'csv', payload: string) => void;
  defaultLimit?: number;
}

export function ActivityPane(props: ActivityPaneProps): React.JSX.Element {
  const { log, now, onExport, defaultLimit = 50 } = props;
  const [search, setSearch] = useState('');
  const events = useMemo<AuditEvent[]>(() => {
    const list = queryAudit(log, { limit: defaultLimit });
    if (!search.trim()) return list;
    const needle = search.trim().toLowerCase();
    return list.filter((e) => {
      if (e.kind.toLowerCase().includes(needle)) return true;
      if (e.actor.toLowerCase().includes(needle)) return true;
      if (e.pluginId?.toLowerCase().includes(needle)) return true;
      if (e.detail) return Object.values(e.detail).some((v) => String(v).toLowerCase().includes(needle));
      return false;
    });
  }, [log, search, defaultLimit]);

  return (
    <SettingsPaneShell
      title="Activity"
      description="Recent security and account events. Export for your own records."
      testId="settings-pane-activity"
    >
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter events..."
          aria-label="Filter activity events"
          data-testid="activity-search"
          style={{ flex: 1 }}
        />
        <Button
          variant="subtle"
          size="sm"
          onClick={() => onExport?.('text', formatAuditAsText(events))}
          data-testid="activity-export-text"
        >
          Export text
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => onExport?.('csv', formatAuditAsCsv(events))}
          data-testid="activity-export-csv"
        >
          Export CSV
        </Button>
      </div>
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="activity-list">
        {events.length === 0 ? (
          <li style={{ color: colors.text.tertiary, fontSize: fontSize.sm }} data-testid="activity-empty">
            No events match.
          </li>
        ) : null}
        {events.map((e) => (
          <li key={e.id} style={settingsRowStyle} data-testid={`activity-row-${e.id}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
              <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>
                {e.kind}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                {e.actor}{e.pluginId ? ` · ${e.pluginId}` : ''} · {formatRelative(e.ts, now)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SettingsPaneShell>
  );
}
