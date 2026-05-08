// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { canApplyPatch, planAssistPatch } from '../../src/shared/creative/nonDestructiveAssist';

describe('non-destructive assist', () => {
  const doc = {
    refs: [
      { id: 'a', kind: 'layer' as const },
      { id: 'b', kind: 'layer' as const, locked: true },
      { id: 'c', kind: 'layer' as const, hidden: true },
    ],
  };

  it('plans only safe changes in scope and warns on locked/hidden', () => {
    const patch = planAssistPatch(doc, {
      prompt: 'clean up this comp',
      scopeIds: ['a', 'b', 'c'],
      mode: 'cleanup',
    });
    expect(patch.changes.map(c => c.targetId)).toEqual(['a']);
    expect(patch.warnings.length).toBe(2);
  });

  it('blocks apply when structure changed', () => {
    const patch = planAssistPatch(doc, {
      prompt: 'retime',
      scopeIds: ['a'],
      mode: 'retime',
    });
    const changed = { refs: [...doc.refs, { id: 'x', kind: 'layer' as const }] };
    expect(canApplyPatch(patch, changed).ok).toBe(false);
  });
});
