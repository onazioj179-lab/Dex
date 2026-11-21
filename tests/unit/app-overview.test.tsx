// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppOverview } from '../../src/renderer/shell/AppOverview';

const apps = [
  { id: 'notes', name: 'Notes', icon: 'notes', color: '#c88', minimized: true },
  { id: 'gallery', name: 'Gallery', icon: 'gallery', color: '#8c8' },
  { id: 'home', name: 'Home', icon: 'home', color: '#88c' },
];

afterEach(cleanup);

describe('Open apps', () => {
  it('focuses the visible search and restores a filtered app with Enter', () => {
    const select = vi.fn();
    const dismiss = vi.fn();
    render(<AppOverview visible apps={apps} activeAppId="gallery" onSelectApp={select} onCloseApp={vi.fn()} onDismiss={dismiss} />);
    const search = screen.getByRole('textbox', { name: 'Filter open apps' });
    expect(search).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Switch to Gallery' })).toHaveAttribute('aria-current', 'true');
    fireEvent.change(search, { target: { value: '  NOtEs ' } });
    expect(screen.getByRole('button', { name: 'Restore Notes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Switch to Gallery' })).toBeNull();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith('notes');
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('moves focus after closing a card and returns focus to the opener when dismissed', () => {
    const Harness = () => {
      const [visible, setVisible] = useState(false);
      const [items, setItems] = useState(apps);
      return <>
        <button onClick={() => setVisible(true)}>Show windows</button>
        <AppOverview visible={visible} apps={items} activeAppId="gallery" onSelectApp={vi.fn()}
          onCloseApp={id => setItems(previous => previous.filter(app => app.id !== id))}
          onDismiss={() => setVisible(false)} />
      </>;
    };
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Show windows' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Open apps' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Notes' }));
    expect(within(dialog).queryByRole('button', { name: 'Restore Notes' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Switch to Gallery' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
