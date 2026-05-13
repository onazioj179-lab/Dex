// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fluent SVG path "d" attribute builder. Avoids string concatenation typos
 * and produces a stable canonical form (decimal precision controlled by
 * options). Numbers below the precision threshold round to 0.
 */

export interface SvgPathOptions {
  precision?: number;
}

export class SvgPathBuilder {
  private parts: string[] = [];
  private readonly precision: number;
  private readonly factor: number;

  constructor(opts: SvgPathOptions = {}) {
    this.precision = Math.max(0, opts.precision ?? 3);
    this.factor = Math.pow(10, this.precision);
  }

  private fmt(n: number): string {
    const r = Math.round(n * this.factor) / this.factor;
    return r.toString();
  }

  moveTo(x: number, y: number): this { this.parts.push(`M${this.fmt(x)} ${this.fmt(y)}`); return this; }
  lineTo(x: number, y: number): this { this.parts.push(`L${this.fmt(x)} ${this.fmt(y)}`); return this; }
  hLine(x: number): this { this.parts.push(`H${this.fmt(x)}`); return this; }
  vLine(y: number): this { this.parts.push(`V${this.fmt(y)}`); return this; }
  curveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.parts.push(`C${this.fmt(c1x)} ${this.fmt(c1y)} ${this.fmt(c2x)} ${this.fmt(c2y)} ${this.fmt(x)} ${this.fmt(y)}`);
    return this;
  }
  quadTo(cx: number, cy: number, x: number, y: number): this {
    this.parts.push(`Q${this.fmt(cx)} ${this.fmt(cy)} ${this.fmt(x)} ${this.fmt(y)}`);
    return this;
  }
  arc(rx: number, ry: number, xAxisRot: number, largeArc: 0 | 1, sweep: 0 | 1, x: number, y: number): this {
    this.parts.push(`A${this.fmt(rx)} ${this.fmt(ry)} ${this.fmt(xAxisRot)} ${largeArc} ${sweep} ${this.fmt(x)} ${this.fmt(y)}`);
    return this;
  }
  close(): this { this.parts.push('Z'); return this; }

  build(): string { return this.parts.join(' '); }

  reset(): void { this.parts = []; }
}

/** Convenience: rounded-rectangle path. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (rr === 0) {
    return new SvgPathBuilder()
      .moveTo(x, y).hLine(x + w).vLine(y + h).hLine(x).close().build();
  }
  return new SvgPathBuilder()
    .moveTo(x + rr, y)
    .hLine(x + w - rr)
    .arc(rr, rr, 0, 0, 1, x + w, y + rr)
    .vLine(y + h - rr)
    .arc(rr, rr, 0, 0, 1, x + w - rr, y + h)
    .hLine(x + rr)
    .arc(rr, rr, 0, 0, 1, x, y + h - rr)
    .vLine(y + rr)
    .arc(rr, rr, 0, 0, 1, x + rr, y)
    .close()
    .build();
}
