// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// macOS Blue Modern palette contract: the tokens match the owner's table, the
// boot mirror in index.html matches the runtime tokens (no launch flash), and
// the contrast pairs that carry text pass WCAG AA.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/styles/design-system.css'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
const lightAt = css.indexOf('[data-theme="light"], .light-mode {');
const dark = css.slice(0, lightAt);
const light = css.slice(lightAt, css.indexOf('}', lightAt));

const token = (block: string, name: string) => {
  const m = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(block);
  return m ? m[1].trim().split(/\s/)[0].toUpperCase() : null;
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('macOS Blue Modern palette', () => {
  it('dark tokens match the table', () => {
    expect(token(dark, '--color-accent')).toBe('#0A84FF');
    expect(token(dark, '--color-bg-base')).toBe('#111215');
    expect(token(dark, '--color-bg-surface')).toBe('#1C1C1E');
    expect(token(dark, '--color-bg-elevated')).toBe('#2C2C2E');
    expect(token(dark, '--color-text-primary')).toBe('#F5F5F7');
    expect(token(dark, '--color-text-secondary')).toBe('#AEAEB2');
  });

  it('light tokens match the table (accent darkened for AA, documented)', () => {
    expect(token(light, '--color-bg-base')).toBe('#F5F5F7');
    expect(token(light, '--color-bg-surface')).toBe('#FFFFFF');
    expect(token(light, '--color-bg-secondary')).toBe('#F2F2F7');
    expect(token(light, '--color-text-primary')).toBe('#1D1D1F');
    expect(token(light, '--color-text-secondary')).toBe('#636366');
    expect(token(light, '--color-border')).toBe('#D1D1D6');
    // Table says #007AFF; on white that is 4.02:1, so DEX uses #0066CC (5.57:1).
    expect(ratio('#007AFF', '#FFFFFF')).toBeLessThan(4.5);
    expect(token(light, '--color-accent')).toBe('#0066CC');
  });

  it('boot mirror equals the runtime dark tokens', () => {
    for (const t of ['--color-bg-base', '--color-bg-surface', '--color-bg-elevated', '--color-text-primary', '--color-text-secondary', '--color-accent', '--color-accent-fill']) {
      expect(token(html, t), t).toBe(token(dark, t));
    }
  });

  it('text-bearing pairs pass AA', () => {
    for (const [block, base, surface] of [[dark, '#111215', '#1C1C1E'], [light, '#F5F5F7', '#FFFFFF']] as const) {
      for (const t of ['--color-text-primary', '--color-text-secondary']) {
        expect(ratio(token(block, t)!, base), t).toBeGreaterThanOrEqual(4.5);
        expect(ratio(token(block, t)!, surface), t).toBeGreaterThanOrEqual(4.5);
      }
      // White labels on filled buttons / chips.
      expect(ratio('#FFFFFF', token(block, '--color-accent-fill')!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
