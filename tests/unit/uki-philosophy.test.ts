// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { stageFor, recurringTopics, updateRelationship, readRelationship, philosophyBlock } from '../../src/renderer/uki/philosophy';
import { coreSystemPrompt } from '../../src/renderer/uki/identity';

beforeEach(() => localStorage.clear());

describe('UKI philosophy', () => {
  it('matures with the real number of conversations', () => {
    expect(stageFor(0)).toBe('meeting');
    expect(stageFor(5)).toBe('acquainted');
    expect(stageFor(50)).toBe('trusted');
  });

  it('finds topics that recur across conversation titles', () => {
    expect(recurringTopics(['Lagos trip budget', 'Budget for March', 'Rust terminal bug', 'terminal colours', 'New Conversation']))
      .toEqual(['budget', 'terminal']);
  });

  it('stores the relationship and puts it in her core prompt', () => {
    updateRelationship(Array.from({ length: 6 }, (_, i) => ({ title: i % 2 ? 'maps routes' : 'maps offline' })));
    expect(readRelationship()).toMatchObject({ conversations: 6, topics: ['maps', 'offline', 'routes'] });
    expect(philosophyBlock()).toContain('6 saved conversations (acquainted)');
    const core = coreSystemPrompt();
    expect(core).toContain('Truth over comfort');
    expect(core).toContain('Topics this user returns to: maps, offline, routes.');
    expect(core).toContain('recall_conversations');
  });
});

describe('UKI character and creator', () => {
  it('thinks like Ada Lovelace without announcing it', async () => {
    const { coreSystemPrompt: core } = await import('../../src/renderer/uki/identity');
    expect(core()).toContain('Ada Lovelace');
    expect(core()).toContain('Do not mention Ada Lovelace');
  });
  it('knows her creator and says so only when asked', async () => {
    const { isCreatorQuestion, creatorAnswer } = await import('../../src/renderer/uki/identity');
    for (const q of ['Who made you?', 'who created DEX', "What's your creator's name? who is your creator", 'who built uki']) expect(isCreatorQuestion(q)).toBe(true);
    for (const q of ['who are you', 'make a note', 'who won the match']) expect(isCreatorQuestion(q)).toBe(false);
    expect(creatorAnswer()).toContain('Onazi Treasure OJ');
  });
});
