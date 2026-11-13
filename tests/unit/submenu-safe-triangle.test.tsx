// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Hover submenus: the flyout stays open while the pointer travels to it, and
// sibling rows crossed on the way don't steal the hover (safe triangle).

import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UnifiedDropdown, type DropdownItem } from '../../src/renderer/components/UnifiedDropdown';
import ContextMenu, { type ContextMenuItem } from '../../src/renderer/components/ContextMenu';

// Every flyout sits to the right: x 200..380, y 100..300.
const FLYOUT = { left: 200, right: 380, top: 100, bottom: 300, x: 200, y: 100, width: 180, height: 200 };

const items: DropdownItem[] = [
  { id: 'export', label: 'Export', children: [{ id: 'png', label: 'PNG' }, { id: 'pdf', label: 'PDF' }] },
  { id: 'copy', label: 'Copy' },
  { id: 'share', label: 'Share', children: [{ id: 'mail', label: 'Mail' }] },
];

const Harness: React.FC = () => {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger}>Menu</button>
      <UnifiedDropdown triggerRef={trigger} open onClose={() => {}} items={items} />
    </>
  );
};

const move = (el: Element, x: number, y: number) => fireEvent.mouseMove(el, { clientX: x, clientY: y });

describe('UnifiedDropdown submenu aim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return (this.matches('[data-dex-dropdown]') ? FLYOUT : { left: 0, right: 0, top: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps the flyout open after the pointer leaves its row (was closed after 180 ms)', () => {
    render(<Harness />);
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    move(exportRow, 150, 110);
    fireEvent.mouseEnter(exportRow);
    expect(screen.getByRole('menuitem', { name: 'PNG' })).toBeTruthy();
    fireEvent.mouseLeave(exportRow, { clientX: 190, clientY: 110 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('menuitem', { name: 'PNG' })).toBeTruthy();
  });

  it('crossing a sibling on the way to the flyout does not switch submenus', () => {
    render(<Harness />);
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    const shareRow = screen.getByRole('menuitem', { name: /Share/ });
    move(exportRow, 150, 110);
    fireEvent.mouseEnter(exportRow);
    // Diagonal down-right toward the flyout, passing over "Share".
    move(shareRow, 170, 160);
    fireEvent.mouseEnter(shareRow);
    expect(screen.queryByRole('menuitem', { name: 'PNG' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Mail' })).toBeNull();
  });

  it('moving straight down onto a sibling switches at once', () => {
    render(<Harness />);
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    const shareRow = screen.getByRole('menuitem', { name: /Share/ });
    move(exportRow, 150, 110);
    fireEvent.mouseEnter(exportRow);
    move(shareRow, 150, 170); // outside the triangle
    fireEvent.mouseEnter(shareRow);
    expect(screen.queryByRole('menuitem', { name: 'PNG' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mail' })).toBeTruthy();
  });

  it('a pointer that rests on a sibling inside the triangle wins after the grace period', () => {
    render(<Harness />);
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    const shareRow = screen.getByRole('menuitem', { name: /Share/ });
    move(exportRow, 150, 110);
    fireEvent.mouseEnter(exportRow);
    move(shareRow, 170, 160);
    fireEvent.mouseEnter(shareRow);
    act(() => { vi.advanceTimersByTime(350); });
    expect(screen.queryByRole('menuitem', { name: 'PNG' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mail' })).toBeTruthy();
  });

  it('only one submenu is open at a time', () => {
    render(<Harness />);
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    const shareRow = screen.getByRole('menuitem', { name: /Share/ });
    fireEvent.click(exportRow);
    fireEvent.click(shareRow);
    expect(screen.queryByRole('menuitem', { name: 'PNG' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mail' })).toBeTruthy();
  });
});

describe('ContextMenu submenu aim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return (this.matches('[data-ctx-flyout]') ? FLYOUT : { left: 0, right: 0, top: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('crossing a plain sibling on the way to the flyout keeps it open', () => {
    const ctxItems: ContextMenuItem[] = [
      { id: 'export', label: 'Export', submenu: [{ id: 'pdf', label: 'PDF', onClick: () => {} }] },
      { id: 'copy', label: 'Copy', onClick: () => {} },
    ];
    render(<ContextMenu items={ctxItems} position={{ x: 10, y: 10 }} onClose={() => {}} />);
    const menu = screen.getByRole('menu', { name: 'Context menu' });
    const exportRow = screen.getByRole('menuitem', { name: /Export/ });
    const copyRow = screen.getByRole('menuitem', { name: /Copy/ });
    move(menu, 150, 110);
    fireEvent.mouseEnter(exportRow);
    move(exportRow, 150, 110);
    expect(screen.queryByRole('menuitem', { name: 'PDF' })).toBeTruthy();
    move(menu, 170, 160);
    fireEvent.mouseEnter(copyRow);
    expect(screen.queryByRole('menuitem', { name: 'PDF' })).toBeTruthy();
    // Straight down instead: the sibling wins.
    move(menu, 150, 200);
    expect(screen.queryByRole('menuitem', { name: 'PDF' })).toBeNull();
  });
});
