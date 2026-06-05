// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  NEXUS_MEMORY_VIEWS,
  NEXUS_STRUCTURE_VIEWS,
  NEXUS_DEFAULT_VIEW_ID,
  orderedNexusViews,
  getNexusView,
  isMemoryView,
} from '../../src/shared/nexus/memoryViews';

describe('Nexus memory-first views', () => {
  it('exposes the eight memory views the roadmap names', () => {
    expect(NEXUS_MEMORY_VIEWS.map((v) => v.id)).toEqual([
      'projects', 'ideas', 'people', 'files', 'assets', 'sessions', 'research', 'conversations',
    ]);
  });

  it('keeps the graph as a secondary (structure) view, not primary', () => {
    expect(NEXUS_STRUCTURE_VIEWS.some((v) => v.id === 'graph')).toBe(true);
    expect(isMemoryView('graph')).toBe(false);
    expect(isMemoryView('projects')).toBe(true);
  });

  it('opens on a memory view by default', () => {
    expect(NEXUS_DEFAULT_VIEW_ID).toBe('projects');
    expect(isMemoryView(NEXUS_DEFAULT_VIEW_ID)).toBe(true);
  });

  it('orders memory views before structure views', () => {
    const ordered = orderedNexusViews();
    const firstStructureIdx = ordered.findIndex((v) => v.tier === 'structure');
    const lastMemoryIdx = ordered.map((v) => v.tier).lastIndexOf('memory');
    expect(lastMemoryIdx).toBeLessThan(firstStructureIdx);
  });

  it('looks views up case-insensitively', () => {
    expect(getNexusView('PROJECTS')?.label).toBe('Projects');
    expect(getNexusView('nope')).toBeUndefined();
  });
});
