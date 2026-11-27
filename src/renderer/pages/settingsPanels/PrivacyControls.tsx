// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings › Privacy & Security permission rows and Settings › Network mode.
//
// Both live here as components that SUBSCRIBE to their stores. They were drawn
// inside Settings from `getState()`, so a click saved the change and the switch
// never moved.

import React from 'react';
import { DexSwitch } from '../../components/controls';
import {
  usePermissionStore, ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_DESCRIPTIONS, type PermissionId,
} from '../../store/permissionStore';
import {
  useNetworkStore, NETWORK_MODE_LABELS, NETWORK_MODE_DESCRIPTIONS, type NetworkMode,
} from '../../store/networkStore';

type Styles = Record<string, React.CSSProperties>;

const TIMEOUTS: { value: number; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 1440, label: '1 day' },
];

/** What each switch really governs, so none of them promises more than it does. */
const GROUPS: { note: string; ids: PermissionId[] }[] = [
  {
    ids: ['microphone', 'camera', 'gps', 'screen_recording'],
    note: 'Everything starts off. DEX asks before any app uses the microphone, camera, your location or the screen, and turning a switch off stops a capture that is already running. Unused access turns itself off.',
  },
  {
    ids: ['bluetooth', 'wifi', 'network', 'notifications'],
    note: 'For extensions you install. DEX itself follows Settings › Network and Settings › Notifications.',
  },
];

export const PermissionControls: React.FC<{ styles: Styles }> = ({ styles }) => {
  const permissions = usePermissionStore((s) => s.permissions);
  const setPermission = usePermissionStore((s) => s.setPermission);
  const setAutoDisableMinutes = usePermissionStore((s) => s.setAutoDisableMinutes);
  const revokeAll = usePermissionStore((s) => s.revokeAll);
  const anyOn = ALL_PERMISSIONS.some((id) => permissions[id].enabled);
  return (
    <>
      {GROUPS.map((group) => (
        <React.Fragment key={group.ids[0]}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3)', lineHeight: 1.5 }}>{group.note}</div>
          {group.ids.map((id) => {
            const entry = permissions[id];
            return (
              <div key={id} className="settings-row" style={styles.settingRow} data-setting-row={PERMISSION_LABELS[id]}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingLabel} data-setting-search={PERMISSION_LABELS[id]}>{PERMISSION_LABELS[id]}</span>
                  <span style={styles.settingDesc}>{PERMISSION_DESCRIPTIONS[id]}</span>
                  {entry.enabled && entry.lastUsedAt && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      Last used {new Date(entry.lastUsedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {entry.enabled && (
                    <select
                      className="settings-select"
                      value={entry.autoDisableMinutes}
                      onChange={(e) => setAutoDisableMinutes(id, Number(e.target.value))}
                      style={{
                        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                        borderRadius: 6, color: 'var(--color-text-secondary)', fontSize: 12, padding: '4px 6px', cursor: 'pointer',
                      }}
                      aria-label={`Turn ${PERMISSION_LABELS[id]} off after`}
                    >
                      {TIMEOUTS.map((t) => <option key={t.value} value={t.value}>Off after {t.label}</option>)}
                    </select>
                  )}
                  <DexSwitch checked={entry.enabled} onChange={(v) => setPermission(id, v)} label={`${PERMISSION_LABELS[id]} permission`} />
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
      <button
        type="button"
        style={{ ...styles.dangerBtn, marginBottom: 'var(--space-4)', opacity: anyOn ? 1 : 0.5, cursor: anyOn ? 'pointer' : 'default' }}
        disabled={!anyOn}
        onClick={revokeAll}
      >
        Turn all permissions off
      </button>
    </>
  );
};

export const NetworkModeControls: React.FC = () => {
  const mode = useNetworkStore((s) => s.mode);
  const setMode = useNetworkStore((s) => s.setMode);
  const refresh = useNetworkStore((s) => s.refresh);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return (
    <div role="radiogroup" aria-label="Network mode" className="settings-group" style={{ marginBottom: 'var(--space-3)' }}>
      {(['full', 'local-only', 'disabled'] as NetworkMode[]).map((m, i) => {
        const selected = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => void setMode(m)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', width: '100%',
              background: 'transparent', border: 'none',
              borderTop: i ? '1px solid var(--color-border-subtle)' : 'none',
              padding: 'var(--space-3) 14px', cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-primary)',
            }}
          >
            <span aria-hidden="true" style={{
              marginTop: 2, width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
              border: selected ? '5px solid var(--color-accent-fill)' : '1px solid var(--color-border-control, var(--color-border-strong))',
              background: selected ? '#fff' : 'transparent',
            }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{NETWORK_MODE_LABELS[m]}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
                {NETWORK_MODE_DESCRIPTIONS[m]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
