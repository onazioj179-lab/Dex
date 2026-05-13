// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 10 - Reliability and long-term stability primitives.
 *
 * ChaosRegistry: opt-in deterministic fault injection (test/dev only).
 * CorruptionScanner: schema-driven structural validation with repair report.
 */

export interface ChaosFault {
  readonly id: string;
  readonly probability: number;
  readonly enabled: boolean;
  readonly fail: () => Error;
}

export interface ChaosRegistryOptions {
  readonly random?: () => number;
}

export class ChaosRegistry {
  private readonly faults = new Map<string, ChaosFault>();
  private readonly random: () => number;

  constructor(opts: ChaosRegistryOptions = {}) {
    this.random = opts.random ?? Math.random;
  }

  register(fault: ChaosFault): void {
    if (fault.probability < 0 || fault.probability > 1) {
      throw new Error('probability must be in [0,1]');
    }
    if (this.faults.has(fault.id)) throw new Error(`fault ${fault.id} exists`);
    this.faults.set(fault.id, fault);
  }

  unregister(id: string): boolean { return this.faults.delete(id); }

  /** If the fault rolls a hit, throw. Otherwise return false. */
  maybeTrigger(id: string): false {
    const f = this.faults.get(id);
    if (!f || !f.enabled) return false;
    if (this.random() < f.probability) {
      throw f.fail();
    }
    return false;
  }

  setEnabled(id: string, enabled: boolean): void {
    const f = this.faults.get(id);
    if (!f) throw new Error(`unknown fault ${id}`);
    this.faults.set(id, { ...f, enabled });
  }

  list(): ChaosFault[] { return Array.from(this.faults.values()); }
  size(): number { return this.faults.size; }
}

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface FieldSpec {
  readonly type: FieldType;
  readonly required: boolean;
  readonly path: string;
}

export interface CorruptionIssue {
  readonly code: 'missing-field' | 'wrong-type' | 'cycle' | 'invalid-range';
  readonly path: string;
  readonly detail: string;
}

export interface CorruptionReport {
  readonly issues: CorruptionIssue[];
  readonly healthy: boolean;
}

export function scanForCorruption(value: unknown, schema: readonly FieldSpec[]): CorruptionReport {
  const issues: CorruptionIssue[] = [];
  if (hasCycle(value)) {
    issues.push({ code: 'cycle', path: '$', detail: 'object graph contains a cycle' });
  }
  for (const spec of schema) {
    const cur = readPath(value, spec.path);
    if (cur === undefined) {
      if (spec.required) issues.push({ code: 'missing-field', path: spec.path, detail: 'required field missing' });
      continue;
    }
    if (!matchesType(cur, spec.type)) {
      issues.push({ code: 'wrong-type', path: spec.path, detail: `expected ${spec.type}, got ${actualType(cur)}` });
    }
  }
  return { issues, healthy: issues.length === 0 };
}

function readPath(root: unknown, path: string): unknown {
  if (path === '$' || path === '') return root;
  const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function matchesType(v: unknown, t: FieldType): boolean {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
}

function actualType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function hasCycle(root: unknown): boolean {
  const seen = new WeakSet<object>();
  function walk(v: unknown): boolean {
    if (!v || typeof v !== 'object') return false;
    if (seen.has(v as object)) return true;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (const item of v) if (walk(item)) return true;
    } else {
      for (const k of Object.keys(v as object)) {
        if (walk((v as Record<string, unknown>)[k])) return true;
      }
    }
    return false;
  }
  return walk(root);
}
