// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { splitSentences, firstSentences, sentenceCount } from '../../src/shared/uki/sentences';

describe('uki sentences', () => {
  it('splits on . ! ?', () => {
    expect(splitSentences('Hello world. How are you? I am fine!')).toEqual([
      'Hello world.', 'How are you?', 'I am fine!',
    ]);
  });

  it('does not split inside decimals', () => {
    expect(splitSentences('Pi is 3.14 exactly.')).toEqual(['Pi is 3.14 exactly.']);
  });

  it('does not split after common abbreviations', () => {
    expect(splitSentences('Dr. Smith left.')).toEqual(['Dr. Smith left.']);
  });

  it('handles trailing text without terminator', () => {
    expect(splitSentences('First. Second')).toEqual(['First.', 'Second']);
    expect(splitSentences('')).toEqual([]);
  });

  it('firstSentences and sentenceCount', () => {
    const text = 'One. Two. Three.';
    expect(firstSentences(text, 2)).toBe('One. Two.');
    expect(sentenceCount(text)).toBe(3);
  });
});
