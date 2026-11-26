// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecentFiles, openFileDialog, saveFile, saveFileDialog } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/fileIO';
import {
  buildSymbolIndex, searchProject, pickProjectFolder, restoreProject, openProjectDocument,
  saveProjectDocument, closeProjectFolder, searchWorkspaceFiles,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/project';
const invoke = vi.fn();
let prior: unknown;
beforeEach(() => {
  prior = window.dex;
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke } });
  localStorage.clear(); invoke.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { Object.defineProperty(window, 'dex', { configurable: true, value: prior }); vi.restoreAllMocks(); });
describe('DexCode file safety', () => {
  it('does not mark rejected or unsupported writes as saved', async () => {
    for (const result of [null, undefined, { success: false, error: 'Disk full' }]) {
      invoke.mockResolvedValueOnce(result);
      expect(await saveFile('C:\\code.dex', 'code')).toBe(false);
    }
    invoke.mockResolvedValueOnce({ success: true });
    expect(await saveFile('C:\\code.dex', 'code')).toBe(true);
  });
  it('does not report a save destination when writing failed', async () => {
    invoke.mockResolvedValueOnce({ canceled: false, filePath: 'C:\\code.dex' }).mockResolvedValueOnce({ success: false });
    expect(await saveFileDialog('code')).toBeNull();
  });
  it('rejects unreadable content instead of opening an object as source', async () => {
    invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\code.dex'] }).mockResolvedValueOnce({ success: false, error: 'Denied' });
    expect(await openFileDialog()).toBeNull();
  });
  it('validates malformed recent-file storage', () => {
    localStorage.setItem('dex-code-recent-files-v1', '{"path":"wrong shape"}');
    expect(getRecentFiles()).toEqual([]);
    localStorage.setItem('dex-code-recent-files-v1', '[null,7,"C:\\\\code.dex"]');
    expect(getRecentFiles()).toEqual(['C:\\code.dex']);
  });

  it('stops superseded searches and symbol scans after the pending read', async () => {
    const project = { root: 'C:/Project', files: [
      { name: 'a.ts', path: 'C:/Project/a.ts' },
      { name: 'b.ts', path: 'C:/Project/b.ts' },
    ] };
    for (const run of [
      (signal: AbortSignal) => searchProject(project, 'target', 200, signal),
      (signal: AbortSignal) => buildSymbolIndex(project, 200, signal),
    ]) {
      invoke.mockReset();
      const request = new AbortController();
      let finish!: (content: string) => void;
      invoke.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
      const pending = run(request.signal);
      request.abort();
      finish('function target() {}');
      const results = await pending;
      expect(results instanceof Map ? results.size : results.length).toBe(0);
      expect(invoke).toHaveBeenCalledTimes(1);
    }
  });

  it('takes editing rights from the native picker and restores legacy projects read-only', async () => {
    const root = 'C:/Project';
    const files = [{ name: 'src/app.ts', path: root + '/src/app.ts' }];
    invoke.mockResolvedValueOnce({ success: true, root, files, writable: true });
    expect(await pickProjectFolder()).toMatchObject({ root, files, writable: true });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('codeProject:choose');
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ success: true, root: null })
      .mockResolvedValueOnce({ success: true, root, files, writable: false });
    expect(await restoreProject()).toMatchObject({ root, files, writable: false });
    expect(invoke.mock.calls).toEqual([['codeProject:restore'], ['codeProject:list', { root }]]);
  });

  it('saves a scoped document with its current revision and preserves native conflicts', async () => {
    const root = 'C:/Project';
    const path = root + '/src/main.rs';
    const project = { root, files: [], writable: true };
    invoke.mockResolvedValueOnce({ success: true, document: { path, content: 'original', revision: 'one' } })
      .mockResolvedValueOnce({ success: true, revision: 'two' })
      .mockResolvedValueOnce({ success: false, error: 'File changed outside DEX.' });
    const { content, ...document } = await openProjectDocument(project, path);
    expect(content).toBe('original');
    const revision = await saveProjectDocument(document, 'mine');
    expect(revision).toBe('two');
    await expect(saveProjectDocument({ ...document, revision }, 'later')).rejects.toThrow('File changed outside DEX.');
    expect(invoke.mock.calls).toEqual([
      ['codeProject:openFile', { root, path }],
      ['codeProject:saveFile', { root, path, content: 'mine', revision: 'one' }],
      ['codeProject:saveFile', { root, path, content: 'later', revision: 'two' }],
    ]);
  });

  it('sends cancellation for the exact native search and suppresses the stale reply', async () => {
    const root = 'C:/Project';
    const request = new AbortController();
    let complete!: (reply: unknown) => void;
    invoke.mockReturnValueOnce(new Promise(resolve => { complete = resolve; })).mockResolvedValueOnce({ success: true });
    const pending = searchWorkspaceFiles({ root, files: [], writable: true }, 'value', request.signal);
    const ticket = invoke.mock.calls[0][1].ticket;
    request.abort();
    complete({ success: true, hits: [{ path: 'old', line: 1 }] });
    expect(await pending).toEqual({ hits: [] });
    expect(invoke).toHaveBeenCalledWith('codeProject:cancelSearch', { ticket });
  });

  it('keeps the saved project when native revocation fails', async () => {
    const root = 'C:/Project';
    localStorage.setItem('dex-code-project-v1', root);
    invoke.mockResolvedValueOnce({ success: false, error: 'Workspace preferences unavailable' })
      .mockResolvedValueOnce({ success: true });
    const project = { root, files: [], writable: true };
    await expect(closeProjectFolder(project)).rejects.toThrow('Workspace preferences unavailable');
    expect(localStorage.getItem('dex-code-project-v1')).toBe(root);
    await closeProjectFolder(project);
    expect(localStorage.getItem('dex-code-project-v1')).toBeNull();
  });
});
