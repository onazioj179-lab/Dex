// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Creative Studio: board → slides. Each frame on a board becomes one slide
// (left-to-right, then top-to-bottom); with no frames the whole board is one
// slide. Objects keep their relative layout, scaled into the 960×540 slide.
// Sticky notes and text become editable text blocks, rectangles and frames
// become shapes, images stay images. What the slide model cannot hold
// (connectors, ellipse outlines, freehand drawing layers) is counted in the
// report rather than silently dropped. Pure; unit-tested.

import type { BoardObject } from '../canvasObjects';

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export interface SlideBlockOut {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number; y: number; width: number; height: number;
  content: string;
  style: { fontSize?: number; color?: string; background?: string; fontWeight?: number };
}

export interface SlideOut {
  id: string;
  blocks: SlideBlockOut[];
  background: string;
  transition: 'fade';
  notes: string;
  layout: 'blank';
}

export interface ConversionReport {
  slides: number;
  carried: number;
  /** Things the slide model has no equivalent for. */
  notCarried: { connectors: number; ellipses: number; drawing: boolean };
}

type Box = { x: number; y: number; w: number; h: number };
const center = (o: Box) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const inside = (o: Box, f: Box) => { const c = center(o); return c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h; };

function bounds(objs: Box[]): Box {
  const x0 = Math.min(...objs.map((o) => o.x)), y0 = Math.min(...objs.map((o) => o.y));
  const x1 = Math.max(...objs.map((o) => o.x + o.w)), y1 = Math.max(...objs.map((o) => o.y + o.h));
  const pad = 24;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/** Reading order: rows (by top, 80 px tolerance), then left to right. */
function readingOrder<T extends Box>(items: T[]): T[] {
  return [...items].sort((a, b) => (Math.abs(a.y - b.y) > 80 ? a.y - b.y : a.x - b.x));
}

let seq = 0;
const bid = () => `blk-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function boardToSlides(
  objects: readonly BoardObject[],
  opts: { background?: string; hasDrawing?: boolean } = {},
): { slides: SlideOut[]; report: ConversionReport } {
  const report: ConversionReport = { slides: 0, carried: 0, notCarried: { connectors: 0, ellipses: 0, drawing: !!opts.hasDrawing } };
  const shapes = objects.filter((o) => o.kind !== 'connector');
  report.notCarried.connectors = objects.length - shapes.length;
  const frames = readingOrder(shapes.filter((o) => o.kind === 'frame'));
  const loose = shapes.filter((o) => o.kind !== 'frame');
  const groups: { frame: BoardObject | null; area: Box; members: BoardObject[] }[] = frames.length
    ? frames.map((f) => ({ frame: f, area: f as Box, members: loose.filter((o) => inside(o, f)) }))
    : loose.length ? [{ frame: null, area: bounds(loose), members: loose }] : [];

  const slides = groups.map((g): SlideOut => {
    const scale = Math.min(SLIDE_W / g.area.w, SLIDE_H / g.area.h);
    const ox = (SLIDE_W - g.area.w * scale) / 2, oy = (SLIDE_H - g.area.h * scale) / 2;
    const map = (o: Box) => ({
      x: Math.round(ox + (o.x - g.area.x) * scale), y: Math.round(oy + (o.y - g.area.y) * scale),
      width: Math.max(8, Math.round(o.w * scale)), height: Math.max(8, Math.round(o.h * scale)),
    });
    const fs = (base: number) => Math.max(10, Math.round(base * scale));
    const blocks: SlideBlockOut[] = [];
    if (g.frame?.text.trim()) {
      blocks.push({ id: bid(), type: 'text', x: 48, y: 24, width: SLIDE_W - 96, height: 60, content: g.frame.text.trim(), style: { fontSize: 36, fontWeight: 700, color: '#FFFFFF' } });
    }
    for (const o of readingOrder(g.members)) {
      const r = map(o);
      if (o.kind === 'image' && o.src) {
        blocks.push({ id: bid(), type: 'image', ...r, content: o.src, style: {} });
      } else if (o.kind === 'sticky') {
        blocks.push({ id: bid(), type: 'text', ...r, content: o.text, style: { fontSize: fs(16), color: '#1D1D1F', background: o.color } });
      } else if (o.kind === 'text') {
        blocks.push({ id: bid(), type: 'text', ...r, content: o.text, style: { fontSize: fs(18), color: o.color } });
      } else if (o.kind === 'rect') {
        blocks.push({ id: bid(), type: 'shape', ...r, content: '', style: { background: o.color } });
        if (o.text.trim()) blocks.push({ id: bid(), type: 'text', ...r, content: o.text, style: { fontSize: fs(16), color: '#FFFFFF' } });
      } else if (o.kind === 'ellipse') {
        // The slide model has no ellipse: keep its text, count the outline.
        report.notCarried.ellipses++;
        if (o.text.trim()) blocks.push({ id: bid(), type: 'text', ...r, content: o.text, style: { fontSize: fs(16), color: '#FFFFFF' } });
        continue;
      } else continue;
      report.carried++;
    }
    return { id: `slide-${bid()}`, blocks, background: opts.background ?? '#1a1a1f', transition: 'fade', notes: g.frame ? `From the board frame "${g.frame.text || 'Untitled frame'}".` : 'From the board.', layout: 'blank' };
  });
  report.slides = slides.length;
  return { slides, report };
}

/** One line for the user about what did not carry over (empty when nothing). */
export function describeNotCarried(r: ConversionReport): string {
  const parts: string[] = [];
  if (r.notCarried.connectors) parts.push(`${r.notCarried.connectors} connector${r.notCarried.connectors > 1 ? 's' : ''}`);
  if (r.notCarried.ellipses) parts.push(`${r.notCarried.ellipses} ellipse outline${r.notCarried.ellipses > 1 ? 's' : ''}`);
  if (r.notCarried.drawing) parts.push('freehand drawing');
  return parts.length ? `Not carried over (slides have no equivalent): ${parts.join(', ')}.` : '';
}

// ---- hand-off to the Slides editor -------------------------------------------
// The Slides editor may not be mounted yet, so the slides wait in an inbox it
// reads on mount; a live event covers the case where it is already open.

export const SLIDES_INBOX_KEY = 'dex-presentation-inbox';
export const SLIDES_IMPORT_EVENT = 'dex-presentation-import';

export function sendSlidesToPresentation(slides: SlideOut[], storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
  if (!slides.length) return false;
  try { storage?.setItem(SLIDES_INBOX_KEY, JSON.stringify({ at: Date.now(), slides })); } catch { return false; }
  try { window.dispatchEvent(new CustomEvent(SLIDES_IMPORT_EVENT)); } catch { /* non-DOM */ }
  return true;
}

/** Take (and clear) waiting slides. */
export function takeInboxSlides(storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): SlideOut[] {
  try {
    const raw = storage?.getItem(SLIDES_INBOX_KEY);
    if (!raw) return [];
    storage?.removeItem(SLIDES_INBOX_KEY);
    const v = JSON.parse(raw);
    return Array.isArray(v?.slides) ? v.slides : [];
  } catch { return []; }
}
