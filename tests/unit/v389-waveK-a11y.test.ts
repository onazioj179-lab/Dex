// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave K - a11y + i18n tests

import { describe, it, expect } from 'vitest';
import {
  EN_STRINGS,
  classifyContrast,
  contrastRatio,
  isFocusable,
  lookupString,
  parseColor,
  recolorForAssist,
  registerStringTable,
  relativeLuminance,
  resolveAriaLabel,
  t,
} from '../../src/shared/i18n/a11y';

// -------- contrast ---------------------------------------------------

describe('wave K - color parsing', () => {
  it('parses #rgb', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#000')).toEqual([0, 0, 0]);
  });

  it('parses #rrggbb', () => {
    expect(parseColor('#FF8000')).toEqual([255, 128, 0]);
  });

  it('parses rgb(...)', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
  });

  it('returns null on garbage', () => {
    expect(parseColor('not a color')).toBeNull();
    expect(parseColor('#zzz')).toBeNull();
  });
});

describe('wave K - contrast ratio', () => {
  it('white on black is ~21', () => {
    const r = contrastRatio('#fff', '#000');
    expect(r).toBeGreaterThan(20.9);
    expect(r).toBeLessThan(21.1);
  });

  it('white on white is 1', () => {
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 2);
  });

  it('order does not matter', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(contrastRatio('#000', '#fff'), 5);
  });

  it('returns 1 for invalid input', () => {
    expect(contrastRatio('garbage', '#fff')).toBe(1);
  });
});

describe('wave K - contrast classification', () => {
  it('AAA at >= 7', () => {
    expect(classifyContrast(7.5)).toBe('AAA');
  });

  it('AA at >= 4.5', () => {
    expect(classifyContrast(5.0)).toBe('AA');
  });

  it('AA-large for big text at >= 3', () => {
    expect(classifyContrast(3.5, true)).toBe('AA-large');
    expect(classifyContrast(3.5, false)).toBe('fail');
  });

  it('fail below threshold', () => {
    expect(classifyContrast(2)).toBe('fail');
  });
});

describe('wave K - relative luminance', () => {
  it('white = 1, black = 0', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });
});

// -------- color-blind palette ---------------------------------------

describe('wave K - color-blind assist', () => {
  it('passes color through when assist is none', () => {
    expect(recolorForAssist('#FF453A', 'none')).toBe('#FF453A');
  });

  it('replaces red with vermillion for protanopia/deuteranopia', () => {
    expect(recolorForAssist('#FF453A', 'protanopia')).toBe('#D55E00');
    expect(recolorForAssist('#FF453A', 'deuteranopia')).toBe('#D55E00');
  });

  it('replaces green with blue for deuteranopia', () => {
    expect(recolorForAssist('#34C759', 'deuteranopia')).toBe('#0072B2');
  });

  it('returns input unchanged for unknown colors', () => {
    expect(recolorForAssist('#abcdef', 'protanopia')).toBe('#abcdef');
  });
});

// -------- aria fallback ---------------------------------------------

describe('wave K - resolveAriaLabel', () => {
  it('prefers explicit ariaLabel', () => {
    expect(resolveAriaLabel({ ariaLabel: 'Save' })).toBe('Save');
  });

  it('falls back to tooltip', () => {
    expect(resolveAriaLabel({ tooltip: 'Save the file' })).toBe('Save the file');
  });

  it('prettifies actionId', () => {
    expect(resolveAriaLabel({ actionId: 'notes.new' })).toBe('Notes new');
    expect(resolveAriaLabel({ actionId: 'a-b-c' })).toBe('A b c');
  });

  it('returns "Action" when nothing is available', () => {
    expect(resolveAriaLabel({})).toBe('Action');
  });
});

// -------- focusable check -------------------------------------------

describe('wave K - isFocusable', () => {
  it('button is always focusable', () => {
    expect(isFocusable('button')).toBe(true);
  });

  it('div with role=button is focusable', () => {
    expect(isFocusable('div', 'button')).toBe(true);
  });

  it('div with tabIndex >= 0 is focusable', () => {
    expect(isFocusable('div', undefined, 0)).toBe(true);
    expect(isFocusable('div', undefined, 5)).toBe(true);
  });

  it('plain div is not focusable', () => {
    expect(isFocusable('div')).toBe(false);
  });

  it('tabIndex -1 alone is not focusable', () => {
    expect(isFocusable('div', undefined, -1)).toBe(false);
  });
});

// -------- string table ----------------------------------------------

describe('wave K - string table', () => {
  it('English fallback exists for common keys', () => {
    expect(EN_STRINGS.entries['common.ok']).toBe('OK');
    expect(EN_STRINGS.entries['plan.upgrade']).toContain('{plan}');
  });

  it('lookupString falls back to en when locale missing', () => {
    expect(lookupString('common.cancel', 'fr')).toBe('Cancel');
  });

  it('lookupString returns the key when nothing matches', () => {
    expect(lookupString('does.not.exist', 'en')).toBe('does.not.exist');
  });

  it('t interpolates named variables', () => {
    expect(t('plan.upgrade', { plan: 'DEX Pro' })).toBe('Upgrade to DEX Pro');
  });

  it('t leaves missing vars as {name}', () => {
    expect(t('plan.upgrade')).toBe('Upgrade to {plan}');
  });

  it('registerStringTable extends locales', () => {
    registerStringTable({
      locale: 'es',
      entries: { 'common.ok': 'Aceptar', 'common.cancel': 'Cancelar' },
    });
    expect(t('common.ok', {}, 'es')).toBe('Aceptar');
    // Missing key in es falls back to en
    expect(t('common.save', {}, 'es')).toBe('Save');
  });

  it('language part is used when full locale is missing', () => {
    expect(lookupString('common.ok', 'es-MX')).toBe('Aceptar');
  });
});
