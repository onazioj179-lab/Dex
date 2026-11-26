// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectTasks } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/ProjectTasks';
import { plainTaskOutput, taskDiagnostics } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/taskDiagnostics';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../src/renderer/services/platform/ipc', () => ({ invokePlatformIpc: invoke }));

const root = 'C:/Work/Project';
const task = { id: 'npm:build', label: 'npm build', command: 'npm run build', category: 'build', available: true };
const run = { id: 1, root, task, phase: 'running', code: null, cursor: 0, reset: false, output: '' };

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

describe('DexCode project tasks', () => {
  it('starts the declared task in the open folder and reports compiler output and the actual exit code', async () => {
    const onOpenLocation = vi.fn().mockResolvedValue(undefined);
    const line = '\u001b[31msrc/main.ts(7,4): error TS9000: fixture error\u001b[0m\r\n';
    invoke.mockImplementation(async (channel, args) => {
      if (channel === 'codeTasks:list') return { success: true, tasks: [task] };
      if (channel === 'codeTasks:start') return { success: true, run };
      if (channel === 'codeTasks:read' && args.id) return { success: true, run: {
        ...run, phase: 'failed', code: 2, output: line, cursor: line.length,
      } };
      if (channel === 'codeTasks:diagnosticPath') return { success: true, path: root + '/src/main.ts' };
      return { success: true, run: null };
    });
    render(<ProjectTasks root={root} visible onOpenLocation={onOpenLocation} />);
    const button = screen.getByRole('button', { name: 'Run task' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByText(/Exit code 2/)).toBeTruthy();
    expect(screen.getByLabelText('Task output').textContent).toContain('fixture error');
    fireEvent.click(screen.getByText('Diagnostics (1)'));
    fireEvent.click(screen.getByRole('button', { name: /src\/main.ts:7:4/ }));
    await waitFor(() => expect(onOpenLocation).toHaveBeenCalledWith(root + '/src/main.ts', 7, 4));
    expect(invoke).toHaveBeenCalledWith('codeTasks:start', { root, taskId: 'npm:build' });
    expect(invoke).toHaveBeenCalledWith('codeTasks:diagnosticPath', { id: 1, path: 'src/main.ts' });
  });

  it('keeps a restored task active until the native backend confirms cancellation', async () => {
    let cancelled = false;
    invoke.mockImplementation(async (channel, args) => {
      if (channel === 'codeTasks:list') return { success: true, tasks: [task] };
      if (channel === 'codeTasks:cancel') { cancelled = true; return { success: true }; }
      if (channel === 'codeTasks:read' && args.id && cancelled) {
        return { success: true, run: { ...run, phase: 'cancelled', code: 130, output: 'final output', cursor: 12 } };
      }
      if (channel === 'codeTasks:read') return { success: true, run };
      return null;
    });
    render(<ProjectTasks root={root} visible onOpenLocation={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop task' }));
    expect(invoke).toHaveBeenCalledWith('codeTasks:cancel', { id: 1 });
    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(screen.getByLabelText('Task output').textContent).toBe('final output');
  });

  it('shows unavailable tools without sending a start command', async () => {
    invoke.mockImplementation(async channel => channel === 'codeTasks:list'
      ? { success: true, tasks: [{ ...task, available: false, unavailableReason: 'npm missing' }] }
      : { success: true, run: null });
    render(<ProjectTasks root={root} visible onOpenLocation={vi.fn()} />);
    expect(await screen.findByText(/npm missing/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Run task' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(invoke.mock.calls.some(([name]) => name === 'codeTasks:start')).toBe(false);
  });

  it('extracts Windows and Rust diagnostic locations while keeping plain build output as text', () => {
    const input = '\x1b[31mC:\\Work\\file.ts(2,3): error TS3: details\x1b[0m\r\nsrc/lib.rs:10:4: warning: details\r\nplain log';
    const output = plainTaskOutput(input);
    const diagnostics = taskDiagnostics(output);
    expect(output).not.toContain('\x1b');
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ path: 'C:\\Work\\file.ts', line: 2, column: 3, severity: 'error' });
    expect(diagnostics[1]).toMatchObject({ path: 'src/lib.rs', line: 10, column: 4, severity: 'warning' });
  });
});
