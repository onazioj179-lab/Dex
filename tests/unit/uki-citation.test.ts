// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildCitations, citationNumber, formatCitations, inlineMarker,
} from '../../src/shared/uki/citation';

const sources = [
  { title: 'Wikipedia: DEX', url: 'https://en.wikipedia.org/wiki/DEX' },
  { title: 'Open-Meteo', url: 'https://open-meteo.com/' },
  { title: 'Wikipedia (dup)', url: 'https://en.wikipedia.org/wiki/DEX/' }, // trailing slash dup
];

describe('uki citation', () => {
  it('de-duplicates by URL and numbers stably', () => {
    const cites = buildCitations(sources);
    expect(cites).toHaveLength(2);
    expect(cites[0].n).toBe(1);
    expect(cites[1].n).toBe(2);
    expect(cites[1].url).toBe('https://open-meteo.com/');
  });

  it('skips empty urls and falls back title to url', () => {
    const cites = buildCitations([{ title: '', url: 'https://x.io' }, { title: 'y', url: '  ' }]);
    expect(cites).toHaveLength(1);
    expect(cites[0].title).toBe('https://x.io');
  });

  it('resolves citation number and inline marker', () => {
    const cites = buildCitations(sources);
    expect(citationNumber(cites, 'https://open-meteo.com')).toBe(2);
    expect(citationNumber(cites, 'https://unknown.com')).toBeNull();
    expect(inlineMarker(cites, 'https://en.wikipedia.org/wiki/DEX')).toBe(' [1]');
    expect(inlineMarker(cites, 'https://nope.com')).toBe('');
  });

  it('formats a citation list', () => {
    const cites = buildCitations(sources);
    expect(formatCitations(cites)).toBe(
      '[1] Wikipedia: DEX — https://en.wikipedia.org/wiki/DEX\n[2] Open-Meteo — https://open-meteo.com/',
    );
  });
});
