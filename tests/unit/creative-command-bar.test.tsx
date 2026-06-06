// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UI flow test for the creative command bar (#095). Drives the real component
 * end-to-end in jsdom: type a goal -> plan preview -> apply -> run report,
 * proving the NL->op->apply wiring works without needing the live creative app.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CreativeCommandBar from '../../src/renderer/components/CreativeCommandBar';
import type { CreativeOp } from '../../src/shared/uki/creativeActions';

function typeGoal(text: string) {
  const input = screen.getByPlaceholderText(/tell prism|remove the background/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe('CreativeCommandBar (#095 NL command bar UI)', () => {
  it('plans a mutating op, requires confirm, applies it, and reports the result', async () => {
    const applied: CreativeOp[] = [];
    const onApplyOp = vi.fn((op: CreativeOp) => { applied.push(op); return `did ${op.op}`; });

    render(
      <CreativeCommandBar
        appId="prism"
        facts={{ layerId: 'L1' }}
        onApplyOp={onApplyOp}
        placeholder="Tell Prism what to do…"
      />,
    );

    typeGoal('remove the background');
    fireEvent.click(screen.getByRole('button', { name: /^plan$/i }));

    // Preview lists the resolved op + a "changes the document" confirm hint.
    expect(await screen.findByText('removeBackground')).toBeTruthy();
    expect(screen.getByText(/changes the document/i)).toBeTruthy();

    // Mutating => the action is "Apply" (confirm tier), not an auto "Run".
    const applyBtn = screen.getByRole('button', { name: /^apply$/i });
    fireEvent.click(applyBtn);

    // Run report shows it applied + the host's note.
    expect(await screen.findByText(/1 applied/i)).toBeTruthy();
    expect(screen.getByText(/did removeBackground/i)).toBeTruthy();
    expect(onApplyOp).toHaveBeenCalledTimes(1);
    expect(applied[0]).toMatchObject({ app: 'prism', op: 'removeBackground', mutates: true });
  });

  it('honestly reports a failure when the host applier throws (no faking)', async () => {
    const onApplyOp = vi.fn(() => { throw new Error('engine not installed'); });

    render(<CreativeCommandBar appId="prism" facts={{ layerId: 'L1' }} onApplyOp={onApplyOp} />);

    typeGoal('upscale 2x');
    fireEvent.click(screen.getByRole('button', { name: /^plan$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^apply$/i }));

    expect(await screen.findByText(/completed with errors/i)).toBeTruthy();
    expect(screen.getByText(/engine not installed/i)).toBeTruthy();
  });

  it('tells the user when a goal is not understood instead of doing nothing', async () => {
    render(<CreativeCommandBar appId="prism" facts={{ layerId: 'L1' }} onApplyOp={() => {}} />);

    typeGoal('asdfqwer zzz nonsense');
    fireEvent.click(screen.getByRole('button', { name: /^plan$/i }));

    expect(await screen.findByText(/didn.t catch a creative action/i)).toBeTruthy();
  });
});
