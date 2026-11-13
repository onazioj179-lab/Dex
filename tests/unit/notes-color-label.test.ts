// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { noteColorName } from '../../src/renderer/DEXAPPLICATIONS/notes/NotesComponents';

describe('Notes colour labels', () => {
  it('reads named labels and the raw values the row menu used to store', () => {
    expect(noteColorName('red')).toBe('red');
    expect(noteColorName('Yellow')).toBe('yellow');
    expect(noteColorName('var(--color-error)')).toBe('red');
    expect(noteColorName('#bf5af2')).toBe('purple'); // stored lower-case by the old menu
    expect(noteColorName('#FFD60A')).toBe('yellow');
  });

  it('has no name for colours outside the picker, or none at all', () => {
    expect(noteColorName('#64d2ff')).toBeNull();
    expect(noteColorName(null)).toBeNull();
    expect(noteColorName('')).toBeNull();
  });
});
