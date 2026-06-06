// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { WindowLinks } from '../../src/shared/workspace/windowLinks';

describe('Linked Window System — link graph', () => {
  it('links transitively into one group', () => {
    const w = new WindowLinks();
    w.link('canvas', 'notes');
    w.link('notes', 'tasks');
    expect(w.groupOf('canvas')).toEqual(['canvas', 'notes', 'tasks']);
    expect(w.areLinked('canvas', 'notes')).toBe(true);
    expect(w.areLinked('canvas', 'tasks')).toBe(false); // transitive, not direct
  });

  it('unlink splits a group', () => {
    const w = new WindowLinks();
    w.link('a', 'b');
    w.link('b', 'c');
    w.unlink('b', 'c');
    expect(w.groupOf('a')).toEqual(['a', 'b']);
    expect(w.groupOf('c')).toEqual(['c']);
  });

  it('groups() returns only multi-window clusters', () => {
    const w = new WindowLinks();
    w.link('code', 'terminal');
    w.link('files', 'project');
    w.link('lonely', 'lonely'); // self-link ignored
    const groups = w.groups().map((g) => g.join('+')).sort();
    expect(groups).toEqual(['code+terminal', 'files+project']);
  });

  it('removing a window detaches it from its group', () => {
    const w = new WindowLinks();
    w.link('a', 'b');
    w.link('b', 'c');
    w.remove('b');
    expect(w.areLinked('a', 'b')).toBe(false);
    expect(w.groupOf('a')).toEqual(['a']);
    expect(w.groupOf('c')).toEqual(['c']);
  });

  it('an unlinked window is its own singleton group', () => {
    const w = new WindowLinks();
    expect(w.groupOf('solo')).toEqual(['solo']);
    expect(w.groups()).toEqual([]);
  });
});
