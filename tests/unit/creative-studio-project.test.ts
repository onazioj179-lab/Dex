// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { serializeStudioProject, parseStudioProject } from '../../src/renderer/DEXAPPLICATIONS/standalone/creativeStudio/studioProject';

describe('Creative Studio project file', () => {
  const board = { name: 'Retro', payload: { layers: [{ id: 'l', name: 'L', visible: true, opacity: 1, data: 'data:image/png;base64,xx' }], objects: [{ id: 'o' }] } };
  const deck = { slides: [{ id: 's1', blocks: [] }], theme: 'midnight' };

  it('round-trips the board and the deck', () => {
    const p = parseStudioProject(serializeStudioProject(board, deck, new Date('2026-11-18T00:00:00Z')));
    expect(p.board).toEqual(board);
    expect(p.deck).toEqual(deck);
    expect(p.savedAt).toBe('2026-11-18T00:00:00.000Z');
  });

  it('a project may hold only one of the two', () => {
    expect(parseStudioProject(serializeStudioProject(null, deck)).board).toBeNull();
    expect(parseStudioProject(serializeStudioProject(board, null)).deck).toBeNull();
  });

  it('refuses other files with a reason', () => {
    expect(() => parseStudioProject('nope')).toThrow(/not valid JSON/);
    expect(() => parseStudioProject('{"format":"dex-deck"}')).toThrow(/Not a Creative Studio project/);
    expect(() => parseStudioProject('{"format":"dex-studio","version":9}')).toThrow(/version: 9/);
    expect(() => parseStudioProject('{"format":"dex-studio","version":1,"board":{"name":"x","payload":{}},"deck":{}}')).toThrow(/no board and no slides/);
  });
});
