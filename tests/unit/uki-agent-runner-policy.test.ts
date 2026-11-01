import { describe, it, expect, beforeEach, vi } from 'vitest';

const replies: Array<string | ((signal?: AbortSignal) => Promise<string | null>)> = [];
vi.mock('../../src/renderer/uki/providers/connect', () => ({
  askConfiguredLLM: vi.fn(async (_u: string, _s: string, o: { signal?: AbortSignal }) => {
    const next = replies.shift();
    return typeof next === 'function' ? next(o?.signal) : next ?? 'done';
  }),
}));
let grants: string[] = [];
vi.mock('../../src/renderer/uki/permissions', () => ({
  listGrants: vi.fn(async () => grants.map((capability) => ({ capability }))),
}));
const fileCalls: string[] = [];
vi.mock('../../src/renderer/uki/fileTools', () => ({
  FILE_TOOL_NAMES: ['find_files', 'read_file', 'create_folder', 'rename_file', 'move_file', 'trash_file'],
  runFileTool: vi.fn(async (name: string) => { fileCalls.push(name); return `ok ${name}`; }),
}));

import { runUkiAgent, setUkiToolConfirmHandler } from '../../src/renderer/uki/agentRunner';
import { getUkiActionAudit, clearUkiActionAudit } from '../../src/renderer/uki/appActionRegistry';
import { useUkiTasks } from '../../src/renderer/store/ukiTasksStore';

beforeEach(() => {
  replies.length = 0;
  fileCalls.length = 0;
  grants = [];
  clearUkiActionAudit();
  useUkiTasks.setState({ tasks: [] });
  localStorage.clear();
});

describe('runUkiAgent policy gate', () => {
  it('blocks a file read without the permission and audits it', async () => {
    replies.push('TOOL read_file {"path": "C:\\\\Users\\\\me\\\\Documents\\\\a.txt"}', 'I could not read it.');
    const out = await runUkiAgent({ userText: 'summarize a.txt', systemPrompt: 'sys' });
    expect(out).toBe('I could not read it.');
    expect(fileCalls).toEqual([]);
    const last = getUkiActionAudit().at(-1)!;
    expect(last).toMatchObject({ id: 'read_file', outcome: 'blocked', risk: 'low' });
  });

  it('asks before moving to the Recycle Bin and respects a "no"', async () => {
    grants = ['file-write'];
    const confirm = vi.fn(() => false);
    setUkiToolConfirmHandler(confirm);
    replies.push('TOOL trash_file {"path": "C:\\\\Users\\\\me\\\\Downloads\\\\x.zip"}', 'Okay, left it alone.');
    await runUkiAgent({ userText: 'delete x.zip', systemPrompt: 'sys' });
    expect(confirm).toHaveBeenCalledWith('trash_file', expect.any(Object), 'high-risk action');
    expect(fileCalls).toEqual([]);
    expect(getUkiActionAudit().at(-1)).toMatchObject({ id: 'trash_file', outcome: 'denied', risk: 'high' });
  });

  it('runs an approved file change and audits it as ran', async () => {
    grants = ['file-write'];
    setUkiToolConfirmHandler(() => true);
    replies.push('TOOL create_folder {"path": "C:\\\\Users\\\\me\\\\Documents\\\\R"}', 'Created.');
    expect(await runUkiAgent({ userText: 'make folder R', systemPrompt: 'sys' })).toBe('Created.');
    expect(fileCalls).toEqual(['create_folder']);
    expect(getUkiActionAudit().at(-1)).toMatchObject({ id: 'create_folder', outcome: 'ran' });
  });

  it('Cancel stops an in-flight run and marks the task cancelled', async () => {
    replies.push('TOOL get_context {}');
    replies.push((signal) => new Promise((resolve) => {
      signal?.addEventListener('abort', () => resolve(null), { once: true });
    }));
    const run = runUkiAgent({ userText: 'research something long', systemPrompt: 'sys' });
    // Wait for the task to be created by the first tool step.
    for (let i = 0; i < 50 && useUkiTasks.getState().tasks.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    const task = useUkiTasks.getState().tasks[0];
    expect(task.status).toBe('running');
    useUkiTasks.getState().cancelTask(task.id);
    expect(await run).toMatch(/cancelled/i);
    expect(useUkiTasks.getState().tasks[0].status).toBe('cancelled');
  });

  it('uses the Fast budget for simple commands', async () => {
    const steps: string[] = [];
    replies.push('Opened.');
    await runUkiAgent({ userText: 'open notes', systemPrompt: 'sys', pushStep: (s) => steps.push(s) });
    expect(steps[0]).toMatch(/Reasoning profile: fast \(up to 2 steps\)/);
  });
});
