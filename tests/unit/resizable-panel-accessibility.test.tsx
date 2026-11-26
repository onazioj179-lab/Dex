// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResizablePanel } from '../../src/renderer/components/ResizablePanel';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe('shared professional panel resizing', () => {
  it('resets through keyboard and pointer within the configured bounds', () => {
    const resize = vi.fn();
    const end = vi.fn();
    render(<ResizablePanel storageKey="reset" initialWidth={200} minWidth={150} maxWidth={250}
      minHeight={100} maxHeight={300} defaultWidth={900} defaultHeight={10}
      resizeDirections={['e', 'se']} onResize={resize} onResizeEnd={end}>Editor</ResizablePanel>);
    const corner = screen.getByRole('button', { name: 'Resize panel se' });
    fireEvent.keyDown(corner, { key: 'Enter' });
    expect(resize).toHaveBeenLastCalledWith(250, 100);
    expect(end).toHaveBeenLastCalledWith(250, 100);
    expect(JSON.parse(localStorage.getItem('dex-resize-reset')!)).toEqual({ width: 250, height: 100 });
    fireEvent.keyDown(corner, { key: ' ' });
    fireEvent.doubleClick(screen.getByRole('separator'));
    expect(resize).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('250');
  });
  it('supports bounded keyboard resizing and persists the result', () => {
    render(<ResizablePanel storageKey="test" initialWidth={200} maxWidth={220} resizeDirections={['e']}>Editor</ResizablePanel>);
    const handle = screen.getByRole('separator', { name: 'Resize panel e' });
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(handle.getAttribute('aria-valuenow')).toBe('220');
    expect(JSON.parse(localStorage.getItem('dex-resize-test')!).width).toBe(220);
  });
  it('rejects malformed saved dimensions', () => {
    localStorage.setItem('dex-resize-test', '{"width":"900%","height":null}');
    render(<ResizablePanel storageKey="test" initialWidth={200} resizeDirections={['e']}>Editor</ResizablePanel>);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('200');
  });
  it('accounts for spatial scale and retains pending dimensions across callback changes', () => {
    const end = vi.fn();
    const { container, rerender } = render(<ResizablePanel initialWidth={200} resizeDirections={['e']} onResizeEnd={end}>Editor</ResizablePanel>);
    const panel = container.firstElementChild as HTMLElement;
    Object.defineProperty(panel, 'offsetWidth', { value: 200 });
    panel.getBoundingClientRect = () => ({ width: 400, height: 200 } as DOMRect);
    fireEvent.mouseDown(screen.getByRole('separator'), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 50, clientY: 10 });
    const latestEnd = vi.fn();
    rerender(<ResizablePanel initialWidth={200} resizeDirections={['e']} onResizeEnd={latestEnd}>Editor</ResizablePanel>);
    fireEvent.mouseUp(document);
    expect(latestEnd).toHaveBeenCalledWith(220, 200);
    expect(end).not.toHaveBeenCalled();
  });
});
