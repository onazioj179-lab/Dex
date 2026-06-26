// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { spinnerVerb, spinnerPoolId } from '../../src/renderer/uki/spinnerVerbs';

describe('UKI spinner verbs', () => {
  it('falls back to the general pool when no step context applies', () => {
    expect(spinnerPoolId(undefined)).toBe('general');
    expect(spinnerPoolId('')).toBe('general');
    expect(spinnerPoolId('some unrelated note')).toBe('general');
  });

  it('maps tool steps to a context pool (Siri-style honesty)', () => {
    expect(spinnerPoolId('Tool: web_search {"query":"news"}')).toBe('web');
    expect(spinnerPoolId('Tool: open_app {"id":"notes"}')).toBe('open');
    expect(spinnerPoolId('Tool: close_app {"id":"notes"}')).toBe('close');
    expect(spinnerPoolId('Tool: get_context')).toBe('context');
    expect(spinnerPoolId('Tool: notify {"text":"hi"}')).toBe('notify');
    expect(spinnerPoolId('Tool: list_apps')).toBe('context');
  });

  it('maps reasoning steps to the right pool', () => {
    expect(spinnerPoolId('Detected tone: frustration')).toBe('tone');
    expect(spinnerPoolId('Matched slash command: open')).toBe('command');
    expect(spinnerPoolId('Max tool steps reached -- synthesising answer')).toBe('compose');
    expect(spinnerPoolId('Probing screen-read intent')).toBe('context');
  });

  it('rotates within a pool as the tick advances (Claude-style liveliness)', () => {
    const a = spinnerVerb(undefined, 0);
    const b = spinnerVerb(undefined, 1);
    expect(a).not.toBe(b); // consecutive ticks yield different verbs
  });

  it('is stable and wraps cleanly for any tick (incl. negative)', () => {
    const v0 = spinnerVerb('Tool: web_search', 0);
    expect(spinnerVerb('Tool: web_search', 0)).toBe(v0); // deterministic
    // Tick wraps modulo pool size, so a large or negative tick still resolves.
    expect(typeof spinnerVerb('Tool: web_search', 999)).toBe('string');
    expect(typeof spinnerVerb('Tool: web_search', -3)).toBe('string');
    expect(spinnerVerb('Tool: web_search', -3).length).toBeGreaterThan(0);
  });
});
