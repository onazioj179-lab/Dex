// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Canvas whiteboard objects: sticky notes, text boxes, boxes, ellipses, frames,
// images and connectors that live ABOVE the paint layers. Unlike paint strokes
// they stay editable: select, move, resize, retype, recolour, connect.
// Pure helpers (unit-tested) + an export renderer for PNG / clipboard.
//

export type ObjectKind = 'sticky' | 'text' | 'rect' | 'ellipse' | 'frame' | 'image' | 'connector';

export interface BoardObject {
  id: string;
  kind: ObjectKind;
  x: number; y: number; w: number; h: number;
  text: string;
  color: string;
  /** image: data URL */
  src?: string;
  /** connector: object ids at each end */
  from?: string;
  to?: string;
}

export const STICKY_COLORS = ['#FFE58F', '#FFC2D1', '#B8E1FF', '#C7F0BD', '#E0CCFF', '#FFD6A5'];
export const OBJECT_GRID = 20;
export const MIN_SIZE = 24;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let seq = 0;
export const newObjectId = () => `obj-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const DEFAULTS: Record<Exclude<ObjectKind, 'connector'>, { w: number; h: number; text: string }> = {
  sticky: { w: 200, h: 180, text: '' },
  text: { w: 260, h: 60, text: 'Text' },
  rect: { w: 220, h: 140, text: '' },
  ellipse: { w: 200, h: 140, text: '' },
  frame: { w: 640, h: 420, text: 'Frame' },
  image: { w: 320, h: 240, text: '' },
};

/** New object centred on `at` (artboard coordinates). */
export function createObject(kind: Exclude<ObjectKind, 'connector'>, at: { x: number; y: number }, color: string, extra: Partial<BoardObject> = {}): BoardObject {
  const d = DEFAULTS[kind];
  const w = extra.w ?? d.w, h = extra.h ?? d.h;
  return { id: newObjectId(), kind, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, text: d.text, color, ...extra };
}

export function createConnector(from: string, to: string, color: string): BoardObject {
  return { id: newObjectId(), kind: 'connector', x: 0, y: 0, w: 0, h: 0, text: '', color, from, to };
}

export const snapValue = (v: number, on: boolean) => (on ? Math.round(v / OBJECT_GRID) * OBJECT_GRID : Math.round(v));

/** Where a ray from a box centre towards (tx, ty) leaves the box (connector ends). */
export function edgePoint(o: Pick<BoardObject, 'x' | 'y' | 'w' | 'h'>, tx: number, ty: number): { x: number; y: number } {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (o.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (o.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Both ends of a connector, or null when an end object no longer exists. */
export function connectorEnds(c: BoardObject, byId: Map<string, BoardObject>): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const A = c.from ? byId.get(c.from) : undefined;
  const B = c.to ? byId.get(c.to) : undefined;
  if (!A || !B) return null;
  const ac = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
  const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  return { a: edgePoint(A, bc.x, bc.y), b: edgePoint(B, ac.x, ac.y) };
}

/** Delete objects and any connector attached to them. */
export function removeObjects(objs: BoardObject[], ids: Set<string>): BoardObject[] {
  return objs.filter((o) => !ids.has(o.id) && !(o.kind === 'connector' && ((o.from && ids.has(o.from)) || (o.to && ids.has(o.to)))));
}

/** Stacking: frames at the back, connectors next, everything else on top (in order). */
export function paintOrder(objs: BoardObject[]): BoardObject[] {
  const rank = (o: BoardObject) => (o.kind === 'frame' ? 0 : o.kind === 'connector' ? 1 : 2);
  return [...objs].sort((a, b) => rank(a) - rank(b));
}

/** Validate stored objects; anything malformed is dropped. */
export function sanitizeObjects(raw: unknown): BoardObject[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<ObjectKind>(['sticky', 'text', 'rect', 'ellipse', 'frame', 'image', 'connector']);
  const out: BoardObject[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    if (!r || typeof r.id !== 'string' || !kinds.has(r.kind as ObjectKind)) continue;
    const n = (k: string, d = 0) => (Number.isFinite(r[k]) ? (r[k] as number) : d);
    const o: BoardObject = {
      id: r.id, kind: r.kind as ObjectKind, x: n('x'), y: n('y'),
      w: Math.max(r.kind === 'connector' ? 0 : MIN_SIZE, n('w', MIN_SIZE)), h: Math.max(r.kind === 'connector' ? 0 : MIN_SIZE, n('h', MIN_SIZE)),
      text: typeof r.text === 'string' ? r.text.slice(0, 20000) : '', color: typeof r.color === 'string' ? r.color : '#000000',
    };
    if (o.kind === 'image') { if (typeof r.src !== 'string' || !r.src.startsWith('data:image/')) continue; o.src = r.src; }
    if (o.kind === 'connector') { if (typeof r.from !== 'string' || typeof r.to !== 'string') continue; o.from = r.from; o.to = r.to; }
    out.push(o);
  }
  return out;
}

/** Readable text colour on a fill (WCAG relative luminance). */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#1D1D1F';
  const v = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return L > 0.4 ? '#1D1D1F' : '#FFFFFF';
}

// ---- export rendering ---------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();
/** Decoded image for a data URL (null until it has loaded once). */
export function cachedImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    if (typeof Image === 'undefined') return null;
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(tryLine).width > maxW && line) { lines.push(line); line = word; } else line = tryLine;
    }
    lines.push(line);
  }
  return lines;
}

/** Paint every object onto an artboard-space 2D context (used by export / copy). */
export function drawObjects(ctx: CanvasRenderingContext2D, objs: BoardObject[]): void {
  const byId = new Map(objs.map((o) => [o.id, o]));
  for (const o of paintOrder(objs)) {
    ctx.save();
    if (o.kind === 'connector') {
      const ends = connectorEnds(o, byId);
      if (ends) {
        const { a, b } = ends;
        ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 12;
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45));
        ctx.lineTo(b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      continue;
    }
    if (o.kind === 'sticky') {
      ctx.fillStyle = o.color; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillRect(o.x, o.y, o.w, o.h); ctx.shadowColor = 'transparent';
    } else if (o.kind === 'rect') {
      ctx.strokeStyle = o.color; ctx.lineWidth = 2.5; ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (o.kind === 'ellipse') {
      ctx.strokeStyle = o.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (o.kind === 'frame') {
      ctx.strokeStyle = o.color; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.strokeRect(o.x, o.y, o.w, o.h); ctx.setLineDash([]);
    } else if (o.kind === 'image' && o.src) {
      const img = cachedImage(o.src);
      if (img) ctx.drawImage(img, o.x, o.y, o.w, o.h);
    }
    if (o.text) {
      const frameTitle = o.kind === 'frame';
      ctx.fillStyle = o.kind === 'sticky' ? textOn(o.color) : o.kind === 'text' ? o.color : frameTitle ? o.color : '#1D1D1F';
      ctx.font = `${frameTitle ? 600 : 400} ${frameTitle ? 16 : 18}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      if (frameTitle) ctx.fillText(o.text, o.x + 4, o.y - 22);
      else wrap(ctx, o.text, o.w - 20).forEach((ln, i) => { if (12 + i * 24 < o.h) ctx.fillText(ln, o.x + 10, o.y + 10 + i * 24); });
    }
    ctx.restore();
  }
}
