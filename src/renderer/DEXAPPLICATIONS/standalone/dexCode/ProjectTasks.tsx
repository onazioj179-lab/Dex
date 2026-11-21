// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invokePlatformIpc } from '../../../services/platform/ipc';
import { plainTaskOutput, taskDiagnostics, type TaskDiagnostic } from './taskDiagnostics';
import './ProjectTasks.css';

interface Task {
  id: string;
  label: string;
  command: string;
  category: 'build' | 'test' | 'check';
  available: boolean;
  unavailableReason?: string;
}

interface Run {
  id: number;
  root: string;
  task: Task;
  phase: 'running' | 'succeeded' | 'failed' | 'cancelled';
  code: number | null;
  error: string | null;
  cursor: number;
  reset: boolean;
  truncated?: boolean;
  output: string;
}

interface Reply {
  success: boolean;
  error?: string;
  run?: Run | null;
  tasks?: Task[];
  warnings?: string[];
  path?: string;
}

interface Props {
  root: string | null;
  visible: boolean;
  dirty?: boolean;
  onOpenLocation: (path: string, line: number, column: number) => Promise<void>;
}

const IPC = 'codeTasks:';
const OUTPUT_LIMIT = 256 * 1024;
const statuses = { running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' };

function invoke(operation: string, args: Record<string, unknown> = {}) {
  return invokePlatformIpc<Reply>(IPC + operation, args);
}

export function ProjectTasks({ root, visible, dirty, onOpenLocation }: Props) {
  const [catalog, setCatalog] = useState<{ root: string; tasks: Task[]; error?: string; warnings?: string[] } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const version = useRef(0);
  const mounted = useRef(false);
  const launchPending = useRef(false);
  const diagnosticPending = useRef(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const followOutput = useRef(true);
  const tasks = catalog?.root === root ? catalog.tasks : [];
  const task = tasks.find(item => item.id === selected);
  const loading = !!root && catalog?.root !== root;

  useEffect(() => {
    mounted.current = true;
    const token = ++version.current;
    void invoke('read').then(reply => {
      if (!mounted.current || token !== version.current) return;
      if (reply?.success && reply.run) setRun(reply.run);
      setInitializing(false);
    });
    return () => {
      mounted.current = false;
      version.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!root || !visible) return;
    let active = true;
    void invoke('list', { root }).then(reply => {
      if (!active) return;
      if (!reply?.success || !Array.isArray(reply.tasks)) {
        setCatalog({ root, tasks: [], error: reply?.error ?? 'Native project tasks are unavailable.' });
        return;
      }
      const offered = reply.tasks;
      setCatalog({ root, tasks: offered, warnings: reply.warnings });
      setSelected(previous => offered.some(item => item.id === previous) ? previous
        : (offered.find(item => item.available) ?? offered[0])?.id ?? '');
    });
    return () => { active = false; };
  }, [root, visible, refreshKey]);

  const runId = run?.id;
  const phase = run?.phase;
  const cursor = useRef(0);
  cursor.current = run?.cursor ?? 0;
  useEffect(() => {
    if (runId === undefined || phase !== 'running') return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      const reply = await invoke('read', { id: runId, cursor: cursor.current });
      if (!active) return;
      const next = reply?.run;
      if (!reply?.success || !next || next.id !== runId) {
        setConnectionError(reply?.error ?? 'Waiting to reconnect to the task.');
        timer = window.setTimeout(() => { void poll(); }, 1000);
        return;
      }
      setConnectionError('');
      cursor.current = next.cursor;
      setRun(previous => previous?.id === next.id ? {
        ...next, output: (next.reset ? next.output : previous.output + next.output).slice(-OUTPUT_LIMIT),
      } : previous);
      if (next.phase === 'running') {
        timer = window.setTimeout(() => { void poll(); }, visible ? 300 : 900);
      } else {
        setStopping(false);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [runId, phase, visible]);

  const start = async () => {
    if (!root || !task?.available || launchPending.current || phase === 'running') return;
    launchPending.current = true;
    version.current += 1;
    setError('');
    setConnectionError('');
    setStarting(true);
    const result = await invoke('start', { root, taskId: task.id });
    launchPending.current = false;
    if (!mounted.current) return;
    setStarting(false);
    if (result?.success && result.run) {
      followOutput.current = true;
      setRun(result.run);
    } else {
      setError(result?.error ?? 'The project task could not start.');
    }
  };

  const stop = async () => {
    if (runId === undefined || stopping) return;
    setError('');
    setStopping(true);
    const result = await invoke('cancel', { id: runId });
    if (!mounted.current) return;
    if (!result?.success) {
      setStopping(false);
      setError(result?.error ?? 'The project task could not be cancelled.');
    }
  };

  const openDiagnostic = async (diagnostic: TaskDiagnostic) => {
    if (runId === undefined || diagnosticPending.current) return;
    diagnosticPending.current = true;
    setError('');
    try {
      const result = await invoke('diagnosticPath', { id: runId, path: diagnostic.path });
      if (!mounted.current) return;
      if (!result?.success || !result.path) throw new Error(result?.error ?? 'The diagnostic file is unavailable.');
      await onOpenLocation(result.path, diagnostic.line, diagnostic.column);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'The diagnostic file could not be opened.');
    } finally {
      diagnosticPending.current = false;
    }
  };

  const output = useMemo(() => plainTaskOutput(run?.output ?? ''), [run?.output]);
  const diagnostics = useMemo(() => taskDiagnostics(output), [output]);
  useLayoutEffect(() => {
    const node = outputRef.current;
    if (node && visible && followOutput.current) node.scrollTop = node.scrollHeight;
  }, [output, visible]);

  return <section className="dex-project-tasks" aria-label="Project tasks">
    <div className="dex-project-tasks-toolbar">
      <label>Task
        <select aria-label="Project task" value={task?.id ?? ''} disabled={!tasks.length} onChange={event => setSelected(event.target.value)}>
          {!tasks.length && <option value="">{loading ? 'Loading tasks…' : 'No tasks available'}</option>}
          {tasks.map(item => <option key={item.id} value={item.id}>{item.label}{item.available ? '' : ' (tool unavailable)'}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => { void start(); }} disabled={initializing || starting || !task?.available || phase === 'running'}>
        {starting ? 'Starting…' : 'Run task'}
      </button>
      {phase === 'running' && <button type="button" onClick={() => { void stop(); }} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop task'}</button>}
      <button type="button" disabled={!root} onClick={() => setRefreshKey(value => value + 1)}>Refresh tasks</button>
    </div>
    {!root && <p>Open a project folder to discover build and test tasks.</p>}
    {root && catalog?.root === root && !tasks.length && !catalog.error && <p>No supported build, test, or check tasks were found.</p>}
    {catalog?.root === root && catalog.error && <p role="alert">{catalog.error}</p>}
    {catalog?.root === root && catalog.warnings?.map(warning => <p key={warning}>{warning}</p>)}
    {task && <p className="dex-project-tasks-detail" title={root ?? undefined}>
      <code>{task.command}</code>{task.unavailableReason ? ` · ${task.unavailableReason}` : dirty ? ' · Uses files saved on disk' : ''}
    </p>}
    {(error || connectionError) && <p role="alert">{error || connectionError}</p>}
    {run && <>
      <p role="status" className="dex-project-tasks-detail" title={run.root}>
        <strong>{statuses[run.phase]}</strong> · {run.task.label}{run.code === null ? '' : ` · Exit code ${run.code}`}
      </p>
      {run.error && <p role="alert">{run.error}</p>}
      {run.truncated && <p className="dex-project-tasks-detail">Earlier output was truncated.</p>}
      <pre ref={outputRef} aria-label="Task output" tabIndex={0} onScroll={event => {
        const node = event.currentTarget;
        followOutput.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 20;
      }}>{output}</pre>
      {diagnostics.length > 0 && <details>
        <summary>Diagnostics ({diagnostics.length})</summary>
        <ul>
          {diagnostics.map(item => <li key={JSON.stringify(item)}>
            <button type="button" onClick={() => { void openDiagnostic(item); }}>
              <code>{item.path}:{item.line}:{item.column}</code> {item.severity} {item.message}
            </button>
          </li>)}
        </ul>
      </details>}
    </>}
  </section>;
}
