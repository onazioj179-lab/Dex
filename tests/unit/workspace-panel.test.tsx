/** DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkspacePanel } from '../../src/renderer/ui/WorkspacePanel';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('professional workspace panel', () => {
  it('restores collapsed state without unmounting editing controls', () => {
    const { unmount } = render(<WorkspacePanel storageKey="layout" title="Layers"><input aria-label="Layer name" defaultValue="Artwork" /></WorkspacePanel>);
    fireEvent.change(screen.getByLabelText('Layer name'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Layers' }));
    expect(screen.getByRole('button', { name: 'Show Layers' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Show Layers' }));
    expect((screen.getByLabelText('Layer name') as HTMLInputElement).value).toBe('Edited');
    fireEvent.click(screen.getByRole('button', { name: 'Hide Layers' }));
    unmount();
    render(<WorkspacePanel storageKey="layout" title="Layers">Content</WorkspacePanel>);
    expect(screen.getByRole('button', { name: 'Show Layers' })).toBeTruthy();
  });

  it('resizes using the keyboard with side-aware direction and bounds', () => {
    render(<WorkspacePanel storageKey="layout" title="Inspector" side="right">Content</WorkspacePanel>);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator.getAttribute('aria-valuenow')).toBe('230');
    fireEvent.keyDown(separator, { key: 'End' });
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator.getAttribute('aria-valuenow')).toBe('400');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(JSON.parse(localStorage.getItem('layout')!).width).toBe(160);
  });

  it('ignores malformed persisted geometry', () => {
    localStorage.setItem('layout', '{"width":"huge","collapsed":true}');
    render(<WorkspacePanel storageKey="layout" title="Slides">Content</WorkspacePanel>);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('220');
  });

  it('maps pointer movement through spatial scaling and stops on cancellation', () => {
    const { container } = render(<WorkspacePanel storageKey="layout" title="Layers">Content</WorkspacePanel>);
    const panel = container.firstElementChild as HTMLElement;
    Object.defineProperty(panel, 'offsetWidth', { value: 220 });
    panel.getBoundingClientRect = () => ({ width: 440 } as DOMRect);
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { clientX: x, pointerId: 1, button: 0 });
      return event;
    };
    const separator = screen.getByRole('separator');
    fireEvent(separator, pointer('pointerdown', 10));
    fireEvent(window, pointer('pointermove', 90));
    expect(separator.getAttribute('aria-valuenow')).toBe('260');
    fireEvent(window, pointer('pointercancel', 90));
    fireEvent(window, pointer('pointermove', 150));
    expect(separator.getAttribute('aria-valuenow')).toBe('260');
  });
});
