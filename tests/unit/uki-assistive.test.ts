// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseNoteRequest, parseSummarizeRequest, isReasoningRequest, summarizeText, describeReasoning } from '../../src/renderer/uki/assistive';

describe('UKI notes', () => {
  it('understands natural note requests', () => {
    expect(parseNoteRequest('take a note that the meeting moved to 3pm')).toBe('the meeting moved to 3pm');
    expect(parseNoteRequest('make a note: buy milk')).toBe('buy milk');
    expect(parseNoteRequest('note: call Ada on Friday')).toBe('call Ada on Friday');
    expect(parseNoteRequest('write down the wifi password is on the router')).toBe('the wifi password is on the router');
    expect(parseNoteRequest('remember that the keys are in the drawer')).toBe('the keys are in the drawer');
    expect(parseNoteRequest('add to my notes: renew passport')).toBe('renew passport');
  });
  it('leaves other sentences alone', () => {
    expect(parseNoteRequest('open notes')).toBeNull();
    expect(parseNoteRequest('what is a note in music')).toBeNull();
    expect(parseNoteRequest('notebook prices')).toBeNull();
  });
});

describe('UKI summaries', () => {
  it('finds the target', () => {
    expect(parseSummarizeRequest('summarize this')).toEqual({ kind: 'screen' });
    expect(parseSummarizeRequest('summarise the page')).toEqual({ kind: 'screen' });
    expect(parseSummarizeRequest('summarize my clipboard')).toEqual({ kind: 'clipboard' });
    expect(parseSummarizeRequest('summarize that')).toEqual({ kind: 'last' });
    expect(parseSummarizeRequest('summarize: Cats sleep a lot. They also purr.')).toEqual({ kind: 'text', text: 'Cats sleep a lot. They also purr' });
    expect(parseSummarizeRequest('open summary app')).toBeNull();
  });
  it('keeps the most representative sentences in order', () => {
    const text = 'Solar power is growing fast worldwide. Panels are cheaper every year. '
      + 'My cat likes boxes. Solar panels now beat coal on cost in most countries. '
      + 'Storage for solar power is the next challenge. The weather was nice.';
    const out = summarizeText(text, 2);
    expect(out).toContain('Solar');
    expect(out).not.toContain('cat');
    expect(out.split(/(?<=\.)\s/).length).toBe(2);
    expect(summarizeText('One line only.')).toBe('One line only.');
  });
});

describe('UKI reasoning only on request', () => {
  it('recognises the ask', () => {
    expect(isReasoningRequest('show your thinking')).toBe(true);
    expect(isReasoningRequest('How did you get that?')).toBe(true);
    expect(isReasoningRequest('explain your reasoning')).toBe(true);
    expect(isReasoningRequest('show my notes')).toBe(false);
  });
  it('describes steps without internal noise', () => {
    expect(describeReasoning(['Context: foreground=home', 'Probing internal system tools', 'Answered from internal system tool'], 'system-tool'))
      .toBe('Here is how I got there:\n1. Probing internal system tools\n2. Answered from internal system tool');
    expect(describeReasoning([], 'math')).toContain('math');
  });
});
