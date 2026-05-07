// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: accessibility settings - high contrast, colour-blind mode,
 * density, reduced motion. Pure presentational; host owns state.
 */

// DEX v3.8.9 wave E - accessibility pane

import React from 'react';
import { colors, fontSize, fontWeight, space, radius } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle } from './SettingsPaneShell';
import {
  COLORBLIND_PALETTES, DENSITY_SCALES,
  type ColorBlindMode, type Density,
} from '../../../shared/theme/accessibility';

export type ContrastMode = 'system' | 'high-light' | 'high-dark';

export interface AccessibilitySettings {
  contrast: ContrastMode;
  colorBlind: ColorBlindMode | 'none';
  density: Density;
  reducedMotion: boolean;
}

export interface AccessibilityPaneProps {
  value: AccessibilitySettings;
  onChange: (next: AccessibilitySettings) => void;
}

const CONTRAST_OPTIONS: Array<{ id: ContrastMode; label: string }> = [
  { id: 'system', label: 'System default' },
  { id: 'high-light', label: 'High contrast - light' },
  { id: 'high-dark', label: 'High contrast - dark' },
];

const COLORBLIND_OPTIONS: Array<{ id: ColorBlindMode | 'none'; label: string }> = [
  { id: 'none', label: 'None' },
  ...Object.keys(COLORBLIND_PALETTES).map((k) => ({ id: k as ColorBlindMode, label: k.charAt(0).toUpperCase() + k.slice(1) })),
];

const DENSITY_OPTIONS = (Object.keys(DENSITY_SCALES) as Density[]).map((d) => ({ id: d, label: d.charAt(0).toUpperCase() + d.slice(1) }));

export function AccessibilityPane({ value, onChange }: AccessibilityPaneProps): React.JSX.Element {
  return (
    <SettingsPaneShell
      title="Accessibility"
      description="Tune contrast, colour, density and motion for your needs."
      testId="settings-pane-accessibility"
    >
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }}>
        <li style={settingsRowStyle}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>Contrast</span>
          <select
            value={value.contrast}
            onChange={(e) => onChange({ ...value, contrast: e.target.value as ContrastMode })}
            data-testid="a11y-contrast"
            style={{
              background: colors.bg.elevated, color: colors.text.primary,
              border: `1px solid ${colors.border.default}`, borderRadius: radius.sm,
              padding: `${space[1]}px ${space[2]}px`, fontSize: fontSize.sm,
            }}
          >
            {CONTRAST_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </li>
        <li style={settingsRowStyle}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>Colour-blind palette</span>
          <select
            value={value.colorBlind}
            onChange={(e) => onChange({ ...value, colorBlind: e.target.value as ColorBlindMode | 'none' })}
            data-testid="a11y-colorblind"
            style={{
              background: colors.bg.elevated, color: colors.text.primary,
              border: `1px solid ${colors.border.default}`, borderRadius: radius.sm,
              padding: `${space[1]}px ${space[2]}px`, fontSize: fontSize.sm,
            }}
          >
            {COLORBLIND_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </li>
        <li style={settingsRowStyle}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>Density</span>
          <select
            value={value.density}
            onChange={(e) => onChange({ ...value, density: e.target.value as Density })}
            data-testid="a11y-density"
            style={{
              background: colors.bg.elevated, color: colors.text.primary,
              border: `1px solid ${colors.border.default}`, borderRadius: radius.sm,
              padding: `${space[1]}px ${space[2]}px`, fontSize: fontSize.sm,
            }}
          >
            {DENSITY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </li>
        <li style={settingsRowStyle}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>Reduced motion</span>
          <input
            type="checkbox"
            checked={value.reducedMotion}
            onChange={(e) => onChange({ ...value, reducedMotion: e.target.checked })}
            data-testid="a11y-reduced-motion"
          />
        </li>
      </ul>
    </SettingsPaneShell>
  );
}
