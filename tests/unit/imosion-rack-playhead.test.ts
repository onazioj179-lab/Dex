// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Imosion channel-rack playhead tests.
 * Verifies the direct-to-DOM step paint that replaces per-step React re-renders:
 * the cell at `step` is highlighted, every other cell cleared, and step < 0
 * clears all. @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { paintRackPlayhead, RACK_PLAYHEAD_SHADOW } from '../../src/renderer/DEXAPPLICATIONS/imosion/ImosionRackPlayhead';

const ROWS = 3;
const STEPS = 16;

/** Build ROWS x STEPS rack cells, each tagged with its step index. */
function buildRack(): void {
  document.body.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    for (let s = 0; s < STEPS; s++) {
      const cell = document.createElement('div');
      cell.setAttribute('data-rack-step', String(s));
      row.appendChild(cell);
    }
    document.body.appendChild(row);
  }
}

const litSteps = (): string[] => {
  const set = new Set<string>();
  document.querySelectorAll<HTMLElement>('[data-rack-step]').forEach(el => {
    if (el.style.boxShadow && el.style.boxShadow !== 'none') set.add(el.getAttribute('data-rack-step')!);
  });
  return [...set].sort();
};

describe('paintRackPlayhead', () => {
  beforeEach(buildRack);

  it('highlights only the cells at the active step (one per row)', () => {
    paintRackPlayhead(5);
    const lit = document.querySelectorAll<HTMLElement>('[data-rack-step="5"]');
    expect(lit).toHaveLength(ROWS);
    lit.forEach(el => expect(el.style.boxShadow).toBe(RACK_PLAYHEAD_SHADOW));
    expect(litSteps()).toEqual(['5']);
  });

  it('clears the previous step when the playhead advances', () => {
    paintRackPlayhead(3);
    expect(litSteps()).toEqual(['3']);
    paintRackPlayhead(4);
    expect(litSteps()).toEqual(['4']);
    document.querySelectorAll<HTMLElement>('[data-rack-step="3"]').forEach(el => {
      expect(el.style.boxShadow).toBe('none');
    });
  });

  it('clears all cells on stop (step < 0)', () => {
    paintRackPlayhead(7);
    expect(litSteps()).toEqual(['7']);
    paintRackPlayhead(-1);
    expect(litSteps()).toEqual([]);
  });

  it('clears everything when step matches no cell', () => {
    paintRackPlayhead(2);
    paintRackPlayhead(999);
    expect(litSteps()).toEqual([]);
  });

  it('is idempotent for a repeated step', () => {
    paintRackPlayhead(8);
    paintRackPlayhead(8);
    expect(litSteps()).toEqual(['8']);
  });
});
