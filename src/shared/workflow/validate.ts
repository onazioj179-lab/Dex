// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workflow graph validation (DEX v6 Track G). Detects structural problems in a
 * node/edge workflow -- cycles (which make execution order undefined), edges
 * pointing at missing nodes, and disconnected nodes. Pure + unit-tested; the
 * Workflows editor surfaces the results so users catch broken graphs before
 * running them.
 */

export interface WorkflowNodeRef {
  id: string;
  name?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowIssue {
  severity: 'error' | 'warning';
  kind: 'cycle' | 'dangling' | 'orphan';
  message: string;
  /** Node ids the issue concerns (empty for edge-only problems). */
  nodeIds: string[];
}

/**
 * Validate a workflow graph. Returns issues most-severe first. An empty graph
 * (or a single node) is considered valid and yields no issues.
 */
export function validateWorkflow(nodes: WorkflowNodeRef[], edges: WorkflowEdge[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (nodes.length === 0) return issues;

  const ids = new Set(nodes.map(n => n.id));

  // Edges that reference a node that no longer exists.
  const dangling = edges.filter(e => !ids.has(e.from) || !ids.has(e.to));
  if (dangling.length > 0) {
    issues.push({
      severity: 'error',
      kind: 'dangling',
      message: `${dangling.length} connection${dangling.length === 1 ? '' : 's'} reference a missing step`,
      nodeIds: [],
    });
  }

  const validEdges = edges.filter(e => ids.has(e.from) && ids.has(e.to));

  // Kahn's algorithm: nodes never reaching in-degree 0 belong to a cycle.
  const inDeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) { inDeg[n.id] = 0; adj[n.id] = []; }
  for (const e of validEdges) { inDeg[e.to]++; adj[e.from].push(e.to); }

  const queue = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of adj[id]) {
      if (--inDeg[next] === 0) queue.push(next);
    }
  }
  const cyclic = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
  if (cyclic.length > 0) {
    issues.push({
      severity: 'error',
      kind: 'cycle',
      message: `${cyclic.length} step${cyclic.length === 1 ? '' : 's'} form a loop (execution order is undefined)`,
      nodeIds: cyclic,
    });
  }

  // Disconnected nodes (only meaningful once there is more than one node).
  if (nodes.length > 1) {
    const connected = new Set<string>();
    for (const e of validEdges) { connected.add(e.from); connected.add(e.to); }
    const orphans = nodes.filter(n => !connected.has(n.id)).map(n => n.id);
    if (orphans.length > 0) {
      issues.push({
        severity: 'warning',
        kind: 'orphan',
        message: `${orphans.length} step${orphans.length === 1 ? ' is' : 's are'} not connected to anything`,
        nodeIds: orphans,
      });
    }
  }

  return issues.sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
}
