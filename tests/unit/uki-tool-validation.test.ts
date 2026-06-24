// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Constrained/typed UKI tool-call validation (DEX_FEATURE_BACKLOG P0). Verifies
// that structurally-invalid tool calls are rejected with a model-facing repair
// instruction, and valid calls pass — so the agent loop never runs a degenerate
// tool on malformed/missing/mis-typed arguments.
import { describe, it, expect } from 'vitest';
import {
  KNOWN_TOOLS,
  CORE_TOOLS,
  isKnownTool,
  validateToolArgs,
  validateToolCall,
  exampleFor,
  renderToolCatalog,
  createToolCatalog,
  type ToolSpec,
} from '../../src/shared/uki/toolValidation';

describe('UKI tool validation', () => {
  it('recognises known tools and rejects hallucinated ones', () => {
    expect(isKnownTool('web_search')).toBe(true);
    expect(isKnownTool('open_app')).toBe(true);
    expect(isKnownTool('delete_everything')).toBe(false);
    expect(isKnownTool('')).toBe(false);
  });

  it('accepts well-formed calls', () => {
    expect(validateToolArgs('web_search', { query: 'james webb latest' })).toEqual({ ok: true });
    expect(validateToolArgs('open_app', { app: 'notes' })).toEqual({ ok: true });
    expect(validateToolArgs('notify', { title: 'Hi', body: 'done' })).toEqual({ ok: true });
    // optional body may be omitted
    expect(validateToolArgs('notify', { title: 'Hi' })).toEqual({ ok: true });
    // no-arg tools
    expect(validateToolArgs('get_context', {})).toEqual({ ok: true });
    expect(validateToolArgs('list_apps', {})).toEqual({ ok: true });
  });

  it('rejects a missing required arg with a repair instruction', () => {
    const r = validateToolArgs('web_search', {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('query');
      expect(r.error).toContain('TOOL web_search {"query"');
    }
  });

  it('rejects an empty-string required arg (no degenerate run)', () => {
    const r = validateToolArgs('open_app', { app: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('must not be empty');
  });

  it('rejects a wrong-typed arg', () => {
    const r = validateToolArgs('open_app', { app: 42 as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('must be a string');
  });

  it('folds a JSON parse error into the repair path', () => {
    const r = validateToolCall('web_search', {}, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('not valid JSON');
      expect(r.error).toContain('TOOL web_search');
    }
  });

  it('validateToolCall passes a good call through (no JSON error)', () => {
    expect(validateToolCall('close_app', { app: 'kanban' }, false)).toEqual({ ok: true });
  });

  it('exposes a correct example for every known tool', () => {
    for (const t of KNOWN_TOOLS) {
      const ex = exampleFor(t);
      // Examples must themselves be valid JSON.
      expect(() => JSON.parse(ex)).not.toThrow();
    }
  });

  it('the core catalog covers exactly the known tools, with valid example JSON', () => {
    const names = CORE_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([...KNOWN_TOOLS].sort());
    for (const t of CORE_TOOLS) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(() => JSON.parse(t.example)).not.toThrow();
    }
  });

  it('renders a prompt catalog line per tool', () => {
    const block = renderToolCatalog();
    for (const t of CORE_TOOLS) {
      expect(block).toContain(`- ${t.name} ${t.argline} --`);
    }
    expect(block.split('\n')).toHaveLength(CORE_TOOLS.length);
  });
});

describe('MCP-style extensible tool catalog', () => {
  const extra: ToolSpec[] = [{
    name: 'kanban_add_card',
    argline: '{"title": string}',
    description: 'add a card to the active Kanban board.',
    args: [{ name: 'title', type: 'string' }],
    example: '{"title": "..."}',
  }];

  it('merges inner-app tools with the core set', () => {
    const cat = createToolCatalog(extra);
    expect(cat.isKnown('web_search')).toBe(true);     // core
    expect(cat.isKnown('kanban_add_card')).toBe(true); // registered
    expect(cat.isKnown('nope')).toBe(false);
    expect(cat.names).toContain('kanban_add_card');
  });

  it('validates registered tools the same way as core tools', () => {
    const cat = createToolCatalog(extra);
    expect(cat.validate('kanban_add_card', { title: 'Ship it' }, false)).toEqual({ ok: true });
    const missing = cat.validate('kanban_add_card', {}, false);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('title');
    const badJson = cat.validate('kanban_add_card', {}, true);
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.error).toContain('not valid JSON');
  });

  it('includes registered tools in the generated prompt', () => {
    const cat = createToolCatalog(extra);
    expect(cat.prompt()).toContain('- kanban_add_card {"title": string} --');
  });

  it('lets a later spec override a core tool by name', () => {
    const override: ToolSpec = {
      name: 'notify', argline: '{"title": string}', description: 'custom notify.',
      args: [{ name: 'title', type: 'string' }], example: '{"title": "..."}',
    };
    const cat = createToolCatalog([override]);
    // overridden: body no longer part of schema; title still required
    expect(cat.validate('notify', { title: 'hi' }, false)).toEqual({ ok: true });
    expect(cat.names.filter((n) => n === 'notify')).toHaveLength(1);
  });
});
