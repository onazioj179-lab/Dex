// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { detectEmotion, isDateQuestion, isLocalTimeQuestion } from '../../src/renderer/uki/localIntents';

describe('UKI local time / date', () => {
  it('answers the common ways of asking the time', () => {
    for (const q of ['what time is it', 'What time is it?', "what's the time", 'what is the time now', 'time', 'current time',
      'tell me the time', 'hey uki, what time is it', 'what tiem is it', 'do you know the time']) {
      expect(isLocalTimeQuestion(q), q).toBe(true);
    }
  });
  it('leaves world-time and unrelated questions alone', () => {
    for (const q of ['what time is it in tokyo', 'time in london', 'what time does the store close', 'timer 5m', 'times table of 7']) {
      expect(isLocalTimeQuestion(q), q).toBe(false);
    }
  });
  it('answers date questions', () => {
    for (const q of ["what's the date", "what is today's date", 'what date is it', 'today', 'date?']) {
      expect(isDateQuestion(q), q).toBe(true);
    }
    expect(isDateQuestion('date night ideas')).toBe(false);
  });
});

describe('UKI tone', () => {
  it('ordinary questions are neutral (no "let me explain" prefix)', () => {
    for (const q of ['what time is it', 'how do I open notes', 'explain quantum computing', 'what is the capital of France', 'help me write an email']) {
      expect(detectEmotion(q), q).toBe('neutral');
    }
  });
  it('still hears clear signals', () => {
    expect(detectEmotion('thanks!')).toBe('happiness');
    expect(detectEmotion('ugh this is broken')).toBe('frustration');
    expect(detectEmotion("I'm feeling down today")).toBe('sadness');
    expect(detectEmotion("I don't understand")).toBe('confusion');
    expect(detectEmotion('I would love to know the weather in Paris tomorrow please')).toBe('neutral');
  });
});
