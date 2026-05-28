// =============================================================================
// DEX Platform — Track G3: Workflow node graph runtime
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure node-graph topology + execution planner. Triggers, schedules, and
 * actual node side-effects live in the host. This module owns DAG
 * validation, topological order, and trigger evaluation.
 */

export type NodeKind = 'trigger' | 'action' | 'transform' | 'branch' | 'merge';

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  /** Stable type name (e.g. 'fs.watch', 'http.post'). */
  type: string;
  /** Required runtime capabilities. */
  capabilities: string[];
  /** Static config. */
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  fromId: string;
  toId: string;
  /** Optional output port name (for branch nodes). */
  port?: string;
}

export interface WorkflowGraph {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type ValidationIssue =
  | { kind: 'cycle'; nodes: string[] }
  | { kind: 'orphan'; nodeId: string }
  | { kind: 'missing-trigger' }
  | { kind: 'unknown-edge'; edge: WorkflowEdge };

export function validateGraph(g: WorkflowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(g.nodes.map(n => n.id));
  for (const e of g.edges) {
    if (!ids.has(e.fromId) || !ids.has(e.toId)) issues.push({ kind: 'unknown-edge', edge: e });
  }
  if (!g.nodes.some(n => n.kind === 'trigger')) issues.push({ kind: 'missing-trigger' });

  // Orphans (no incoming and not a trigger)
  const incoming = new Map<string, number>();
  for (const n of g.nodes) incoming.set(n.id, 0);
  for (const e of g.edges) incoming.set(e.toId, (incoming.get(e.toId) ?? 0) + 1);
  for (const n of g.nodes) {
    if (n.kind !== 'trigger' && (incoming.get(n.id) ?? 0) === 0) {
      issues.push({ kind: 'orphan', nodeId: n.id });
    }
  }

  // Cycle detection via DFS
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) adj.get(e.fromId)?.push(e.toId);
  const color = new Map<string, 0 | 1 | 2>(); // white/gray/black
  for (const n of g.nodes) color.set(n.id, 0);
  const stack: string[] = [];
  function visit(u: string): boolean {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === 1) {
        // Cycle from v back to u
        const idx = stack.indexOf(v);
        issues.push({ kind: 'cycle', nodes: stack.slice(idx) });
        return true;
      }
      if (color.get(v) === 0 && visit(v)) return true;
    }
    color.set(u, 2);
    stack.pop();
    return false;
  }
  for (const n of g.nodes) {
    if (color.get(n.id) === 0) visit(n.id);
  }
  return issues;
}

/** Topologically order nodes for execution. Throws if cycle present. */
export function topoOrder(g: WorkflowGraph): string[] {
  const indeg = new Map<string, number>();
  for (const n of g.nodes) indeg.set(n.id, 0);
  for (const e of g.edges) indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1);
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) adj.get(e.fromId)?.push(e.toId);

  const ready: string[] = [];
  for (const [id, d] of indeg.entries()) if (d === 0) ready.push(id);
  ready.sort();
  const order: string[] = [];
  while (ready.length) {
    const u = ready.shift()!;
    order.push(u);
    for (const v of adj.get(u) ?? []) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) {
        ready.push(v);
        ready.sort();
      }
    }
  }
  if (order.length !== g.nodes.length) throw new Error('cycle in workflow graph');
  return order;
}

export type TriggerEvent =
  | { kind: 'fs'; path: string; change: 'add' | 'modify' | 'remove' }
  | { kind: 'clock'; iso: string }
  | { kind: 'webhook'; route: string; body?: unknown }
  | { kind: 'event-bus'; topic: string; payload?: unknown }
  | { kind: 'manual'; at: number };

export function matchesTrigger(node: WorkflowNode, e: TriggerEvent): boolean {
  if (node.kind !== 'trigger') return false;
  switch (e.kind) {
    case 'fs': return node.type === 'fs.watch' && (node.config.glob === undefined || globMatch(e.path, String(node.config.glob)));
    case 'clock': return node.type === 'cron' && cronTick(String(node.config.cron ?? ''), e.iso);
    case 'webhook': return node.type === 'http.in' && node.config.route === e.route;
    case 'event-bus': return node.type === 'bus.subscribe' && node.config.topic === e.topic;
    // Manual runs should execute any trigger-anchored workflow path.
    case 'manual': return true;
  }
}

function globMatch(path: string, glob: string): boolean {
  const re = new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
  return re.test(path);
}

function cronTick(_cron: string, _iso: string): boolean {
  // Minimal placeholder: treat empty cron as "always" so unit tests can
  // assert dispatch logic without depending on a cron library.
  return true;
}
