// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DexSwitch, switchGeometry } from '../../src/renderer/components/controls/Switch';

describe('DexSwitch', () => {
  afterEach(() => cleanup());

  it('pill track with a concentric knob and equal inset on both ends', () => {
    for (const size of ['sm', 'md'] as const) {
      const g = switchGeometry(size);
      expect(g.trackRadius).toBe(g.h / 2);
      expect(g.knobRadius).toBe(g.knob / 2);
      expect((g.h - g.knob) / 2).toBe(2);
      expect(g.w - g.knob - g.travel).toBe(4); // 2 px each end
    }
  });

  it('is a switch with its label as the name, toggles, and respects disabled', () => {
    let v = false;
    const { getByRole, rerender } = render(<DexSwitch checked={v} onChange={(n) => { v = n; }} label="Reduce Motion" />);
    const sw = getByRole('switch', { name: 'Reduce Motion' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(v).toBe(true);
    rerender(<DexSwitch checked onChange={() => { v = false; }} label="Reduce Motion" disabled />);
    fireEvent.click(getByRole('switch'));
    expect(v).toBe(true);
  });
});
