// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DexCode from '../../src/renderer/DEXAPPLICATIONS/standalone/DexCode';
import { scriptExtension, type CheckSyntax } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/languageProtocol';
import { createSyntaxService } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/syntaxService';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('parses JavaScript, TypeScript and TSX with source coordinates and no module resolution', () => {
  const check = createSyntaxService();
  expect(scriptExtension('Draft.MTS')).toBe('mts');
  expect(scriptExtension('ts')).toBeNull();
  expect(scriptExtension('main.dex')).toBeNull();
  expect(check('ts', 'import { missing } from "./not-on-disk";\nconst value: number = missing;')).toEqual([]);
  expect(check('js', 'const value = ;')).toEqual([
    { line: 1, column: 15, code: 1109, message: 'Expression expected.' },
  ]);
  expect(check('tsx', 'const element = <main>hello</main>;')).toEqual([]);
  expect(check('tsx', 'const element = <main>hello</aside>;')).toEqual([
    expect.objectContaining({ line: 1, message: expect.stringContaining("closing tag for 'main'") }),
  ]);
  expect(check('cts', 'const value: number = 1;')).toEqual([]);
});

it('checks the current unsaved draft, ignores an old worker reply, and jumps to a problem', async () => {
  localStorage.clear();
  const requests: CheckSyntax[] = [];
  const check = createSyntaxService();
  let instance: WorkerDouble;
  class WorkerDouble extends EventTarget {
    constructor() {
      super();
      instance = this;
    }
    postMessage(request: CheckSyntax) { requests.push(request); }
    terminate = vi.fn();
    respond(request: CheckSyntax) {
      this.dispatchEvent(new MessageEvent('message', {
        data: { request: request.request, problems: check(request.extension, request.text) },
      }));
    }
  }
  vi.stubGlobal('Worker', WorkerDouble);
  const view = render(<DexCode />);
  const name = screen.getByLabelText<HTMLInputElement>('File name');
  await waitFor(() => expect(name.readOnly).toBe(false));
  fireEvent.change(name, { target: { value: 'draft.ts' } });
  const editor = screen.getByLabelText<HTMLTextAreaElement>('DexScript code editor');
  fireEvent.change(editor, { target: { value: 'const valid = true;' } });
  fireEvent.click(screen.getByRole('button', { name: 'Problems' }));
  const diagnostics = within(screen.getByRole('region', { name: 'Syntax diagnostics' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.change(editor, { target: { value: 'const valid = true;\nconst broken = ;' } });
  await waitFor(() => expect(requests).toHaveLength(2));
  act(() => instance.respond(requests[0]));
  expect(diagnostics.getByText('Checking syntax…')).toBeTruthy();
  act(() => instance.respond(requests[1]));
  const problem = diagnostics.getByRole('button', { name: /Expression expected/ });
  fireEvent.click(problem);
  await waitFor(() => expect(editor.selectionStart).toBe(editor.value.lastIndexOf(';')));
  expect(editor.value).toBe('const valid = true;\nconst broken = ;');
  view.unmount();
  expect(instance!.terminate).toHaveBeenCalledOnce();
});
