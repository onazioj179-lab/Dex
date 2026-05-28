// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { SharedTimeline, AssetGraph } from '../../src/shared/phase5/creativeFoundations';

describe('Phase 5 - SharedTimeline', () => {
  it('adds tracks and clips and computes duration', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v1', kind: 'video' });
    t.addClip({ id: 'c1', trackId: 'v1', startMs: 0, durationMs: 1000 });
    t.addClip({ id: 'c2', trackId: 'v1', startMs: 1000, durationMs: 500 });
    expect(t.duration()).toBe(1500);
    expect(t.listClips('v1').length).toBe(2);
  });

  it('rejects overlapping clips on same track', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v1', kind: 'video' });
    t.addClip({ id: 'c1', trackId: 'v1', startMs: 0, durationMs: 1000 });
    expect(() => t.addClip({ id: 'c2', trackId: 'v1', startMs: 500, durationMs: 1000 })).toThrow();
  });

  it('allows overlap across different tracks', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v', kind: 'video' });
    t.addTrack({ id: 'a', kind: 'audio' });
    t.addClip({ id: 'c1', trackId: 'v', startMs: 0, durationMs: 1000 });
    expect(() => t.addClip({ id: 'c2', trackId: 'a', startMs: 0, durationMs: 1000 })).not.toThrow();
  });

  it('removeTrack clears its clips', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v', kind: 'video' });
    t.addClip({ id: 'c1', trackId: 'v', startMs: 0, durationMs: 1000 });
    t.removeTrack('v');
    expect(t.listClips().length).toBe(0);
  });

  it('scrub clamps and clipsAt finds active clips', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v', kind: 'video' });
    t.addClip({ id: 'c1', trackId: 'v', startMs: 0, durationMs: 1000 });
    expect(t.scrub(-10)).toBe(0);
    expect(t.scrub(99999)).toBe(1000);
    expect(t.clipsAt(500).map((c) => c.id)).toEqual(['c1']);
    expect(t.clipsAt(1000).length).toBe(0);
  });

  it('rejects bad clip args', () => {
    const t = new SharedTimeline();
    t.addTrack({ id: 'v', kind: 'video' });
    expect(() => t.addClip({ id: 'c1', trackId: 'v', startMs: -1, durationMs: 100 })).toThrow();
    expect(() => t.addClip({ id: 'c1', trackId: 'v', startMs: 0, durationMs: 0 })).toThrow();
    expect(() => t.addClip({ id: 'c1', trackId: 'missing', startMs: 0, durationMs: 100 })).toThrow();
  });
});

describe('Phase 5 - AssetGraph', () => {
  it('adds assets and links and computes deps/dependents', () => {
    const g = new AssetGraph();
    g.addAsset({ id: 'p', kind: 'project', bytes: 0 });
    g.addAsset({ id: 'i', kind: 'image', bytes: 1000 });
    g.link({ from: 'p', to: 'i', kind: 'embeds' });
    expect(g.dependencies('p').map((e) => e.to)).toEqual(['i']);
    expect(g.dependents('i').map((e) => e.from)).toEqual(['p']);
    expect(g.totalBytes()).toBe(1000);
  });

  it('rejects duplicates, self-links, unknown nodes', () => {
    const g = new AssetGraph();
    g.addAsset({ id: 'a', kind: 'image', bytes: 0 });
    expect(() => g.addAsset({ id: 'a', kind: 'image', bytes: 0 })).toThrow();
    expect(() => g.link({ from: 'a', to: 'a', kind: 'embeds' })).toThrow();
    expect(() => g.link({ from: 'a', to: 'missing', kind: 'embeds' })).toThrow();
  });

  it('removeAsset cleans up edges', () => {
    const g = new AssetGraph();
    g.addAsset({ id: 'a', kind: 'image', bytes: 0 });
    g.addAsset({ id: 'b', kind: 'image', bytes: 0 });
    g.link({ from: 'a', to: 'b', kind: 'references' });
    g.removeAsset('b');
    expect(g.dependencies('a').length).toBe(0);
  });

  it('orphans returns isolated nodes', () => {
    const g = new AssetGraph();
    g.addAsset({ id: 'a', kind: 'image', bytes: 0 });
    g.addAsset({ id: 'b', kind: 'image', bytes: 0 });
    g.addAsset({ id: 'c', kind: 'image', bytes: 0 });
    g.link({ from: 'a', to: 'b', kind: 'references' });
    expect(g.orphans().map((n) => n.id)).toEqual(['c']);
  });
});
