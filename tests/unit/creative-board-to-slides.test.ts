// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { boardToSlides, describeNotCarried, sendSlidesToPresentation, takeInboxSlides, SLIDE_W, SLIDE_H } from '../../src/renderer/DEXAPPLICATIONS/standalone/creativeStudio/boardToSlides';
import type { BoardObject } from '../../src/renderer/DEXAPPLICATIONS/standalone/canvasObjects';

const o = (id: string, kind: BoardObject['kind'], x: number, y: number, w: number, h: number, text = '', extra: Partial<BoardObject> = {}): BoardObject =>
  ({ id, kind, x, y, w, h, text, color: '#FFE58F', ...extra });

describe('board to slides', () => {
  it('one slide per frame in reading order, with the frame title and its contents', () => {
    const objs = [
      o('f2', 'frame', 1200, 0, 960, 540, 'Second'),
      o('f1', 'frame', 0, 0, 960, 540, 'First'),
      o('s1', 'sticky', 100, 100, 200, 200, 'idea A'),
      o('s2', 'sticky', 1300, 100, 200, 200, 'idea B'),
      o('t1', 'text', 400, 300, 300, 60, 'note', { color: '#FFFFFF' }),
    ];
    const { slides, report } = boardToSlides(objs);
    expect(slides).toHaveLength(2);
    expect(slides[0].blocks[0]).toMatchObject({ type: 'text', content: 'First' });
    expect(slides[0].blocks.map((b) => b.content)).toEqual(['First', 'idea A', 'note']);
    expect(slides[1].blocks.map((b) => b.content)).toEqual(['Second', 'idea B']);
    // Same-size frame: positions map 1:1.
    expect(slides[0].blocks[1]).toMatchObject({ x: 100, y: 100, width: 200, height: 200, style: { background: '#FFE58F' } });
    expect(report).toMatchObject({ slides: 2, carried: 3 });
  });

  it('without frames the whole board fits one slide, inside 960×540', () => {
    const { slides } = boardToSlides([o('a', 'rect', 0, 0, 4000, 100, 'wide'), o('b', 'sticky', 0, 2000, 100, 100, 'low')]);
    expect(slides).toHaveLength(1);
    for (const b of slides[0].blocks) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(SLIDE_W + 1); expect(b.y + b.height).toBeLessThanOrEqual(SLIDE_H + 1);
    }
    // A rectangle is a shape plus its text on top.
    expect(slides[0].blocks.filter((b) => b.type === 'shape')).toHaveLength(1);
  });

  it('reports what the slide model cannot hold', () => {
    const { report } = boardToSlides([o('e', 'ellipse', 0, 0, 50, 50, 'kept text'), o('c', 'connector', 0, 0, 0, 0, '', { from: 'e', to: 'e' })], { hasDrawing: true });
    expect(report.notCarried).toEqual({ connectors: 1, ellipses: 1, drawing: true });
    expect(describeNotCarried(report)).toBe('Not carried over (slides have no equivalent): 1 connector, 1 ellipse outline, freehand drawing.');
    expect(describeNotCarried(boardToSlides([o('s', 'sticky', 0, 0, 10, 10, 'x')]).report)).toBe('');
  });

  it('an empty board makes no slides and nothing is sent', () => {
    expect(boardToSlides([]).slides).toEqual([]);
    expect(sendSlidesToPresentation([])).toBe(false);
  });

  it('slides wait in the inbox until the Slides editor takes them once', () => {
    const store = new Map<string, string>();
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    const { slides } = boardToSlides([o('s', 'sticky', 0, 0, 100, 100, 'hello')]);
    expect(sendSlidesToPresentation(slides, st)).toBe(true);
    expect(takeInboxSlides(st)).toHaveLength(1);
    expect(takeInboxSlides(st)).toEqual([]);
  });
});
