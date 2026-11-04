// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ContextMenu keyboard use: visible focus, submenus, activation, dismissal.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextMenu, { type ContextMenuItem } from '../../src/renderer/components/ContextMenu';

function setup(extra: Partial<ContextMenuItem> = {}) {
  const copy = vi.fn();
  const pdf = vi.fn();
  const onClose = vi.fn();
  const items: ContextMenuItem[] = [
    { id: 'copy', label: 'Copy', onClick: copy },
    { id: 'off', label: 'Unavailable', disabled: true, onClick: vi.fn() },
    { id: 'export', label: 'Export', submenu: [{ id: 'png', label: 'PNG', disabled: true }, { id: 'pdf', label: 'PDF', onClick: pdf }] },
    { id: 'x', label: 'Other', ...extra },
  ];
  render(<ContextMenu items={items} position={{ x: 10, y: 10 }} onClose={onClose} />);
  const key = (k: string) => fireEvent.keyDown(document, { key: k });
  const focused = () => document.querySelector('[data-focused="true"]')?.textContent;
  return { copy, pdf, onClose, key, focused };
}

describe('ContextMenu keyboard', () => {
  it('takes focus and shows which item the arrow keys are on, skipping disabled items', () => {
    const { key, focused } = setup();
    expect(document.activeElement?.getAttribute('role')).toBe('menu');
    key('ArrowDown');
    expect(focused()).toContain('Copy');
    key('ArrowDown');
    expect(focused()).toContain('Export');
    key('ArrowUp');
    expect(focused()).toContain('Copy');
    key('End');
    expect(focused()).toContain('Other');
  });

  it('opens a submenu with the keyboard and activates its item', () => {
    const { key, pdf, onClose } = setup();
    key('ArrowDown'); key('ArrowDown'); // Export
    key('ArrowRight');
    expect(screen.getByRole('menu', { name: 'Export' })).toBeTruthy();
    key('Enter'); // first enabled sub item is PDF (PNG is disabled)
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes an open submenu first, then the menu', () => {
    const { key, onClose } = setup();
    key('ArrowDown'); key('ArrowDown'); key('ArrowRight');
    key('Escape');
    expect(screen.queryByRole('menu', { name: 'Export' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter activates the focused item', () => {
    const { key, copy } = setup();
    key('ArrowDown');
    key('Enter');
    expect(copy).toHaveBeenCalledTimes(1);
  });
});
