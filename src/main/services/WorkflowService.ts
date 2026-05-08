// =============================================================================
// DEX Platform — Phase 3 host: Workflow runner
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Wraps runWorkflow with a host-side handler registry plus IPC.
 *
 *   workflow:run    (graph, trigger, capsHeld) -> RunResult
 *   workflow:list-handlers                     -> string[]
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import {
  runWorkflow,
  type NodeHandler,
  type RunResult,
} from '../../shared/apps/workflows/runner';
import type {
  TriggerEvent,
  WorkflowGraph,
} from '../../shared/apps/workflows/workflowGraph';

const handlers: Record<string, NodeHandler> = {};

export function registerHandler(type: string, fn: NodeHandler): void {
  handlers[type] = fn;
}

export function listHandlers(): string[] {
  return Object.keys(handlers).sort();
}

export async function run(graph: WorkflowGraph, trigger: TriggerEvent, capsHeld: string[]): Promise<RunResult> {
  return runWorkflow(graph, trigger, handlers, {
    log: (level, msg, extra) => {
      const fn = level === 'error' ? log.error : level === 'warn' ? log.warn : log.info;
      fn('[Workflow]', msg, extra ?? '');
    },
    hasCapability: (c) => capsHeld.includes(c),
  });
}

/** Built-in handlers registered at startup. */
export function registerBuiltinHandlers(): void {
  registerHandler('log', async (n, inputs) => {
    log.info('[Workflow.log]', n.id, inputs);
    return inputs;
  });
  registerHandler('http.post', async (n, inputs) => {
    const url = String(n.config.url ?? '');
    const body = JSON.stringify(inputs);
    try {
      const r = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
      return { status: r.status, ok: r.ok };
    } catch (e) {
      return { status: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  registerHandler('delay', async (n) => {
    const ms = Number(n.config.ms ?? 0);
    await new Promise(res => setTimeout(res, ms));
    return { delayedMs: ms };
  });
}

export function registerWorkflowIpc(): void {
  registerBuiltinHandlers();
  ipcMain.handle('workflow:run', (_e, graph: WorkflowGraph, trigger: TriggerEvent, caps: string[]) => run(graph, trigger, caps ?? []));
  ipcMain.handle('workflow:list-handlers', () => listHandlers());
}
