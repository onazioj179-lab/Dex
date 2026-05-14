// =============================================================================
// DEX Platform — Phase 2: Workflow runner
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Executes a validated WorkflowGraph by walking the topological order
 * and invoking caller-provided node handlers. The runner is pure logic;
 * I/O happens inside the handler functions.
 */

import { topoOrder, validateGraph, type WorkflowGraph, type WorkflowNode, type TriggerEvent, matchesTrigger } from './workflowGraph';



export type NodeHandler = (
  node: WorkflowNode,
  inputs: Record<string, unknown>,
  ctx: RunContext,
) => Promise<Record<string, unknown> | void>;

export interface RunContext {
  workflowId: string;
  trigger: TriggerEvent;
  startedAtMs: number;
  /** Caller-supplied logger. */
  log: (level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) => void;
  /** Caller-supplied capability check. */
  hasCapability: (capability: string) => boolean;
}

export interface RunResult {
  ok: boolean;
  /** Per-node outputs keyed by node id. */
  outputs: Record<string, Record<string, unknown> | undefined>;
  /** First failed node id, if any. */
  failedNodeId?: string;
  error?: string;
  /** Skipped nodes due to missing capabilities. */
  skipped: string[];
}

export interface RunnerOptions {
  /** Per-node timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Time supplier. */
  now?: () => number;
}

export async function runWorkflow(
  graph: WorkflowGraph,
  trigger: TriggerEvent,
  handlers: Record<string, NodeHandler>,
  ctxBase: Pick<RunContext, 'log' | 'hasCapability'>,
  opts: RunnerOptions = {},
): Promise<RunResult> {
  const issues = validateGraph(graph);
  if (issues.length > 0) {
    return { ok: false, outputs: {}, skipped: [], error: `graph-invalid:${issues[0]!.kind}` };
  }
  const order = topoOrder(graph);
  const now = opts.now ?? (() => Date.now());
  const startedAtMs = now();
  const ctx: RunContext = { workflowId: graph.id, trigger, startedAtMs, ...ctxBase };

  const outputs: Record<string, Record<string, unknown> | undefined> = {};
  const skipped: string[] = [];
  const incomingMap = buildIncoming(graph);

  for (const id of order) {
    const node = graph.nodes.find(n => n.id === id)!;

    // For triggers, verify match. Otherwise no-op pass-through.
    if (node.kind === 'trigger') {
      if (!matchesTrigger(node, trigger)) {
        // No matching trigger means downstream cannot run — short-circuit.
        return { ok: true, outputs, skipped: order.filter(x => x !== id) };
      }
      outputs[id] = (trigger as unknown as Record<string, unknown>);
      continue;
    }

    // Capability gate
    if (node.capabilities.some(c => !ctx.hasCapability(c))) {
      skipped.push(id);
      ctx.log('warn', `node ${id} skipped: missing capability`);
      continue;
    }

    // Collect inputs from upstream outputs.
    const inputs: Record<string, unknown> = {};
    for (const upId of incomingMap.get(id) ?? []) {
      const o = outputs[upId];
      if (o) Object.assign(inputs, o);
    }

    const handler = handlers[node.type];
    if (!handler) {
      return { ok: false, outputs, skipped, failedNodeId: id, error: `no-handler:${node.type}` };
    }

    try {
      const out = await withTimeout(handler(node, inputs, ctx), opts.timeoutMs ?? 30_000);
      outputs[id] = (out ?? {}) as Record<string, unknown>;
    } catch (e) {
      return {
        ok: false, outputs, skipped, failedNodeId: id,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { ok: true, outputs, skipped };
}

function buildIncoming(g: WorkflowGraph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const n of g.nodes) map.set(n.id, []);
  for (const e of g.edges) map.get(e.toId)?.push(e.fromId);
  return map;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}



export type { WorkflowGraph, TriggerEvent } from './workflowGraph';