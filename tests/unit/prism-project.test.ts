// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parsePrismProject } from '../../src/renderer/DEXAPPLICATIONS/prism/prismProject';

const layer = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, type: 'image', visible: true, locked: false, opacity: 100, blendMode: 'normal',
  x: 0, y: 0, width: 10, height: 10, rotation: 0, imageData: 'data:image/png;base64,AAAA', ...extra,
});

// The exact shape Save Project writes.
const saved = (over: Record<string, unknown> = {}) => JSON.stringify({
  version: 1, canvasSize: { width: 1920, height: 1080 }, layers: [layer('a'), layer('b')],
  adjustments: { brightness: 12, contrast: -5, saturation: 0, hue: 0, exposure: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, vibrance: 300 },
  ...over,
});

describe('PRISM project files', () => {
  it('opens what Save Project writes', () => {
    const { project, warnings } = parsePrismProject<{ id: string }>(saved());
    expect(project.canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(project.layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(project.adjustments.brightness).toBe(12);
    expect(project.adjustments.vibrance).toBe(100); // clamped to the slider range
    expect(warnings).toEqual([]);
  });

  it('refuses files that are not projects, with a reason', () => {
    expect(() => parsePrismProject('nope')).toThrow('not valid JSON');
    expect(() => parsePrismProject('{"layers":[]}')).toThrow('Not a PRISM project');
    expect(() => parsePrismProject(saved({ version: 2 }))).toThrow('Unsupported project version: 2');
    expect(() => parsePrismProject(saved({ canvasSize: { width: 0, height: 5 } }))).toThrow('canvas size');
    expect(() => parsePrismProject(saved({ canvasSize: { width: 99999, height: 5 } }))).toThrow('canvas size');
    expect(() => parsePrismProject(saved({ layers: [{ id: 'x' }] }))).toThrow('no readable layers');
  });

  it('drops broken layers and never keeps a picture it would have to fetch', () => {
    const { project, warnings } = parsePrismProject<{ id: string; imageData?: string }>(saved({
      layers: [layer('a'), layer('a'), { id: 'bad' }, layer('remote', { imageData: 'https://example.com/x.png' })],
    }));
    expect(project.layers.map((l) => l.id)).toEqual(['a', 'remote']);
    expect(project.layers[1].imageData).toBeUndefined();
    expect(warnings).toEqual([
      '2 layer(s) could not be read and were left out.',
      '1 layer picture(s) were not embedded in the file and were left out.',
    ]);
  });
});
