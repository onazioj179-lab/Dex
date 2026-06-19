// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies workflow graph validation (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { validateWorkflow, WorkflowNodeRef, WorkflowEdge } from '../../src/shared/workflow/validate';

const nodes = (...ids: string[]): WorkflowNodeRef[] => ids.map(id => ({ id }));
const edge = (from: string, to: string): WorkflowEdge => ({ from, to });

describe('validateWorkflow', () => {
  it('treats an empty or single-node graph as valid', () => {
    expect(validateWorkflow([], [])).toEqual([]);
    expect(validateWorkflow(nodes('a'), [])).toEqual([]);
  });

  it('accepts a valid linear chain', () => {
    const issues = validateWorkflow(nodes('a', 'b', 'c'), [edge('a', 'b'), edge('b', 'c')]);
    expect(issues).toEqual([]);
  });

  it('detects a cycle', () => {
    const issues = validateWorkflow(nodes('a', 'b', 'c'), [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);
    const cycle = issues.find(i => i.kind === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle!.severity).toBe('error');
    expect([...cycle!.nodeIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('flags edges that reference a missing node', () => {
    const issues = validateWorkflow(nodes('a', 'b'), [edge('a', 'ghost')]);
    expect(issues.some(i => i.kind === 'dangling' && i.severity === 'error')).toBe(true);
  });

  it('warns about disconnected nodes', () => {
    const issues = validateWorkflow(nodes('a', 'b', 'lonely'), [edge('a', 'b')]);
    const orphan = issues.find(i => i.kind === 'orphan');
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe('warning');
    expect(orphan!.nodeIds).toEqual(['lonely']);
  });

  it('orders errors before warnings', () => {
    // A cycle (error) plus a disconnected node (warning).
    const issues = validateWorkflow(
      nodes('a', 'b', 'lonely'),
      [edge('a', 'b'), edge('b', 'a')],
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues[0].severity).toBe('error');
    expect(issues[issues.length - 1].severity).toBe('warning');
  });
});
