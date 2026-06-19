// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  classifyKnowledgeIntent,
  extractWeatherPlace,
  extractDefineWord,
  extractCurrency,
  extractTimezone,
  extractLookupTopic,
  groundingLine,
  type KnowledgeAnswer,
} from '../../src/renderer/uki/answerEngine';

describe('classifyKnowledgeIntent', () => {
  it('routes weather questions', () => {
    expect(classifyKnowledgeIntent("what's the weather in Tokyo")).toBe('weather');
    expect(classifyKnowledgeIntent('how hot is it in Cairo')).toBe('weather');
    expect(classifyKnowledgeIntent('Paris forecast')).toBe('weather');
  });

  it('routes currency conversions ahead of a generic lookup', () => {
    expect(classifyKnowledgeIntent('convert 100 usd to eur')).toBe('currency');
    expect(classifyKnowledgeIntent('how much is 50 dollars in pounds')).toBe('currency');
    expect(classifyKnowledgeIntent('what is 20 GBP in JPY')).toBe('currency');
  });

  it('routes time-in-place questions', () => {
    expect(classifyKnowledgeIntent('what time is it in London')).toBe('time');
    expect(classifyKnowledgeIntent('time in Asia/Tokyo')).toBe('time');
  });

  it('routes definitions', () => {
    expect(classifyKnowledgeIntent('define ephemeral')).toBe('define');
    expect(classifyKnowledgeIntent('what does serendipity mean')).toBe('define');
  });

  it('routes who/what-is lookups', () => {
    expect(classifyKnowledgeIntent('who is Ada Lovelace')).toBe('lookup');
    expect(classifyKnowledgeIntent('tell me about quantum computing')).toBe('lookup');
  });

  it('returns none for chit-chat and commands', () => {
    expect(classifyKnowledgeIntent('open notes')).toBe('none');
    expect(classifyKnowledgeIntent('hello there')).toBe('none');
    expect(classifyKnowledgeIntent('')).toBe('none');
  });

  it('is deterministic', () => {
    const q = 'what is the weather in Berlin';
    expect(classifyKnowledgeIntent(q)).toBe(classifyKnowledgeIntent(q));
  });
});

describe('extractWeatherPlace', () => {
  it('pulls the place after in/for/at', () => {
    expect(extractWeatherPlace("what's the weather in New York")).toBe('New York');
    expect(extractWeatherPlace('forecast for Cape Town')).toBe('Cape Town');
  });
  it('pulls a leading place', () => {
    expect(extractWeatherPlace('Tokyo weather')).toBe('Tokyo');
  });
  it('returns null when no place is given', () => {
    expect(extractWeatherPlace('what is the weather')).toBeNull();
  });
});

describe('extractDefineWord', () => {
  it('handles define / meaning of / what does X mean', () => {
    expect(extractDefineWord('define ephemeral')).toBe('ephemeral');
    expect(extractDefineWord('meaning of serendipity')).toBe('serendipity');
    expect(extractDefineWord('what does ubiquitous mean')).toBe('ubiquitous');
  });
  it('returns null for phrases it cannot reduce to a word', () => {
    expect(extractDefineWord('what is love')).toBeNull();
  });
});

describe('extractCurrency', () => {
  it('parses amount and both currencies (codes and words)', () => {
    expect(extractCurrency('convert 100 usd to eur')).toEqual({ amount: 100, from: 'USD', to: 'EUR' });
    expect(extractCurrency('how much is 50 dollars in pounds')).toEqual({ amount: 50, from: 'USD', to: 'GBP' });
    expect(extractCurrency('1,250 yen to usd')).toEqual({ amount: 1250, from: 'JPY', to: 'USD' });
  });
  it('returns null when it is not a conversion', () => {
    expect(extractCurrency('what is the weather')).toBeNull();
  });
});

describe('extractTimezone', () => {
  it('maps known cities to IANA zones', () => {
    expect(extractTimezone('what time is it in London')).toBe('Europe/London');
    expect(extractTimezone('time in New York')).toBe('America/New_York');
  });
  it('passes through an explicit IANA zone', () => {
    expect(extractTimezone('time in Asia/Tokyo')).toBe('Asia/Tokyo');
  });
  it('returns null for an unknown place', () => {
    expect(extractTimezone('time in Atlantis')).toBeNull();
  });
});

describe('extractLookupTopic', () => {
  it('strips the question stem and leading article', () => {
    expect(extractLookupTopic('who is Ada Lovelace')).toBe('Ada Lovelace');
    expect(extractLookupTopic('what is a black hole?')).toBe('black hole');
    expect(extractLookupTopic('tell me about photosynthesis')).toBe('photosynthesis');
  });
  it('returns null when there is no topic', () => {
    expect(extractLookupTopic('who is')).toBeNull();
  });
});

describe('groundingLine', () => {
  it('appends the source label when present', () => {
    const a: KnowledgeAnswer = { intent: 'lookup', text: 'A is B.', sourceLabel: 'Wikipedia' };
    expect(groundingLine(a)).toBe('A is B. (source: Wikipedia)');
  });
  it('returns the bare text without a source', () => {
    const a: KnowledgeAnswer = { intent: 'lookup', text: 'A is B.' };
    expect(groundingLine(a)).toBe('A is B.');
  });
});
