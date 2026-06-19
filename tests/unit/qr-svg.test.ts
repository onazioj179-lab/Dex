// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies QR matrix -> SVG serialization (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { qrMatrixToSVG } from '../../src/shared/format/qrSvg';

// A tiny 2x2 checkerboard: dark at (0,0) and (1,1).
const matrix = [
  [true, false],
  [false, true],
];

describe('qrMatrixToSVG', () => {
  it('produces a well-formed svg document', () => {
    const svg = qrMatrixToSVG(matrix);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('sizes the viewBox to include the quiet-zone margin on both sides', () => {
    // 2 modules + margin 4 on each side = 10.
    expect(qrMatrixToSVG(matrix, { margin: 4 })).toContain('viewBox="0 0 10 10"');
    expect(qrMatrixToSVG(matrix, { margin: 0 })).toContain('viewBox="0 0 2 2"');
  });

  it('emits one module subpath per dark cell, offset by the margin', () => {
    const svg = qrMatrixToSVG(matrix, { margin: 1 });
    // dark cells at (0,0) and (1,1) shift to (1,1) and (2,2) with margin 1.
    expect(svg).toContain('M1 1h1v1h-1z');
    expect(svg).toContain('M2 2h1v1h-1z');
    // Exactly two subpaths.
    expect((svg.match(/h1v1h-1z/g) || []).length).toBe(2);
  });

  it('applies the requested colors and pixel size', () => {
    const svg = qrMatrixToSVG(matrix, { fg: '#112233', bg: '#abcdef', pixelSize: 512 });
    expect(svg).toContain('fill="#abcdef"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('width="512"');
  });
});
