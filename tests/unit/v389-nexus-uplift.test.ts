// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for the Nexus uplift helper module: confidence colour, time-scrub
// snapshots, filter chip predicates, 3D orbit camera math, collab cursor LWW.

import { describe, it, expect } from 'vitest';
import {
  confidenceColor, DEFAULT_NEXUS_COLORS,
  snapshotRange, snapshotIndexAt, scrubberToIndex,
  buildNodeFilter, applyNodeFilter, type NexusFilterableNode,
  createOrbitCamera, orbitRotate, orbitZoom, cameraPosition, projectPoint,
  createCursorMap, applyCursorUpdate, pruneStaleCursors, cursorsOnNode,
} from '../../src/shared/nexus/uplift';

// ---------------- Confidence colour ----------------

describe('confidenceColor', () => {
  it('returns high colour for 0.9', () => {
    expect(confidenceColor(0.9)).toBe(DEFAULT_NEXUS_COLORS.high);
  });
  it('returns medium colour for 0.6', () => {
    expect(confidenceColor(0.6)).toBe(DEFAULT_NEXUS_COLORS.medium);
  });
  it('returns low colour for 0.2', () => {
    expect(confidenceColor(0.2)).toBe(DEFAULT_NEXUS_COLORS.low);
  });
  it('returns unknown for undefined', () => {
    expect(confidenceColor(undefined)).toBe(DEFAULT_NEXUS_COLORS.unknown);
  });
  it('returns unknown for NaN', () => {
    expect(confidenceColor(Number.NaN)).toBe(DEFAULT_NEXUS_COLORS.unknown);
  });
  it('clamps out-of-range scores', () => {
    expect(confidenceColor(2)).toBe(DEFAULT_NEXUS_COLORS.high);
    expect(confidenceColor(-1)).toBe(DEFAULT_NEXUS_COLORS.low);
  });
  it('honours custom token palette', () => {
    expect(confidenceColor(0.9, { high: '#0f0', medium: '#ff0', low: '#f00', unknown: '#000' })).toBe('#0f0');
  });
});

// ---------------- Time-scrub ----------------

describe('snapshot timeline', () => {
  const snaps = [
    { takenAt: 1000, data: 'a' },
    { takenAt: 2000, data: 'b' },
    { takenAt: 5000, data: 'c' },
    { takenAt: 9000, data: 'd' },
  ];
  it('snapshotRange handles empty', () => {
    expect(snapshotRange([])).toBeNull();
  });
  it('snapshotRange computes start/end/duration', () => {
    expect(snapshotRange(snaps)).toEqual({ startMs: 1000, endMs: 9000, durationMs: 8000 });
  });
  it('snapshotIndexAt returns -1 for empty', () => {
    expect(snapshotIndexAt([], 100)).toBe(-1);
  });
  it('snapshotIndexAt clamps to first when before range', () => {
    expect(snapshotIndexAt(snaps, 0)).toBe(0);
  });
  it('snapshotIndexAt clamps to last when past range', () => {
    expect(snapshotIndexAt(snaps, 99999)).toBe(3);
  });
  it('snapshotIndexAt finds floor index', () => {
    expect(snapshotIndexAt(snaps, 1500)).toBe(0);
    expect(snapshotIndexAt(snaps, 2000)).toBe(1);
    expect(snapshotIndexAt(snaps, 4500)).toBe(1);
    expect(snapshotIndexAt(snaps, 5000)).toBe(2);
    expect(snapshotIndexAt(snaps, 8500)).toBe(2);
  });
  it('scrubberToIndex maps 0..1 across range', () => {
    expect(scrubberToIndex(snaps, 0)).toBe(0);
    expect(scrubberToIndex(snaps, 1)).toBe(3);
    // 0.5 of 8000 = 4000ms cursor at 5000 == snap c, idx 2
    expect(scrubberToIndex(snaps, 0.5)).toBe(2);
    // 0.4 -> 4200ms cursor between 2000 and 5000, floor idx 1
    expect(scrubberToIndex(snaps, 0.4)).toBe(1);
  });
  it('scrubberToIndex handles single-snapshot range', () => {
    expect(scrubberToIndex([{ takenAt: 100, data: null }], 0.7)).toBe(0);
  });
});

// ---------------- Filter chips ----------------

