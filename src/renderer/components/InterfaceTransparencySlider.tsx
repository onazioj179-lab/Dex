// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Compact Interface Transparency slider for Control Center (Settings uses the
// fuller InterfaceTransparencyControl, which adds blur strength). Same store
// API, so both stay in sync. Changes apply live through applyGlassVars.

import React from 'react';
import { prefsToTransparency, useShellPreferences } from '../store/shellPreferencesStore';

function describe(value: number, overridden: boolean): string {
  if (overridden) return 'Reduce Transparency or High Contrast is on, so surfaces stay opaque.';
  if (value === 0) return 'Opaque: solid surfaces, no blur.';
  if (value < 40) return 'Subtle glass.';
  if (value < 80) return 'Standard glass.';
  return 'Maximum glass. Text stays readable.';
}

function isOverridden(): boolean {
  if (typeof document === 'undefined') return false;
  const mode = document.documentElement.getAttribute('data-glass-effective-mode');
  return mode === 'reduced';
}

export const InterfaceTransparencySlider: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const glassMode = useShellPreferences((s) => s.glassMode);
  const glassOpacity = useShellPreferences((s) => s.glassOpacity);
  const value = prefsToTransparency({ glassMode, glassOpacity });
  const setValue = useShellPreferences((s) => s.setInterfaceTransparency);
  const overridden = value > 0 && isOverridden();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {!compact && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Opaque</span>}
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Interface transparency"
          aria-valuetext={`${value}%`}
          style={{ flex: 1, minWidth: compact ? 0 : 160, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
        />
        {!compact && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Glass</span>}
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
          minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}>{value}%</span>
      </div>
      {!compact && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{describe(value, overridden)}</span>
      )}
    </div>
  );
};

export default InterfaceTransparencySlider;
