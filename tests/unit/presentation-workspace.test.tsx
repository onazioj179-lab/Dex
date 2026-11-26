/** DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PresentationBuilder from '../../src/renderer/DEXAPPLICATIONS/standalone/PresentationBuilder';

vi.mock('../../src/renderer/components/DexIcon', () => ({ default: () => null }));
vi.mock('../../src/renderer/uki/appContextRegistry', () => ({ registerUkiAppContext: vi.fn(), unregisterUkiAppContext: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('presentation workspace', () => {
  it('refuses to download a project that cannot be reopened', () => {
    localStorage.setItem('dex-presentations-current', JSON.stringify([{
      id: 'legacy', background: '#ffffff', transition: 'none', blocks: [{
        id: 'bad-image', type: 'image', x: 0, y: 0, width: 100, height: 100,
        content: 'file:///private/image.png', style: {},
      }],
    }]));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const toast = vi.fn();
    window.addEventListener('dex-toast', toast);
    try {
      render(<PresentationBuilder />);
      fireEvent.click(screen.getByRole('button', { name: 'Save Project' }));
      expect(download).not.toHaveBeenCalled();
      expect(toast.mock.calls[0][0].detail.message).toContain('Unsupported image address');
      expect(JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks[0].content).toBe('file:///private/image.png');
    } finally { window.removeEventListener('dex-toast', toast); }
  });
  it('bounds inspector geometry so saved blocks can be reopened', () => {
    render(<PresentationBuilder />);
    fireEvent.click(screen.getByRole('button', { name: '+ Shape' }));
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '-100' } });
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '900' } });
    const blocks = JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks;
    expect(blocks[blocks.length - 1]).toMatchObject({ x: 0, y: 540 });
  });
  it('fits an imported image to the slide and preserves it through undo and redo', async () => {
    const data = 'data:image/png;base64,aGVsbG8=';
    vi.stubGlobal('FileReader', class {
      result = data;
      onload: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('Image', class {
      naturalWidth = 1600;
      naturalHeight = 800;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    const { container } = render(<PresentationBuilder />);
    const blocks = () => JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks;
    fireEvent.change(container.querySelector('input[accept^="image/png"]')!, {
      target: { files: [{ type: 'image/png', size: 100 }] },
    });
    await waitFor(() => expect(blocks()).toHaveLength(3));
    expect(blocks()[2]).toMatchObject({ type: 'image', content: data, x: 80, y: 70, width: 800, height: 400 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(blocks()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(blocks()[2].content).toBe(data);
  });
  it('rejects unsafe image formats and oversized assets without adding blank blocks', async () => {
    const { container } = render(<PresentationBuilder />);
    const toast = vi.fn();
    window.addEventListener('dex-toast', toast);
    const imageInput = container.querySelector('input[accept^="image/png"]')!;
    for (const file of [{ type: 'image/svg+xml', size: 1 }, { type: 'image/png', size: 9 * 1024 * 1024 }]) {
      fireEvent.change(imageInput, { target: { files: [file] } });
    }
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks).toHaveLength(2);
    window.removeEventListener('dex-toast', toast);
  });
  it('opens a validated project and can undo back to the original deck', async () => {
    const { container } = render(<PresentationBuilder />);
    const source = JSON.stringify({ format: 'dex-presentation', version: 1, themeId: 'paper', slides: [
      { id: 'imported', blocks: [], background: '#ffffff', transition: 'none', notes: 'Imported notes' },
    ] });
    const file = { size: source.length, text: async () => source };
    fireEvent.change(container.querySelector('input[accept*="application/json"]')!, { target: { files: [file] } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].id).toBe('imported'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks).toHaveLength(2);
  });

  it('restores edited speaker notes after focus mode', () => {
    render(<PresentationBuilder />);
    const notes = screen.getByLabelText('Speaker notes');
    fireEvent.change(notes, { target: { value: 'Keep this note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Focus Canvas' }));
    expect(screen.queryByRole('button', { name: 'Hide Inspector' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Panels' }));
    expect((screen.getByLabelText('Speaker notes') as HTMLTextAreaElement).value).toBe('Keep this note');
  });
  it('keeps a clicked block selected and supports undo/redo of deck edits', () => {
    const { container } = render(<PresentationBuilder />);
    fireEvent.click(screen.getByRole('button', { name: '+ Shape' }));
    const slide = container.querySelector('.print-hidden')!;
    const shape = slide.querySelector('[style*="cursor: move"]:last-child')!;
    fireEvent.click(shape);
    expect(screen.getByRole('button', { name: 'Delete Block' })).toBeTruthy();
    const count = () => JSON.parse(localStorage.getItem('dex-presentations-current')!)[0].blocks.length;
    expect(count()).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(count()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(count()).toBe(3);
  });

  it('warns when autosave fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    render(<PresentationBuilder />);
    expect(screen.getByRole('alert').textContent).toContain('Autosave failed');
  });
});
