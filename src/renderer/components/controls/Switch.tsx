// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DexSwitch: the one on/off switch. A pill track with a concentric round knob
// (knob = track height - 2 x inset), so the shapes always match. The off-state
// outline is an inset shadow, not a border, so it never shifts the knob.
// role="switch", Space/Enter toggle (native button), reduced motion respected.

import React from 'react';
import { CAPSULE_INSET } from './capsuleTokens';
import { isReduceMotion } from '../../utils/MotionController';

export interface DexSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (the visible row label). */
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
}

const TRACK = { sm: { w: 32, h: 20 }, md: { w: 40, h: 24 } } as const;

export function switchGeometry(size: 'sm' | 'md') {
  const { w, h } = TRACK[size];
  const knob = h - CAPSULE_INSET * 2;
  return { w, h, knob, trackRadius: h / 2, knobRadius: knob / 2, travel: w - knob - CAPSULE_INSET * 2 };
}

export const DexSwitch: React.FC<DexSwitchProps> = ({ checked, onChange, label, disabled, size = 'md', id }) => {
  const g = switchGeometry(size);
  const motion = isReduceMotion() ? 'none' : undefined;
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-dex-capsule="switch"
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', flexShrink: 0, width: g.w, height: g.h, padding: 0, border: 'none',
        borderRadius: g.trackRadius,
        background: checked ? 'var(--color-accent-fill, var(--color-accent, #0A84FF))' : 'color-mix(in srgb, var(--color-text-primary, #fff) 14%, transparent)',
        boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--color-border-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: motion ?? 'background 0.15s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: CAPSULE_INSET, left: CAPSULE_INSET, width: g.knob, height: g.knob, borderRadius: g.knobRadius,
          background: checked ? 'var(--color-accent-text, #fff)' : '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          transform: `translateX(${checked ? g.travel : 0}px)`,
          transition: motion ?? 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      />
    </button>
  );
};

export default DexSwitch;
