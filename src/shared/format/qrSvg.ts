// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * QR matrix -> SVG serialization (DEX v6 Track G). Turns a boolean module
 * matrix into a crisp, scalable SVG string with a spec-correct quiet zone. Pure
 * + unit-tested; the QR Code app uses it for print-quality "Download SVG".
 */

export type QrModuleStyle = 'square' | 'rounded' | 'dots';

export function qrModuleStyleAt(style: QrModuleStyle, row: number, column: number, size: number): QrModuleStyle {
  const finder = (row < 9 && (column < 9 || column >= size - 8)) || (row >= size - 8 && column < 9);
  return finder || row === 6 || column === 6 ? 'square' : style;
}

export interface QrSvgOptions {
  /** Quiet-zone border in modules (QR spec recommends 4). */
  margin?: number;
  /** Foreground (module) color. */
  fg?: string;
  /** Background (quiet-zone + light modules) color. */
  bg?: string;
  /** Rendered pixel size of the square SVG. */
  pixelSize?: number;
  moduleStyle?: QrModuleStyle;
}

/**
 * Serialize a square QR module matrix to an SVG document string. Dark modules
 * become a single compact path (one subpath per module); the viewBox is in
 * module units so the output scales losslessly.
 */
export function qrMatrixToSVG(matrix: boolean[][], opts: QrSvgOptions = {}): string {
  const { margin = 4, fg = '#000000', bg = '#ffffff', pixelSize = 256, moduleStyle = 'square' } = opts;
  const n = matrix.length;
  const total = n + margin * 2;

  let path = '';
  const styled: string[] = [];
  for (let y = 0; y < n; y++) {
    const row = matrix[y];
    for (let x = 0; x < n; x++) {
      if (!row[x]) continue;
      const left = x + margin, top = y + margin;
      const shape = qrModuleStyleAt(moduleStyle, y, x, n);
      if (shape === 'dots') styled.push(`<circle cx="${left + 0.5}" cy="${top + 0.5}" r="0.48"/>`);
      else if (shape === 'rounded') styled.push(`<rect x="${left}" y="${top}" width="1" height="1" rx="0.2"/>`);
      else path += `M${left} ${top}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="${moduleStyle === 'square' ? 'crispEdges' : 'geometricPrecision'}">` +
    `<rect width="${total}" height="${total}" fill="${bg}"/>` +
    `<path d="${path}" fill="${fg}"/>` +
    (styled.length ? `<g fill="${fg}">${styled.join('')}</g>` : '') +
    `</svg>`
  );
}
