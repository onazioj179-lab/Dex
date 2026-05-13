// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave 5 tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';

import {
  diffLines,
  parseCsv, parseCsvObjects,
  renderMarkdownLite,
  pointInRect, pointInPolygon, bboxOfPoints, rectsIntersect, distance, distanceToSegment,
  easings,
  rgbToHsl, hslToRgb, toHex, lighten, darken, mix,
  StateMachine,
  retry,
  formatDuration, formatDurationCompact, formatRelative,
  slugify, sanitizeFilename, ensureUniqueName,
} from '../../src/renderer/improvements500';

describe('diff', () => {
  it('detects insert/delete/equal', () => {
    const out = diffLines('a\nb\nc', 'a\nx\nc');
    const ops = out.map((c) => c.op);
    expect(ops).toContain('insert');
    expect(ops).toContain('delete');
    expect(ops).toContain('equal');
  });

  it('identical input is all equal', () => {
    const out = diffLines('a\nb', 'a\nb');
    expect(out.every((c) => c.op === 'equal')).toBe(true);
  });
});

describe('csvParse', () => {
  it('parses quoted fields with commas and escaped quotes', () => {
    const r = parseCsv('a,b,c\n1,"two,three","say ""hi"""');
    expect(r).toEqual([['a', 'b', 'c'], ['1', 'two,three', 'say "hi"']]);
  });

  it('parseCsvObjects keys by header', () => {
    const r = parseCsvObjects('name,age\nAlice,30\nBob,25');
    expect(r).toEqual([{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]);
  });
});

describe('markdownLite', () => {
  it('renders headings, bold, italic, code, lists', () => {
    const html = renderMarkdownLite('# Title\n\nHello **world** and *italic* and `code`.\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  it('blocks dangerous URL schemes', () => {
    const html = renderMarkdownLite('[click](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('escapes raw HTML', () => {
    const html = renderMarkdownLite('hello <script>x</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('geometry', () => {
  it('pointInRect', () => {
    expect(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(pointInRect({ x: 15, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('pointInPolygon (square)', () => {
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, poly)).toBe(false);
  });

  it('bboxOfPoints + rectsIntersect', () => {
    const bb = bboxOfPoints([{ x: 1, y: 2 }, { x: 5, y: 6 }]);
    expect(bb).toEqual({ x: 1, y: 2, width: 4, height: 4 });
    expect(rectsIntersect(bb, { x: 4, y: 4, width: 10, height: 10 })).toBe(true);
  });

  it('distance + distanceToSegment', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distanceToSegment({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(1);
  });
});

describe('easings', () => {
  it('endpoints are 0 and 1', () => {
    for (const fn of Object.values(easings)) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
});

describe('palette', () => {
  it('rgb<->hsl roundtrip', () => {
    const rgb = { r: 200, g: 100, b: 50 };
    const back = hslToRgb(rgbToHsl(rgb));
    expect(back.r).toBeCloseTo(200, -1);
    expect(back.g).toBeCloseTo(100, -1);
    expect(back.b).toBeCloseTo(50, -1);
  });

  it('lighten and darken move L', () => {
    const a = lighten('#404040', 0.3);
    const b = darken('#404040', 0.3);
    expect(a).not.toBe('#404040');
    expect(b).not.toBe('#404040');
  });

  it('mix produces midpoint hex', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('toHex pads', () => {
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });
});

describe('StateMachine', () => {
  it('only allowed transitions fire', () => {
    type S = 'idle' | 'loading' | 'done'; type E = 'load' | 'finish';
    const fsm = new StateMachine<S, E>({
      initial: 'idle',
      transitions: { idle: { load: 'loading' }, loading: { finish: 'done' }, done: {} },
    });
    expect(fsm.state()).toBe('idle');
    expect(fsm.send('finish')).toBe(false);
    expect(fsm.send('load')).toBe(true);
    expect(fsm.state()).toBe('loading');
    expect(fsm.send('finish')).toBe(true);
    expect(fsm.state()).toBe('done');
    fsm.reset();
    expect(fsm.state()).toBe('idle');
  });

  it('onEnter fires with previous state', () => {
    let prev = '';
    const fsm = new StateMachine<'a' | 'b', 'go'>({
      initial: 'a',
      transitions: { a: { go: 'b' }, b: {} },
      onEnter: { b: (p) => { prev = p; } },
    });
    fsm.send('go');
    expect(prev).toBe('a');
  });
});

describe('retry', () => {
  it('eventually succeeds', async () => {
    let n = 0;
    const out = await retry(async () => { n++; if (n < 3) throw new Error('x'); return n; }, { baseDelayMs: 1, jitter: false });
    expect(out).toBe(3);
  });

  it('honors shouldRetry false', async () => {
    let n = 0;
    await expect(retry(async () => { n++; throw new Error('fatal'); }, {
      baseDelayMs: 1, jitter: false,
      shouldRetry: () => false,
    })).rejects.toThrow('fatal');
    expect(n).toBe(1);
  });
});

describe('timeFormat', () => {
  it('formatDuration M:SS and H:MM:SS', () => {
    expect(formatDuration(75_000)).toBe('1:15');
    expect(formatDuration(3 * 3600_000 + 5 * 60_000 + 9_000)).toBe('3:05:09');
  });

  it('formatDurationCompact picks units', () => {
    expect(formatDurationCompact(50)).toBe('50ms');
    expect(formatDurationCompact(2_500)).toBe('2.50s');
    expect(formatDurationCompact(120_000)).toBe('2.0m');
  });

  it('formatRelative future and past', () => {
    const now = 1_700_000_000_000;
    expect(formatRelative(now + 5 * 60_000, now)).toBe('in 5 minutes');
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(formatRelative(now + 500, now)).toBe('just now');
  });
});

describe('stringSlugify', () => {
  it('slugify lowercases and dashes', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  C r a z y  ')).toBe('c-r-a-z-y');
  });

  it('sanitizeFilename strips bad chars and reserved names', () => {
    expect(sanitizeFilename('a/b\\c:d')).toBe('a_b_c_d');
    expect(sanitizeFilename('CON')).toBe('CON_');
    expect(sanitizeFilename('  .  ')).toBe('untitled');
  });

  it('ensureUniqueName appends counter', () => {
    const set = new Set(['file.txt', 'file (2).txt']);
    expect(ensureUniqueName('file.txt', set)).toBe('file (3).txt');
    expect(ensureUniqueName('new.txt', set)).toBe('new.txt');
  });
});
