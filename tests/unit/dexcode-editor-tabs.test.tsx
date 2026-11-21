// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DexCode from '../../src/renderer/DEXAPPLICATIONS/standalone/DexCode';

const root = 'C:/Project';
const firstPath = root + '/src/first.ts';
const secondPath = root + '/src/second.ts';
const sessionKey = 'dex:code:editor-session:v1:main';
const originalDex = Object.getOwnPropertyDescriptor(window, 'dex');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  if (originalDex) Object.defineProperty(window, 'dex', originalDex);
  else Reflect.deleteProperty(window, 'dex');
});

function fixture() {
  const disk = new Map([
    [firstPath, { content: 'first on disk', revision: 'first-1' }],
    [secondPath, { content: 'second on disk', revision: 'second-1' }],
  ]);
  const bridge = vi.fn(async (channel: string, args?: { path?: string } | string, content?: string): Promise<unknown> => {
    if (channel === 'codeProject:restore') return {
      success: true, root, writable: true, files: [
        { name: 'src/first.ts', path: firstPath },
        { name: 'src/second.ts', path: secondPath },
      ],
    };
    if (channel === 'codeProject:openFile' && typeof args === 'object' && args.path) {
      const file = disk.get(args.path);
      return file ? { success: true, document: { path: args.path, ...file } } : { success: false, error: 'Missing file' };
    }
    if (channel === 'fs:read-file' && typeof args === 'string') return disk.get(args)?.content ?? null;
    if (channel === 'fs:write-file' && typeof args === 'string' && typeof content === 'string') {
      disk.set(args, { content, revision: 'saved' });
      return { success: true };
    }
    return null;
  });
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke: bridge } });
  return { disk, bridge };
}

const editor = () => screen.getByLabelText<HTMLTextAreaElement>('DexScript code editor');
const tab = (name: RegExp) => within(screen.getByRole('tablist', { name: 'Open files' })).getByRole('tab', { name });
const diskFile = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));
const edit = (value: string) => fireEvent.change(editor(), { target: { value } });
const save = () => fireEvent.keyDown(editor(), { key: 's', ctrlKey: true });

it('restores draft content, tab order, selection and the active file, and lazily reopens other files', async () => {
  const { bridge } = fixture();
  const firstMount = render(<DexCode />);
  await diskFile('src/first.ts');
  await waitFor(() => expect(editor().value).toBe('first on disk'));
  edit('first unsaved draft');
  editor().setSelectionRange(2, 8);
  editor().scrollTop = 24;
  fireEvent.scroll(editor());
  await diskFile('src/second.ts');
  await waitFor(() => expect(editor().value).toBe('second on disk'));
  edit('second unsaved draft');
  fireEvent.keyDown(tab(/^second/), { key: 'ArrowLeft' });
  expect(editor().value).toBe('first unsaved draft');
  expect(editor().selectionStart).toBe(2);
  expect(editor().selectionEnd).toBe(8);
  expect(editor().scrollTop).toBe(24);
  firstMount.unmount();

  bridge.mockClear();
  render(<DexCode />);
  await waitFor(() => expect(editor().value).toBe('first unsaved draft'));
  await waitFor(() => expect(editor().readOnly).toBe(false));
  const tabs = within(screen.getByRole('tablist', { name: 'Open files' })).getAllByRole('tab');
  expect(tabs.map(button => button.textContent)).toEqual(['first.ts', 'second.ts']);
  expect(tab(/^first/).getAttribute('aria-selected')).toBe('true');
  expect(editor().selectionStart).toBe(2);
  expect(bridge.mock.calls.filter(([channel]) => channel === 'codeProject:openFile')).toEqual([
    ['codeProject:openFile', { root, path: firstPath }],
  ]);
  fireEvent.click(tab(/^second/));
  await waitFor(() => expect(editor().readOnly).toBe(false));
  expect(editor().value).toBe('second unsaved draft');
});

