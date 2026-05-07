// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Typed tool-call dispatcher for UKI. Parses model JSON output against a
 * declared spec, then dispatches to a registered handler with retry +
 * budget + confidence gates.
 */

// DEX v3.8.9 - UKI brain: tool calls

export type ParamSchema =
  | { type: 'string'; minLength?: number; maxLength?: number; enum?: readonly string[] }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'object'; properties: Record<string, ParamSchema>; required?: string[] }
  | { type: 'array'; items: ParamSchema; minItems?: number; maxItems?: number };

export interface ToolSpec {
  name: string;
  description?: string;
  params: Record<string, ParamSchema>;
  required?: string[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ParseResult {
  ok: boolean;
  call?: ToolCall;
  error?: string;
}

/**
 * Parse a model-emitted JSON string into a typed ToolCall. Validates against
 * the provided specs. Returns { ok: false, error } on any mismatch.
 */
export function parseToolCall(raw: string, specs: ToolSpec[]): ParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, error: `invalid json: ${(e as Error).message}` }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'tool call must be an object' };
  const obj = parsed as Record<string, unknown>;
  const name = obj.name;
  if (typeof name !== 'string' || !name) return { ok: false, error: 'tool call missing name' };
  const spec = specs.find((s) => s.name === name);
  if (!spec) return { ok: false, error: `unknown tool: ${name}` };
  const argsRaw = obj.args ?? obj.arguments ?? obj.params ?? {};
  if (!argsRaw || typeof argsRaw !== 'object') return { ok: false, error: 'tool args must be object' };
  const args = argsRaw as Record<string, unknown>;
  for (const req of spec.required ?? []) {
    if (!(req in args)) return { ok: false, error: `missing required param: ${req}` };
  }
  for (const [k, v] of Object.entries(args)) {
    const sub = spec.params[k];
    if (!sub) return { ok: false, error: `unknown param: ${k}` };
    const r = validateValue(v, sub, k);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true, call: { name, args } };
}

function validateValue(v: unknown, schema: ParamSchema, path: string): { ok: boolean; error?: string } {
  switch (schema.type) {
    case 'string': {
      if (typeof v !== 'string') return { ok: false, error: `${path} must be string` };
      if (schema.minLength != null && v.length < schema.minLength) return { ok: false, error: `${path} too short` };
      if (schema.maxLength != null && v.length > schema.maxLength) return { ok: false, error: `${path} too long` };
      if (schema.enum && !schema.enum.includes(v)) return { ok: false, error: `${path} not in enum` };
      return { ok: true };
    }
    case 'number': {
      if (typeof v !== 'number' || Number.isNaN(v)) return { ok: false, error: `${path} must be number` };
      if (schema.integer && !Number.isInteger(v)) return { ok: false, error: `${path} must be integer` };
      if (schema.min != null && v < schema.min) return { ok: false, error: `${path} below min` };
      if (schema.max != null && v > schema.max) return { ok: false, error: `${path} above max` };
      return { ok: true };
    }
    case 'boolean':
      if (typeof v !== 'boolean') return { ok: false, error: `${path} must be boolean` };
      return { ok: true };
    case 'array': {
      if (!Array.isArray(v)) return { ok: false, error: `${path} must be array` };
      if (schema.minItems != null && v.length < schema.minItems) return { ok: false, error: `${path} too few items` };
      if (schema.maxItems != null && v.length > schema.maxItems) return { ok: false, error: `${path} too many items` };
      for (let i = 0; i < v.length; i++) {
        const r = validateValue(v[i], schema.items, `${path}[${i}]`);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: `${path} must be object` };
      const obj = v as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in obj)) return { ok: false, error: `${path}.${req} required` };
      }
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in obj) {
          const r = validateValue(obj[k], sub, `${path}.${k}`);
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }
  }
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export interface DispatchOptions {
  /** Max retry count on transient failure. Default 0. */
  retries?: number;
  /** Confidence floor; calls below this are rejected. */
  confidenceMin?: number;
  /** Confidence of the upstream tool selection (0..1). */
  confidence?: number;
  /** Token-budget hook; called before dispatch. Throws to abort. */
  charge?: (call: ToolCall) => void;
  /** Sleep override for retry backoff (test determinism). */
  sleep?: (ms: number) => Promise<void>;
}

export interface DispatchResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  attempts: number;
}

/**
 * Dispatch a parsed tool call to its handler with retries + gates.
 * Pure orchestration — gates are passed in.
 */
export async function dispatchToolCall(
  call: ToolCall,
  handlers: Record<string, ToolHandler>,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const handler = handlers[call.name];
  if (!handler) return { ok: false, error: `no handler for ${call.name}`, attempts: 0 };
  if (opts.confidenceMin != null) {
    const c = opts.confidence ?? 0;
    if (c < opts.confidenceMin) return { ok: false, error: `confidence ${c} < ${opts.confidenceMin}`, attempts: 0 };
  }
  if (opts.charge) {
    try { opts.charge(call); } catch (e) { return { ok: false, error: `budget: ${(e as Error).message}`, attempts: 0 }; }
  }
  const maxAttempts = Math.max(1, (opts.retries ?? 0) + 1);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await handler(call.args);
      return { ok: true, result, attempts: attempt };
    } catch (e) {
      lastErr = (e as Error).message;
      if (attempt < maxAttempts) await sleep(50 * attempt);
    }
  }
  return { ok: false, error: lastErr, attempts: maxAttempts };
}
