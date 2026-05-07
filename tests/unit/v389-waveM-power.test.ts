// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave M - nexus power tests

import { describe, it, expect } from 'vitest';
import {
  SAVED_VIEW_LIMIT,
  applySelection,
  deleteView,
  exportJSON,
  exportSVG,
  listViewNames,
  newSavedViewStore,
  newScrubber,
  newSelection,
  pause,
  play,
  projectToMinimap,
  saveView,
  scrubberProgress,
  seek,
  selectionSize,
  tick,
} from '../../src/shared/nexus/power';

// -------- time scrubber -------------------------------------------

describe('wave M - time scrubber', () => {
  it('throws when end < start', () => {
    expect(() => newScrubber(10, 5)).toThrow();
  });

  it('seek clamps to range', () => {
    const s = newScrubber(0, 100);
    expect(seek(s, -50).cursorMs).toBe(0);
    expect(seek(s, 9999).cursorMs).toBe(100);
    expect(seek(s, 50).cursorMs).toBe(50);
  });

  it('seek snaps to step', () => {
    const s = newScrubber(0, 100, 10);
    expect(seek(s, 23).cursorMs).toBe(20);
    expect(seek(s, 27).cursorMs).toBe(30);
  });

  it('play/pause toggles flag', () => {
    const s = newScrubber(0, 100);
    expect(play(s).playing).toBe(true);
    expect(pause(play(s)).playing).toBe(false);
  });

  it('tick advances by realDt * rate', () => {
    let s = newScrubber(0, 100);
    s = play(s, 2);
    s = tick(s, 10); // +20ms
    expect(s.cursorMs).toBe(20);
  });

  it('tick stops at end and pauses', () => {
    let s = newScrubber(0, 100);
    s = play(s);
    s = seek(s, 95);
    s = tick(s, 100);
    expect(s.cursorMs).toBe(100);
    expect(s.playing).toBe(false);
  });

  it('paused tick is a no-op', () => {
    const s = newScrubber(0, 100);
    expect(tick(s, 50)).toEqual(s);
  });

  it('scrubberProgress is normalised', () => {
    let s = newScrubber(100, 200);
    s = seek(s, 150);
    expect(scrubberProgress(s)).toBeCloseTo(0.5);
  });
});

// -------- multi-select --------------------------------------------

describe('wave M - multi-select', () => {
  it('replace gesture sets single selection', () => {
    const r = applySelection(newSelection(), 'replace', 'a');
    expect([...r.selected]).toEqual(['a']);
    expect(r.anchor).toBe('a');
  });

  it('toggle adds and removes', () => {
    let s = applySelection(newSelection(), 'toggle', 'a');
    s = applySelection(s, 'toggle', 'b');
    expect(selectionSize(s)).toBe(2);
    s = applySelection(s, 'toggle', 'a');
    expect([...s.selected]).toEqual(['b']);
  });

  it('range-extend selects inclusive range', () => {
    let s = applySelection(newSelection(), 'replace', 'a');
    s = applySelection(s, 'range-extend', 'd', ['a', 'b', 'c', 'd', 'e']);
    expect([...s.selected].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.anchor).toBe('a');
  });

  it('range-extend without anchor or unknown id falls back to single', () => {
    const s = applySelection(newSelection(), 'range-extend', 'x', ['y', 'z']);
    expect([...s.selected]).toEqual(['x']);
  });
});

// -------- saved views ---------------------------------------------

describe('wave M - saved views', () => {
  const view = (id: string, name: string): Parameters<typeof saveView>[1] => ({
    id, name, camera: { x: 0, y: 0, z: 1 }, filters: [], createdAt: 0,
  });

  it('save then list returns sorted names', () => {
    let s = newSavedViewStore();
    s = saveView(s, view('1', 'Beta'));
    s = saveView(s, view('2', 'alpha'));
    s = saveView(s, view('3', 'Gamma'));
    expect(listViewNames(s)).toEqual(['alpha', 'Beta', 'Gamma']);
  });

  it('save replaces by id', () => {
    let s = newSavedViewStore();
    s = saveView(s, view('1', 'A'));
    s = saveView(s, view('1', 'A renamed'));
    expect(s.views).toHaveLength(1);
    expect(s.views[0].name).toBe('A renamed');
  });

  it('limit trims oldest', () => {
    let s = newSavedViewStore();
    for (let i = 0; i < SAVED_VIEW_LIMIT + 5; i++) {
      s = saveView(s, view(`v${i}`, `n${i}`));
    }
    expect(s.views).toHaveLength(SAVED_VIEW_LIMIT);
    expect(s.views[0].id).toBe('v5');
  });

  it('deleteView removes by id', () => {
    let s = newSavedViewStore();
    s = saveView(s, view('1', 'A'));
    s = saveView(s, view('2', 'B'));
    s = deleteView(s, '1');
    expect(s.views.map((v) => v.id)).toEqual(['2']);
  });
});

// -------- minimap projection --------------------------------------

describe('wave M - minimap projection', () => {
  const world = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const map = { width: 200, height: 50 };

  it('projects center of world to center of map', () => {
    expect(projectToMinimap({ x: 50, y: 50 }, world, map)).toEqual({ x: 100, y: 25 });
  });

  it('returns null for out-of-bounds points', () => {
    expect(projectToMinimap({ x: -1, y: 50 }, world, map)).toBeNull();
    expect(projectToMinimap({ x: 50, y: 200 }, world, map)).toBeNull();
  });

  it('returns null for degenerate world', () => {
    expect(projectToMinimap({ x: 0, y: 0 }, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, map)).toBeNull();
  });
});

// -------- exporters -----------------------------------------------

describe('wave M - exporters', () => {
  const graph = {
    nodes: [
      { id: 'a', label: 'Hello', x: 10, y: 20, category: 'note' },
      { id: 'b', label: 'World <test>', x: 30, y: 40, category: 'file' },
    ],
    edges: [{ from: 'a', to: 'b', weight: 2 }],
  };

  it('JSON export round-trips', () => {
    const out = exportJSON(graph);
    const parsed = JSON.parse(out);
    expect(parsed.schema).toBe('dex-nexus-v1');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges[0]).toEqual({ from: 'a', to: 'b', weight: 2 });
  });

  it('JSON defaults missing edge weight to 1', () => {
    const out = JSON.parse(exportJSON({ nodes: graph.nodes, edges: [{ from: 'a', to: 'b' }] }));
    expect(out.edges[0].weight).toBe(1);
  });

  it('SVG includes svg root + escaped labels', () => {
    const svg = exportSVG(graph, 100, 100);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('World &lt;test&gt;');
    expect(svg).toContain('viewBox="0 0 100 100"');
  });

  it('SVG drops edges referencing missing nodes', () => {
    const svg = exportSVG({ nodes: graph.nodes, edges: [{ from: 'ghost', to: 'a' }] }, 50, 50);
    expect(svg).not.toContain('<line');
  });
});
