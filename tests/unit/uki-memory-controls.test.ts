// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTurn, readTurns, clearTurns, deleteTurn, exportUkiMemory, clearAllUkiMemory } from '../../src/renderer/uki/memory';
import { useUkiStore } from '../../src/renderer/store/ukiStore';

const turn = (id: string) => ({ id, userText: 'q ' + id, response: 'a', intent: 'chat', timestamp: Date.now(), success: true });

describe('UKI memory controls', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearTurns();
    useUkiStore.setState({ conversationHistory: [], thoughtTrail: [] });
  });

  it('forgets a single exchange', async () => {
    const a = await recordTurn('first', 'one');
    await recordTurn('second', 'two');
    await deleteTurn(a.id);
    expect((await readTurns()).map((t) => t.user)).toEqual(['second']);
  });

  it('exports what is remembered as plain JSON', async () => {
    await recordTurn('remember this', 'ok');
    const data = await exportUkiMemory();
    expect(data.turns.map((t) => t.user)).toEqual(['remember this']);
    expect(JSON.parse(JSON.stringify(data)).exportedAt).toMatch(/^\d{4}-/);
  });

  it('Clear All clears turns AND the persisted transcript (it used to leave both)', async () => {
    await recordTurn('secret', 'ok');
    useUkiStore.getState().addConversationTurn(turn('t1') as never);
    expect(localStorage.getItem('dex:uki:history')).not.toBeNull();
    const cleared = await clearAllUkiMemory();
    expect(cleared).toEqual(expect.arrayContaining(['recent conversations', 'transcript']));
    expect(await readTurns()).toEqual([]);
    expect(useUkiStore.getState().conversationHistory).toEqual([]);
    expect(localStorage.getItem('dex:uki:history')).toBeNull();
  });

  it('does not persist the transcript while Memory Recording is off', () => {
    localStorage.setItem('dex-settings', JSON.stringify({ ukiMemoryEnabled: false }));
    useUkiStore.getState().addConversationTurn(turn('t2') as never);
    expect(useUkiStore.getState().conversationHistory).toHaveLength(1); // still visible this session
    expect(localStorage.getItem('dex:uki:history')).toBeNull();
  });
});
