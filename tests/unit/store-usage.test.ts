// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mostUsedAppIds } from '../../src/renderer/pages/storeUsage';

describe('Store: most used apps', () => {
  it('ranks by real open count, ties by id', () => {
    expect(mostUsedAppIds({ notes: 3, maps: 9, files: 3 }, 8)).toEqual(['maps', 'files', 'notes']);
  });

  it('leaves out apps never opened and bad values', () => {
    expect(mostUsedAppIds({ a: 0, b: -2, c: Number.NaN, d: 1 }, 8)).toEqual(['d']);
    expect(mostUsedAppIds({}, 8)).toEqual([]);
  });

  it('honours the limit and the include filter', () => {
    const counts = { a: 5, b: 4, c: 3, d: 2 };
    expect(mostUsedAppIds(counts, 2)).toEqual(['a', 'b']);
    expect(mostUsedAppIds(counts, 8, id => id !== 'a')).toEqual(['b', 'c', 'd']);
  });

  it('the Store page no longer invents permissions or a build-date rail', () => {
    const src = readFileSync(join(__dirname, '../../src/renderer/pages/Store.tsx'), 'utf8');
    expect(src).not.toMatch(/derivePermissions/);
    expect(src).not.toMatch(/Recently added/);
    expect(src).not.toMatch(/<select/);
    expect(src).not.toMatch(/type="checkbox"/);
  });
});
