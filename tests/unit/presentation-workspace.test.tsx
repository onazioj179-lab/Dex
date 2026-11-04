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
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('presentation workspace', () => {
  it('opens a validated project and can undo back to the original deck', async () => {
    const { container } = render(<PresentationBuilder />);
    const source = JSON.stringify({ format: 'dex-presentation', version: 1, themeId: 'paper', slides: [
      { id: 'imported', blocks: [], background: '#ffffff', transition: 'none', notes: 'Imported notes' },
    ] });
    const file = { size: source.length, text: async () => source };
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
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