describe('node filter chips', () => {
  const now = 1_000_000;
  const nodes: NexusFilterableNode[] = [
    { id: 'a', category: 'doc', updatedAt: now - 60_000, confidence: 0.9 },
    { id: 'b', category: 'doc', updatedAt: now - 7_200_000, confidence: 0.5 },
    { id: 'c', category: 'image', updatedAt: now - 86_400_000 * 2, confidence: 0.2 },
    { id: 'd', category: 'image', updatedAt: now - 86_400_000 * 10, confidence: 0.85 },
    { id: 'e' },
  ];
  it('passthrough with no filters', () => {
    expect(applyNodeFilter(nodes, { nowMs: now }).map((n) => n.id)).toEqual(['a','b','c','d','e']);
  });
  it('filters by category', () => {
    expect(applyNodeFilter(nodes, { categories: ['doc'], nowMs: now }).map((n) => n.id))
      .toEqual(['a', 'b']);
  });
  it('filters by confidence band', () => {
    expect(applyNodeFilter(nodes, { confidence: 'high', nowMs: now }).map((n) => n.id))
      .toEqual(['a', 'd']);
  });
  it('drops nodes without confidence when band is set', () => {
    expect(applyNodeFilter(nodes, { confidence: 'low', nowMs: now }).map((n) => n.id))
      .toEqual(['c']);
    expect(applyNodeFilter(nodes, { confidence: 'high', nowMs: now }).find((n) => n.id === 'e'))
      .toBeUndefined();
  });
  it('filters by recency last-hour', () => {
    expect(applyNodeFilter(nodes, { recency: 'last-hour', nowMs: now }).map((n) => n.id))
      .toEqual(['a']);
  });
  it('filters by recency last-day', () => {
    expect(applyNodeFilter(nodes, { recency: 'last-day', nowMs: now }).map((n) => n.id))
      .toEqual(['a', 'b']);
  });
  it('filters by recency older', () => {
    expect(applyNodeFilter(nodes, { recency: 'older', nowMs: now }).map((n) => n.id))
      .toEqual(['d']);
  });
  it('combines multiple filters with AND semantics', () => {
    const out = applyNodeFilter(nodes, { categories: ['image'], confidence: 'high', nowMs: now });
    expect(out.map((n) => n.id)).toEqual(['d']);
  });
  it('any band is identity', () => {
    expect(applyNodeFilter(nodes, { confidence: 'any', recency: 'any', nowMs: now }).length).toBe(5);
  });
  it('buildNodeFilter is reusable', () => {
    const pred = buildNodeFilter({ categories: ['doc'], nowMs: now });
    expect(pred(nodes[0])).toBe(true);
    expect(pred(nodes[2])).toBe(false);
  });
});

// ---------------- Orbit camera ----------------

describe('orbit camera', () => {
  it('creates a default camera', () => {
    const c = createOrbitCamera();
    expect(c.distance).toBe(500);
    expect(c.yaw).toBe(0);
    expect(c.pitch).toBe(0);
  });
  it('orbitRotate clamps pitch', () => {
    const c = orbitRotate(createOrbitCamera(), 0, 999);
    expect(c.pitch).toBeLessThan(Math.PI / 2);
    expect(c.pitch).toBeGreaterThan(0);
    const c2 = orbitRotate(createOrbitCamera(), 0, -999);
    expect(c2.pitch).toBeGreaterThan(-Math.PI / 2);
  });
  it('orbitRotate wraps yaw', () => {
    const c = orbitRotate(createOrbitCamera(), Math.PI * 3, 0);
    expect(c.yaw).toBeLessThan(Math.PI * 2);
  });
  it('orbitZoom clamps to bounds', () => {
    const c = orbitZoom(createOrbitCamera({ distance: 100 }), 0.001);
    expect(c.distance).toBeGreaterThanOrEqual(80);
    const c2 = orbitZoom(createOrbitCamera({ distance: 100 }), 1000);
    expect(c2.distance).toBeLessThanOrEqual(5000);
  });
  it('cameraPosition at yaw=0 pitch=0 sits on +Z axis', () => {
    const p = cameraPosition(createOrbitCamera({ distance: 100 }));
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(100, 6);
  });
  it('cameraPosition at yaw=π/2 sits on +X axis', () => {
    const p = cameraPosition(createOrbitCamera({ distance: 100, yaw: Math.PI / 2 }));
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
  it('projectPoint of target gives depth = distance', () => {
    const cam = createOrbitCamera({ distance: 500 });
    const p = projectPoint(cam, { x: 0, y: 0, z: 0 });
    expect(p.depth).toBeCloseTo(500, 6);
  });
  it('projectPoint preserves x at default orientation', () => {
    const cam = createOrbitCamera({ distance: 500 });
    const p = projectPoint(cam, { x: 50, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(50, 6);
  });
});

// ---------------- Collab cursors ----------------

describe('collab cursor LWW', () => {
  it('applies a fresh cursor', () => {
    const map = createCursorMap();
    expect(applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 100 })).toBe(true);
    expect(map.cursors.get('p1')?.nodeId).toBe('n1');
  });
  it('drops older cursor on replay', () => {
    const map = createCursorMap();
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 200 });
    expect(applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n0', ts: 100 })).toBe(false);
    expect(map.cursors.get('p1')?.nodeId).toBe('n1');
  });
  it('overwrites with newer cursor', () => {
    const map = createCursorMap();
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 100 });
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n2', ts: 200 });
    expect(map.cursors.get('p1')?.nodeId).toBe('n2');
  });
  it('equal ts also drops update (idempotent)', () => {
    const map = createCursorMap();
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 100 });
    expect(applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n2', ts: 100 })).toBe(false);
  });
  it('pruneStaleCursors removes old entries', () => {
    const map = createCursorMap();
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 100 });
    applyCursorUpdate(map, { peerId: 'p2', nodeId: 'n2', ts: 9000 });
    const removed = pruneStaleCursors(map, 1000, 10000);
    expect(removed).toBe(1);
    expect(map.cursors.has('p2')).toBe(true);
    expect(map.cursors.has('p1')).toBe(false);
  });
  it('cursorsOnNode returns matching cursors', () => {
    const map = createCursorMap();
    applyCursorUpdate(map, { peerId: 'p1', nodeId: 'n1', ts: 100 });
    applyCursorUpdate(map, { peerId: 'p2', nodeId: 'n1', ts: 200 });
    applyCursorUpdate(map, { peerId: 'p3', nodeId: 'n2', ts: 300 });
    expect(cursorsOnNode(map, 'n1').map((c) => c.peerId).sort()).toEqual(['p1', 'p2']);
    expect(cursorsOnNode(map, 'n3')).toEqual([]);
  });
});
