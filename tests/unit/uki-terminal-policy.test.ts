// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { decideToolCall } from '../../src/shared/uki/assistantPolicy';
import { createToolCatalog, isKnownTool } from '../../src/shared/uki/toolValidation';
import { commandConfirmReason } from '../../src/renderer/uki/terminalTools';

describe('UKI terminal tools policy', () => {
  it('run_command is denied without the shell grant: UKI cannot give it to itself', () => {
    const d = decideToolCall({ tool: 'run_command', mode: 'balanced' as never, granted: new Set(['file-read', 'file-write', 'network']) });
    expect(d.kind).toBe('deny');
  });

  it('with the shell grant it still always asks the user', () => {
    const d = decideToolCall({ tool: 'run_command', mode: 'balanced' as never, granted: new Set(['shell']) });
    expect(d.kind).toBe('confirm');
  });

  it('status is read-only; cancel asks first', () => {
    expect(decideToolCall({ tool: 'command_status', mode: 'balanced' as never, granted: new Set() }).kind).toBe('allow');
    expect(decideToolCall({ tool: 'cancel_command', mode: 'balanced' as never, granted: new Set() }).kind).toBe('confirm');
  });

  it('the tools are in the catalog with valid JSON examples', () => {
    for (const t of ['run_command', 'command_status', 'cancel_command']) expect(isKnownTool(t)).toBe(true);
    const catalog = createToolCatalog([]);
    for (const spec of catalog.specs) expect(() => JSON.parse(spec.example), spec.name).not.toThrow();
  });

  it('the prompt says where and what kind of command it is', () => {
    expect(commandConfirmReason('external', 'C:\\proj')).toBe('runs a command on this PC in C:\\proj (uses the network)');
  });
});
