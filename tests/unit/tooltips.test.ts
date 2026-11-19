// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { stripTitles, installTooltipSuppression, setTooltipsEnabled, tooltipsEnabled } from '../../src/renderer/services/tooltips';

describe('tooltips off by default', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; document.documentElement.removeAttribute('data-dex-tooltips'); });

  it('is off unless turned on', () => {
    expect(tooltipsEnabled()).toBe(false);
    setTooltipsEnabled(true);
    expect(tooltipsEnabled()).toBe(true);
    expect(document.documentElement.hasAttribute('data-dex-tooltips')).toBe(true);
    setTooltipsEnabled(false);
  });

  it('strips titles up the tree and keeps icon buttons named', () => {
    document.body.innerHTML = '<div title="Toolbar"><button title="Undo"><svg></svg></button><button title="Save">Save</button></div>';
    const [icon, text] = Array.from(document.querySelectorAll('button'));
    stripTitles(icon);
    expect(icon.hasAttribute('title')).toBe(false);
    expect(icon.getAttribute('aria-label')).toBe('Undo');
    expect(document.querySelector('div')!.hasAttribute('title')).toBe(false);
    stripTitles(text);
    expect(text.hasAttribute('aria-label')).toBe(false); // its text already names it
  });

  it('hovering removes the title only while tooltips are off', () => {
    installTooltipSuppression();
    document.body.innerHTML = '<button title="Redo">R</button>';
    const b = document.querySelector('button')!;
    b.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(b.hasAttribute('title')).toBe(false);
    setTooltipsEnabled(true);
    b.setAttribute('title', 'Redo');
    b.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(b.getAttribute('title')).toBe('Redo');
    setTooltipsEnabled(false);
  });
});
