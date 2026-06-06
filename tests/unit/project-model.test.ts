// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { ProjectStore } from '../../src/shared/project/projectModel';

describe('Project-centered model', () => {
  it('creates a project and bundles items (deduped)', () => {
    const s = new ProjectStore(() => 1);
    const p = s.create('Launch');
    s.addItem(p.id, 'note', 'note-1');
    s.addItem(p.id, 'file', '/a.txt');
    s.addItem(p.id, 'note', 'note-1'); // duplicate -> ignored
    expect(s.items(p.id)).toHaveLength(2);
    expect(s.items(p.id, 'note')).toHaveLength(1);
    expect(s.items(p.id, 'file')[0].ref).toBe('/a.txt');
  });

  it('removes items', () => {
    const s = new ProjectStore(() => 1);
    const p = s.create('X');
    s.addItem(p.id, 'task', 't1');
    expect(s.removeItem(p.id, 'task', 't1')).toBe(true);
    expect(s.removeItem(p.id, 'task', 't1')).toBe(false); // already gone
    expect(s.items(p.id)).toHaveLength(0);
  });

  it('handles missing projects gracefully', () => {
    const s = new ProjectStore(() => 1);
    expect(s.addItem('nope', 'note', 'x')).toBe(false);
    expect(s.items('nope')).toEqual([]);
  });

  it('lists and deletes projects', () => {
    const s = new ProjectStore(() => 1);
    s.create('A');
    const b = s.create('B');
    expect(s.list()).toHaveLength(2);
    expect(s.delete(b.id)).toBe(true);
    expect(s.list()).toHaveLength(1);
  });
});
