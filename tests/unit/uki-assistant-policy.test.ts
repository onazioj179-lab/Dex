import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isLocalEndpoint, endpointAllowed, filterModelsForMode,
  classifyReasoning, reasoningBudget, REASONING_BUDGETS,
  decideToolCall, checkPathInScope, checkPlainName,
} from '../../src/shared/uki/assistantPolicy';
import { assertModelAllowed, chat } from '../../src/renderer/uki/providers/orchestrator';
import { CORE_TOOLS, KNOWN_TOOLS } from '../../src/shared/uki/toolValidation';
import { runFileTool } from '../../src/renderer/uki/fileTools';
import {
  useUkiTasks, registerTaskController, waitWhilePaused, isTaskControllable, releaseTaskController,
} from '../../src/renderer/store/ukiTasksStore';

const OPENAI = { providerId: 'openai', requiresKey: true };
const OLLAMA = { providerId: 'ollama', requiresKey: false };
const endpointOf = (id: string) => (id.startsWith('gpt') ? OPENAI : id === 'llama3.1' ? OLLAMA : null);

describe('processing mode (privacy boundary)', () => {
  it('treats only loopback keyless endpoints as local', () => {
    expect(isLocalEndpoint(OLLAMA)).toBe(true);
    expect(isLocalEndpoint({ ...OLLAMA, baseUrl: 'http://127.0.0.1:11434' })).toBe(true);
    expect(isLocalEndpoint({ ...OLLAMA, baseUrl: 'http://gpu-box.example.com:11434' })).toBe(false);
    expect(isLocalEndpoint(OPENAI)).toBe(false);
  });

  it('filters models per mode, preserving order', () => {
    const ids = ['gpt-4o', 'llama3.1', 'gpt-4o-mini'];
    expect(filterModelsForMode('hybrid', ids, endpointOf)).toEqual(ids);
    expect(filterModelsForMode('local-only', ids, endpointOf)).toEqual(['llama3.1']);
    expect(filterModelsForMode('cloud-only', ids, endpointOf)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(filterModelsForMode('manual', ids, endpointOf, 'gpt-4o-mini')).toEqual(['gpt-4o-mini']);
    expect(filterModelsForMode('manual', ids, endpointOf, null)).toEqual([]);
    expect(endpointAllowed('local-only', OPENAI)).toBe(false);
  });

  it('assertModelAllowed blocks cloud in Local only and non-pinned models in Manual', () => {
    const openai = { id: 'openai', label: 'OpenAI', requiresKey: true };
    const ollama = { id: 'ollama', label: 'Ollama', requiresKey: false };
    expect(() => assertModelAllowed('gpt-4o', openai, { processingMode: 'local-only' })).toThrow(/Local only/);
    expect(() => assertModelAllowed('llama3.1', ollama, { processingMode: 'local-only' })).not.toThrow();
    expect(() => assertModelAllowed('llama3.1', ollama, { processingMode: 'cloud-only' })).toThrow();
    expect(() => assertModelAllowed('gpt-4o', openai, { processingMode: 'manual', manualModel: 'gpt-4o-mini' })).toThrow(/Manual/);
    expect(() => assertModelAllowed('gpt-4o-mini', openai, { processingMode: 'manual', manualModel: 'gpt-4o-mini' })).not.toThrow();
  });

  it('chat() never sends a request to a cloud model in Local only mode', async () => {
    const fetchImpl = vi.fn();
    await expect(chat('gpt-4o', [{ role: 'user', content: 'private text' }], { processingMode: 'local-only' }, fetchImpl))
      .rejects.toThrow(/nothing was sent/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('reasoning profiles', () => {
  it('classifies effort by task', () => {
    expect(classifyReasoning('open notes')).toBe('fast');
    expect(classifyReasoning('What is the capital of France and why did it become the capital?')).toBe('balanced');
    expect(classifyReasoning('Refactor the auth module and explain the trade-offs')).toBe('deep');
    expect(classifyReasoning('Here is my code:\n```ts\nconst a = 1\n```')).toBe('deep');
  });

  it('user preference overrides classification', () => {
    expect(reasoningBudget('open notes', 'deep')).toEqual(REASONING_BUDGETS.deep);
    expect(reasoningBudget('Refactor everything', 'fast').maxSteps).toBe(2);
    expect(REASONING_BUDGETS.fast.maxSteps).toBeLessThan(REASONING_BUDGETS.deep.maxSteps);
  });
});

describe('tool risk decisions', () => {
  const none = new Set<string>();
  it('denies a tool whose capability is not granted', () => {
    expect(decideToolCall({ tool: 'read_file', mode: 'hybrid', granted: none }).kind).toBe('deny');
    expect(decideToolCall({ tool: 'read_file', mode: 'hybrid', granted: new Set(['file-read']) }).kind).toBe('allow');
  });
  it('blocks external tools in Local only unless Network is granted', () => {
    expect(decideToolCall({ tool: 'web_search', mode: 'local-only', granted: none }).kind).toBe('deny');
    expect(decideToolCall({ tool: 'web_search', mode: 'local-only', granted: new Set(['network']) }).kind).toBe('allow');
    expect(decideToolCall({ tool: 'web_search', mode: 'hybrid', granted: none }).kind).toBe('allow');
  });
  it('asks before any file change and always before the Recycle Bin', () => {
    const w = new Set(['file-write']);
    expect(decideToolCall({ tool: 'rename_file', mode: 'hybrid', granted: w }).kind).toBe('confirm');
    expect(decideToolCall({ tool: 'trash_file', mode: 'hybrid', granted: w }).kind).toBe('confirm');
    expect(decideToolCall({ tool: 'open_app', mode: 'hybrid', granted: none }).kind).toBe('allow');
  });
});

describe('path scope', () => {
  const roots = ['C:\\Users\\me\\Documents', 'C:\\Users\\me\\Downloads'];
  it('accepts paths inside a scope (case-insensitive, either slash)', () => {
    expect(checkPathInScope('C:\\Users\\me\\Documents\\a.txt', roots)).toEqual({ ok: true, path: 'C:\\Users\\me\\Documents\\a.txt' });
    expect(checkPathInScope('c:/users/ME/downloads/x/y.pdf', roots).ok).toBe(true);
  });
  it('rejects traversal, relative, UNC/device and outside paths', () => {
    expect(checkPathInScope('C:\\Users\\me\\Documents\\..\\AppData\\x', roots).ok).toBe(false);
    expect(checkPathInScope('Documents\\a.txt', roots).ok).toBe(false);
    expect(checkPathInScope('\\\\server\\share\\a', roots).ok).toBe(false);
    expect(checkPathInScope('\\\\?\\C:\\Users\\me\\Documents\\a', roots).ok).toBe(false);
    expect(checkPathInScope('C:\\Windows\\System32\\drivers', roots).ok).toBe(false);
    expect(checkPathInScope('C:\\Users\\me\\DocumentsEvil\\a', roots).ok).toBe(false);
  });
  it('validates plain names', () => {
    expect(checkPlainName('report.txt').ok).toBe(true);
    expect(checkPlainName('a\\b').ok).toBe(false);
    expect(checkPlainName('CON').ok).toBe(false);
    expect(checkPlainName('..').ok).toBe(false);
  });
});

describe('tool catalog', () => {
  it('every core tool example is valid JSON with its required args', () => {
    expect(CORE_TOOLS.map((t) => t.name).sort()).toEqual([...KNOWN_TOOLS].sort());
    for (const t of CORE_TOOLS) {
      const parsed = JSON.parse(t.example) as Record<string, unknown>;
      for (const a of t.args) if (!a.optional) expect(typeof parsed[a.name]).toBe('string');
    }
  });
});

describe('file tools', () => {
  const scopes = ['C:\\Users\\me\\Documents', 'C:\\Users\\me\\Downloads'];
  it('refuses out-of-scope paths without touching the native side', async () => {
    const invoke = vi.fn();
    const r = await runFileTool('read_file', { path: 'C:\\Windows\\win.ini' }, { invoke, scopes });
    expect(r).toMatch(/outside your allowed folders/);
    expect(invoke).not.toHaveBeenCalled();
  });
  it('reads text, labels it untrusted, and skips binaries', async () => {
    const text = btoa('hello world');
    const invoke = vi.fn().mockResolvedValueOnce({ __dexBinary: text }).mockResolvedValueOnce({ __dexBinary: btoa('a\0b') });
    expect(await runFileTool('read_file', { path: 'C:\\Users\\me\\Documents\\a.txt' }, { invoke, scopes })).toMatch(/untrusted file content[\s\S]*hello world/);
    expect(await runFileTool('read_file', { path: 'C:\\Users\\me\\Documents\\b.bin' }, { invoke, scopes })).toMatch(/binary/);
  });
  it('moves into the destination folder and reports only verified success', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const r = await runFileTool('move_file', { path: 'C:\\Users\\me\\Downloads\\a.pdf', destination_folder: 'C:\\Users\\me\\Documents' }, { invoke, scopes });
    expect(invoke).toHaveBeenCalledWith('files:move', 'C:\\Users\\me\\Downloads\\a.pdf', 'C:\\Users\\me\\Documents');
    expect(r).toMatch(/Moved to C:\\Users\\me\\Documents\\a\.pdf/);
    invoke.mockResolvedValueOnce({ success: false, error: 'locked' });
    expect(await runFileTool('create_folder', { path: 'C:\\Users\\me\\Documents\\New' }, { invoke, scopes })).toMatch(/Could not create.*locked/);
  });
  it('deletes only via the Recycle Bin and never a top-level folder', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    expect(await runFileTool('trash_file', { path: 'C:\\Users\\me\\Documents' }, { invoke, scopes })).toMatch(/Refusing/);
    expect(invoke).not.toHaveBeenCalled();
    await runFileTool('trash_file', { path: 'C:\\Users\\me\\Downloads\\old.zip' }, { invoke, scopes });
    expect(invoke).toHaveBeenCalledWith('files:trash', 'C:\\Users\\me\\Downloads\\old.zip');
    expect(invoke.mock.calls.some((c) => c[0] === 'files:delete')).toBe(false);
  });
  it('find_files drops results outside the scopes', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true, files: [{ path: 'C:\\Users\\me\\Documents\\a.txt' }, { path: 'C:\\Windows\\a.txt' }] });
    const r = await runFileTool('find_files', { query: 'a' }, { invoke, scopes });
    expect(r).toContain('Documents\\a.txt');
    expect(r).not.toContain('Windows');
  });
});

describe('task control (pause / resume / cancel)', () => {
  beforeEach(() => useUkiTasks.setState({ tasks: [] }));

  it('pause holds the runner until resume', async () => {
    const id = useUkiTasks.getState().startTask('job', 'test');
    registerTaskController(id, new AbortController());
    useUkiTasks.getState().pauseTask(id);
    expect(useUkiTasks.getState().tasks[0].status).toBe('paused');
    let released = false;
    const wait = waitWhilePaused(id).then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBe(false);
    useUkiTasks.getState().resumeTask(id);
    await wait;
    expect(released).toBe(true);
    expect(useUkiTasks.getState().tasks[0].status).toBe('running');
    releaseTaskController(id);
  });

  it('cancel aborts the controller, releases a paused runner, and sticks', async () => {
    const id = useUkiTasks.getState().startTask('job', 'test');
    const ctrl = new AbortController();
    registerTaskController(id, ctrl);
    expect(isTaskControllable(id)).toBe(true);
    useUkiTasks.getState().pauseTask(id);
    const wait = waitWhilePaused(id, ctrl.signal);
    useUkiTasks.getState().cancelTask(id);
    await wait;
    expect(ctrl.signal.aborted).toBe(true);
    useUkiTasks.getState().completeTask(id, 'late result');
    expect(useUkiTasks.getState().tasks[0].status).toBe('cancelled');
    useUkiTasks.getState().clearFinished();
    expect(useUkiTasks.getState().tasks).toHaveLength(0);
    releaseTaskController(id);
  });
});
