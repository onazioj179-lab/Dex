// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
// The DEX capsule rule: a selected highlight is concentric with its capsule
// (outer radius - inset = inner radius) and a single row is a true pill.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '../../src/renderer/components/controls/SegmentedControl';
import { CAPSULE_HEIGHT, CAPSULE_INSET } from '../../src/renderer/components/controls/capsuleTokens';

const px = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v));

describe('DEX capsule geometry', () => {
  afterEach(() => cleanup());

  for (const variant of ['outlined', 'subtle'] as const) {
    for (const size of ['sm', 'md', 'lg'] as const) {
      it(`${variant} ${size}: pill outside, concentric highlight inside`, () => {
        const { getByRole } = render(<SegmentedControl aria-label="g" variant={variant} size={size} options={['a', 'b', 'c']} value="b" onChange={() => {}} />);
        const group = getByRole('radiogroup');
        const sel = getByRole('radio', { checked: true });
        const border = variant === 'outlined' ? 1 : 0;
        const segH = CAPSULE_HEIGHT[size] - CAPSULE_INSET * 2;
        const outerH = segH + (CAPSULE_INSET + border) * 2;
        expect(px(sel.style.height)).toBe(segH);
        expect(px(group.style.borderRadius)).toBe(outerH / 2); // true pill
        expect(px(group.style.borderRadius) - (CAPSULE_INSET + border)).toBe(px(sel.style.borderRadius)); // concentric
      });
    }
  }

  it('a multi-row grid is a rounded rectangle with a concentric highlight, never a pill', () => {
    const { getByRole } = render(<SegmentedControl aria-label="g" columns={2} options={['a', 'b', 'c', 'd']} value="a" onChange={() => {}} />);
    const outer = px(getByRole('radiogroup').style.borderRadius);
    expect(outer).toBe(10);
    expect(px(getByRole('radio', { checked: true }).style.borderRadius)).toBe(10 - CAPSULE_INSET - 1);
  });

  it('arrow keys move the selection; tabs semantics for view switchers', () => {
    let v = 'a';
    const { getAllByRole, rerender } = render(<SegmentedControl aria-label="g" options={['a', 'b', 'c']} value={v} onChange={(x) => { v = x; }} />);
    fireEvent.keyDown(getAllByRole('radio')[0], { key: 'ArrowRight' });
    expect(v).toBe('b');
    fireEvent.keyDown(getAllByRole('radio')[0], { key: 'End' });
    expect(v).toBe('c');
    rerender(<SegmentedControl aria-label="g" semantics="tabs" options={['a', 'b']} value="a" onChange={() => {}} />);
    expect(getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true');
  });
});
