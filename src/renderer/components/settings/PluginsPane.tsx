// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: list installed plugins with capability ledger surface.
 * Each capability shows its grant timestamp and a Revoke button.
 */

// DEX v3.8.9 wave E - plugins pane

import React from 'react';
import { Button } from '../../ui/Button';
import { colors, fontSize, fontWeight, space } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle, formatRelative } from './SettingsPaneShell';
import type { PluginManifest, CapabilityLedger, PluginCapability } from '../../../shared/plugin/manifest';

export interface PluginsPaneProps {
  plugins: PluginManifest[];
  ledger: CapabilityLedger;
  now?: number;
  onRevoke?: (pluginId: string, capability: PluginCapability) => void;
  onUninstall?: (pluginId: string) => void;
}

export function PluginsPane(props: PluginsPaneProps): React.JSX.Element {
  const { plugins, ledger, now, onRevoke, onUninstall } = props;
  return (
    <SettingsPaneShell
      title="Plugins"
      description="Installed plugins and the capabilities you have granted them."
      testId="settings-pane-plugins"
    >
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="plugins-list">
        {plugins.length === 0 ? (
          <li style={{ color: colors.text.tertiary, fontSize: fontSize.sm }} data-testid="plugins-empty">
            No plugins installed.
          </li>
        ) : null}
        {plugins.map((p) => {
          const grants = ledger.grants.filter((g) => g.pluginId === p.id);
          return (
            <li key={p.id} style={{ ...settingsRowStyle, alignItems: 'flex-start', flexDirection: 'column' }} data-testid={`plugins-row-${p.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
                  <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.text.primary }}>
                    {p.name} <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>v{p.version}</span>
                  </span>
                  <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    by {p.author}
                  </span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onUninstall?.(p.id)}
                  data-testid={`plugins-uninstall-${p.id}`}
                >
                  Uninstall
                </Button>
              </div>
              {grants.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: space[1] }} data-testid={`plugins-grants-${p.id}`}>
                  {grants.map((g) => (
                    <li
                      key={`${g.pluginId}:${g.capability}`}
                      data-testid={`plugins-grant-${p.id}-${g.capability}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: fontSize.xs, color: colors.text.secondary }}
                    >
                      <span>
                        {g.capability}
                        {g.scope ? ` (${g.scope})` : ''} · granted {formatRelative(g.grantedAt, now)}
                      </span>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => onRevoke?.(p.id, g.capability)}
                        data-testid={`plugins-revoke-${p.id}-${g.capability}`}
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span data-testid={`plugins-no-grants-${p.id}`} style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                  No capabilities granted.
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsPaneShell>
  );
}
