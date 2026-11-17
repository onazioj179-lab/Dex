// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
// The Modal primitive and the shell popovers share one overlay stack, so one
// Escape closes one layer (it used to close every open dialog at once).
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Modal } from '../../src/renderer/ui/Modal';
import { _resetOverlayStack, overlayDepth, pushOverlay } from '../../src/renderer/services/overlayStack';

const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });

describe('overlay stack + Modal', () => {
  beforeEach(() => _resetOverlayStack());
  afterEach(() => cleanup());

  it('nested dialogs: Escape closes the inner one only', () => {
    const outer = vi.fn(), inner = vi.fn();
    render(
      <>
        <Modal open onClose={outer} ariaLabel="Outer" testIdPrefix="outer">outer</Modal>
        <Modal open onClose={inner} ariaLabel="Inner" testIdPrefix="inner">inner</Modal>
      </>,
    );
    expect(overlayDepth()).toBe(2);
    esc();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('dismissOnEscape=false keeps the dialog and shields the one behind', () => {
    const outer = vi.fn(), locked = vi.fn();
    render(
      <>
        <Modal open onClose={outer} ariaLabel="Outer" testIdPrefix="o2">outer</Modal>
        <Modal open onClose={locked} dismissOnEscape={false} ariaLabel="Locked" testIdPrefix="l2">locked</Modal>
      </>,
    );
    esc();
    expect(locked).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });

  it('closing a dialog takes it off the stack', () => {
    const { rerender } = render(<Modal open onClose={() => {}} ariaLabel="A" testIdPrefix="a">a</Modal>);
    expect(overlayDepth()).toBe(1);
    rerender(<Modal open={false} onClose={() => {}} ariaLabel="A" testIdPrefix="a">a</Modal>);
    expect(overlayDepth()).toBe(0);
  });

  it('a window Escape handler registered later never sees an overlay\'s Escape', () => {
    const shellEsc = vi.fn();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') shellEsc(); };
    window.addEventListener('keydown', h, true);
    try {
      const r = pushOverlay({ id: 'pop', close: vi.fn() });
      esc();
      expect(shellEsc).not.toHaveBeenCalled();
      r.release();
      esc();
      expect(shellEsc).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', h, true);
    }
  });
});