it('keeps a recovered draft when the original changed and saves a copy only to another destination', async () => {
  const { bridge, disk } = fixture();
  const firstMount = render(<DexCode />);
  await diskFile('src/first.ts');
  await waitFor(() => expect(editor().value).toBe('first on disk'));
  edit('local draft');
  firstMount.unmount();
  disk.set(firstPath, { content: 'external change', revision: 'first-external' });
  bridge.mockClear();

  render(<DexCode />);
  expect(await screen.findByText('The file has changed on disk. Your draft is still open.')).toBeTruthy();
  expect(editor().value).toBe('local draft');
  save();
  expect(bridge.mock.calls.some(([channel]) => channel === 'codeProject:saveFile' || channel === 'fs:write-file')).toBe(false);
  bridge.mockImplementationOnce(async () => ({ filePath: firstPath }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft as…' }));
  await waitFor(() => expect(bridge).toHaveBeenCalledWith('dialog:save-file', expect.objectContaining({ defaultPath: 'recovered-first.ts' })));
  await act(async () => undefined);
  expect(disk.get(firstPath)?.content).toBe('external change');
  expect(editor().value).toBe('local draft');

  const copy = root + '/src/recovered-first.ts';
  bridge.mockImplementationOnce(async () => ({ filePath: copy }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft as…' }));
  await waitFor(() => expect(disk.get(copy)?.content).toBe('local draft'));
  expect(disk.get(firstPath)?.content).toBe('external change');
  expect(tab(/^recovered-first/).getAttribute('aria-label')).toBe('recovered-first.ts');
});

it('updates the revision of the saved tab when a different file is active', async () => {
  const { bridge } = fixture();
  render(<DexCode />);
  await diskFile('src/first.ts');
  await waitFor(() => expect(editor().value).toBe('first on disk'));
  let finish!: (result: unknown) => void;
  bridge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  edit('first saved version');
  save();
  await waitFor(() => expect(bridge).toHaveBeenCalledWith('codeProject:saveFile', {
    root, path: firstPath, content: 'first saved version', revision: 'first-1',
  }));
  await diskFile('src/second.ts');
  await waitFor(() => expect(editor().value).toBe('second on disk'));
  edit('second unsaved draft');
  await act(async () => { finish({ success: true, revision: 'first-2' }); });
  expect(editor().value).toBe('second unsaved draft');
  expect(tab(/^first/).getAttribute('aria-label')).toBe('first.ts');
  fireEvent.click(tab(/^first/));
  expect(editor().value).toBe('first saved version');
  bridge.mockResolvedValueOnce({ success: true, revision: 'first-3' });
  edit('first next version');
  save();
  await waitFor(() => expect(bridge).toHaveBeenLastCalledWith('codeProject:saveFile', {
    root, path: firstPath, content: 'first next version', revision: 'first-2',
  }));
});

it('persists an empty legacy draft and prompts before discarding a dirty tab', async () => {
  fixture();
  localStorage.setItem('dex-code-file-v1', 'legacy.dex');
  localStorage.setItem('dex-code-draft-v1', '');
  render(<DexCode />);
  await waitFor(() => expect(editor().readOnly).toBe(false));
  expect(editor().value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'New editor tab' }));
  expect(tab(/^legacy/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close legacy.dex' }));
  const cancel = await screen.findByRole('button', { name: 'Keep editing' });
  await act(async () => { fireEvent.click(cancel); });
  expect(tab(/^legacy/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close legacy.dex' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(screen.queryByRole('tab', { name: /^legacy/ })).toBeNull());
  await waitFor(() => expect(JSON.parse(localStorage.getItem(sessionKey) ?? 'null')?.tabs.map((entry: { name: string }) => entry.name)).toEqual(['untitled.dex']));
});

it('keeps the visible gutter bounded and readable for long files', async () => {
  fixture();
  const { container } = render(<DexCode />);
  await waitFor(() => expect(editor().readOnly).toBe(false));
  const longFile = 'print(1)\n'.repeat(12_500);
  edit(longFile);
  expect(editor().value).toBe(longFile);
  const gutter = container.querySelector('[data-editor-gutter]')!;
  expect(gutter.querySelectorAll('div > div').length).toBeLessThan(40);
  expect(editor().parentElement?.querySelector('pre[aria-hidden]')).toBeNull();
  editor().scrollTop = 9_999 * 20;
  fireEvent.scroll(editor());
  expect(within(gutter as HTMLElement).getByText('10000')).toBeTruthy();
  expect(gutter.querySelectorAll('div > div').length).toBeLessThan(40);
});
