// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UKI blueprint generator tests
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  generateBlueprint,
  detectBlueprintKind,
  tweakBlueprint,
} from '../../src/main/uki/UkiBlueprintGenerator';

describe('detectBlueprintKind', () => {
  it.each([
    ['build a simple landing page', 'web-app'],
    ['design a bracket part for my printer', 'cad-part'],
    ['write a chord progression for a chill song', 'music-track'],
    ['storyboard a short product video', 'video-storyboard'],
    ['generate a series of cinematic images', 'image-series'],
    ['scaffold a design system with tokens', 'design-system'],
    ['create a typescript library', 'code-project'],
  ])('detects %s -> %s', (prompt, expected) => {
    expect(detectBlueprintKind(prompt)).toBe(expected);
  });
});

describe('generateBlueprint', () => {
  it('throws on empty prompt', () => {
    expect(() => generateBlueprint('')).toThrow();
  });

  it('produces a web-app blueprint with core files and parameters', () => {
    const bp = generateBlueprint('build a simple landing page about birds', { now: () => 1, idFn: () => 'bp-1' });
    expect(bp.id).toBe('bp-1');
    expect(bp.kind).toBe('web-app');
    const paths = bp.files.map(f => f.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('main.css');
    expect(paths).toContain('main.js');
    const html = bp.files.find(f => f.path === 'index.html')!.contents;
    expect(html).toContain('<!doctype html>');
    expect(bp.parameters.find(p => p.key === 'title')).toBeDefined();
  });

  it('produces a music-track blueprint with progression', () => {
    const bp = generateBlueprint('write a chord progression for a chill song');
    expect(bp.kind).toBe('music-track');
    const json = JSON.parse(bp.files.find(f => f.path === 'song.imosion.json')!.contents);
    expect(Array.isArray(json.progression)).toBe(true);
    expect(json.progression.length).toBeGreaterThan(0);
  });

  it('produces a code-project blueprint with package.json + tsconfig', () => {
    const bp = generateBlueprint('create a typescript library called widgets');
    expect(bp.kind).toBe('code-project');
    const paths = bp.files.map(f => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('src/index.ts');
    const pkg = JSON.parse(bp.files.find(f => f.path === 'package.json')!.contents);
    expect(typeof pkg.name).toBe('string');
    expect(pkg.name.length).toBeGreaterThan(0);
  });

  it('honors explicit kind override', () => {
    const bp = generateBlueprint('anything', { kind: 'design-system' });
    expect(bp.kind).toBe('design-system');
    expect(bp.files.map(f => f.path)).toContain('tokens.json');
  });
});

describe('tweakBlueprint', () => {
  it('updates parameter and rewrites matching JSON file', () => {
    const bp = generateBlueprint('design a bracket part', { idFn: () => 'bp-x' });
    const next = tweakBlueprint(bp, { key: 'material', value: 'ABS' });
    expect(next.parameters.find(p => p.key === 'material')!.value).toBe('ABS');
    const json = JSON.parse(next.files.find(f => f.path.endsWith('.axl.json'))!.contents);
    expect(json.material).toBe('ABS');
  });

  it('throws on unknown key', () => {
    const bp = generateBlueprint('build a landing page');
    expect(() => tweakBlueprint(bp, { key: 'nope', value: 1 })).toThrow();
  });

  it('throws on type mismatch', () => {
    const bp = generateBlueprint('design a bracket part');
    expect(() => tweakBlueprint(bp, { key: 'lengthMm', value: 'big' as unknown as number })).toThrow();
  });
});
