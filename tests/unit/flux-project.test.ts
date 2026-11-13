// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseFluxProject } from '../../src/renderer/DEXAPPLICATIONS/flux/fluxProject';

const layer = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, type: 'text', visible: true, locked: false, solo: false,
  startTime: 0, duration: 300, inPoint: 0, outPoint: 300,
  transform: { x: 0, y: 0 }, behaviors: [], filters: [], content: 'Hello', ...extra,
});

// The shape Save Project writes.
const saved = (over: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, appId: 'flux', layers: [layer('a'), layer('b', { type: 'shape', content: undefined })],
  settings: { fps: 30, duration: 300, canvasSize: { width: 1920, height: 1080 }, is3DMode: false },
  timestamp: 1, ...over,
});

describe('FLUX project files', () => {
  it('opens what Save Project writes', () => {
    const { layers, settings, warnings } = parseFluxProject<{ id: string }>(saved());
    expect(layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(settings).toEqual({ fps: 30, duration: 300, canvasSize: { width: 1920, height: 1080 }, is3DMode: false });
    expect(warnings).toEqual([]);
  });

  it('refuses other files with a reason', () => {
    expect(() => parseFluxProject('{oops')).toThrow('not valid JSON');
    expect(() => parseFluxProject('{"appId":"prism","version":1,"layers":[]}')).toThrow('Not a FLUX project');
    expect(() => parseFluxProject(saved({ version: 3 }))).toThrow('Unsupported project version: 3');
    expect(() => parseFluxProject(saved({ layers: 'x' }))).toThrow('no layer list');
  });

  it('keeps the current settings when the file has unusable ones', () => {
    const { settings, warnings } = parseFluxProject(saved({ settings: { fps: 0, duration: -5, canvasSize: { width: 'big', height: 2 }, is3DMode: 'yes' } }));
    expect(settings).toEqual({});
    expect(warnings).toHaveLength(3);
  });

  it('leaves out layers it cannot use and says how many', () => {
    const { layers, warnings } = parseFluxProject<{ id: string }>(saved({
      layers: [layer('a'), layer('a'), layer('c', { type: 'script' }), layer('d', { content: { src: 'x' } }), layer('e', { startTime: 'soon' })],
    }));
    expect(layers.map((l) => l.id)).toEqual(['a']);
    expect(warnings).toEqual(['4 layer(s) could not be read and were left out.']);
  });
});
