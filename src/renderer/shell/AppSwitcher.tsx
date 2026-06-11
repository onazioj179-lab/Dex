// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX App Switcher -- macOS Cmd+Tab style visual overlay
 * ===========================================================================
 * Shows running apps in a centered glass strip when Ctrl+Tab is pressed.
 * The selected app is highlighted; release Ctrl to switch.
 * ===========================================================================
 */

import React, { memo } from 'react';
import type { RunningApp } from '../store/runningApps';
import { APP_DEFINITIONS } from '../store/runningApps';

interface AppSwitcherProps {
  visible: boolean;
  apps: RunningApp[];
  selectedIndex: number;
}

const AppSwitcher: React.FC<AppSwitcherProps> = memo(({ visible, apps, selectedIndex }) => {
  if (!visible || apps.length < 2) return null;

  return (
    <div
      role="dialog"
      aria-label="App Switcher"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 'var(--z-max)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '14px 18px',
        borderRadius: 14,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--pg-shadow-popover)',
        animation: 'switcherIn 0.12s ease-out',
      }}
    >
      <style>{`@keyframes switcherIn { from { opacity: 0; transform: translate(-50%,-50%) scale(0.94); } to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }`}</style>
      {apps.map((app, i) => {
        const def = APP_DEFINITIONS[app.id];
        const color = def?.color || '#8E8E93';
        const name = def?.name || app.id;
        const isSelected = i === selectedIndex;

        return (
          <div
            key={app.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 10px',
              borderRadius: 10,
              background: isSelected ? 'var(--color-border)' : 'transparent',
              border: isSelected ? '1.5px solid var(--color-text-tertiary)' : '1.5px solid transparent',
              transition: 'background 0.1s, border-color 0.1s',
              minWidth: 56,
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 8,
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isSelected ? `0 2px 10px ${color}66` : `0 1px 4px ${color}33`,
              transition: 'box-shadow 0.15s',
            }}>
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 500,
              color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textAlign: 'center',
            }}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
});

AppSwitcher.displayName = 'AppSwitcher';

export default AppSwitcher;
