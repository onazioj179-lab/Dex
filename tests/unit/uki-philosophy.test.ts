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
