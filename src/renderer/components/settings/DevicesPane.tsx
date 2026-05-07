// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: list active device sessions with revoke/trust actions.
 * Pure presentational. Host owns the SessionStore.
 */

// DEX v3.8.9 wave E - devices pane

import React from 'react';
import { Button } from '../../ui/Button';
import { colors, fontSize, fontWeight, space } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle, formatRelative } from './SettingsPaneShell';
import type { DeviceSession, SessionStore } from '../../../shared/account/sessions';

export interface DevicesPaneProps {
  store: SessionStore;
  now?: number;
  onRevoke?: (id: string) => void;
  onTrust?: (id: string) => void;
  onRevokeAllOthers?: (currentId: string) => void;
}

export function DevicesPane(props: DevicesPaneProps): React.JSX.Element {
  const { store, now, onRevoke, onTrust, onRevokeAllOthers } = props;
  const current = store.sessions.find((s) => s.current);
  const sorted = [...store.sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt - a.lastSeenAt);
  return (
    <SettingsPaneShell
      title="Devices"
      description="Where you are signed in. Revoke any session you no longer recognise."
      testId="settings-pane-devices"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="subtle"
          size="sm"
          disabled={!current || store.sessions.length <= 1}
          onClick={() => current && onRevokeAllOthers?.(current.id)}
          data-testid="devices-revoke-others"
        >
          Sign out other devices
        </Button>
      </div>
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="devices-list">
        {sorted.length === 0 ? (
          <li style={{ color: colors.text.tertiary, fontSize: fontSize.sm }} data-testid="devices-empty">
            No active sessions.
          </li>
        ) : null}
        {sorted.map((s: DeviceSession) => (
          <li key={s.id} style={settingsRowStyle} data-testid={`devices-row-${s.id}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
              <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.text.primary }}>
                {s.deviceName}
                {s.current ? <span data-testid={`devices-current-${s.id}`} style={{ marginLeft: space[2], fontSize: fontSize.xs, color: colors.accent.default }}>This device</span> : null}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                {s.platform} · {s.geoCoarse ?? 'unknown location'} · last seen {formatRelative(s.lastSeenAt, now)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {!s.trusted ? (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => onTrust?.(s.id)}
                  data-testid={`devices-trust-${s.id}`}
                >
                  Trust
                </Button>
              ) : null}
              {!s.current ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onRevoke?.(s.id)}
                  data-testid={`devices-revoke-${s.id}`}
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SettingsPaneShell>
  );
}
