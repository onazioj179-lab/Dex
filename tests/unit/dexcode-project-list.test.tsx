// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectFileList } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/ProjectFileList';

afterEach(cleanup);

it('renders only visible nested files and opens the selected absolute path', () => {
  const files = Array.from({ length: 1500 }, (_, index) => ({
    name: `src/deep/file-${index}.ts`, path: `C:/Project/src/deep/file-${index}.ts`,
  }));
  const onOpen = vi.fn();
  render(<ProjectFileList files={files} active={files[750].path} onOpen={onOpen} />);
  expect(screen.getAllByRole('button').length).toBeLessThan(40);
  const list = screen.getByLabelText('Project files');
  list.scrollTop = 750 * 26;
  fireEvent.scroll(list);
  const active = screen.getByRole('button', { name: files[750].name });
  expect(active.getAttribute('aria-current')).toBe('true');
  fireEvent.click(active);
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(files[750].path);
});

it('opens and saves a restored project file and retains edits made during a save', async () => {
  const { default: DexCode } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/DexCode');
  const root = 'C:/Project';
  const path = `${root}/src/deep/main.ts`;
  let finish!: (value: unknown) => void;
  const invoke = vi.fn(async (channel: string, args?: { revision?: string }) => {
    if (channel === 'codeProject:restore') return { success: true, root, writable: true, files: [
      { name: 'src/deep/main.ts', path },
    ] };
    if (channel === 'codeProject:openFile') {
      return { success: true, document: { path, content: 'const value = 0;', revision: 'one' } };
    }
    if (channel === 'codeProject:saveFile') return args?.revision === 'one'
      ? new Promise(resolve => { finish = resolve; })
      : { success: true, revision: 'three' };
    return null;
  });
  const previous = Object.getOwnPropertyDescriptor(window, 'dex');
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke } });
  localStorage.clear();
  try {
    render(<DexCode />);
    fireEvent.click(await screen.findByRole('button', { name: 'src/deep/main.ts' }));
    const editor = screen.getByLabelText('DexScript code editor') as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe('const value = 0;'));
    fireEvent.change(editor, { target: { value: 'const value = 1;' } });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(invoke.mock.calls.some(([channel]) => channel === 'codeProject:saveFile')).toBe(false);
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('codeProject:saveFile', {
      root, path, content: 'const value = 1;', revision: 'one',
    }));
    fireEvent.change(editor, { target: { value: 'const value = 2;' } });
    await act(async () => { finish({ success: true, revision: 'two' }); });
    expect(editor.value).toBe('const value = 2;');
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('codeProject:saveFile', {
      root, path, content: 'const value = 2;', revision: 'two',
    }));
    expect(invoke.mock.calls.some(([channel]) => channel === 'fs:write-file')).toBe(false);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(window, 'dex', previous);
    else Reflect.deleteProperty(window, 'dex');
    localStorage.clear();
  }
});
