// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { budgetMessages } from '../../src/shared/uki/contextBudget';
import { totalTokens } from '../../src/shared/uki/contextFit';

const m = (role: string, content: string) => ({ role, content });
const big = (n: number, ch = 'x') => ch.repeat(n);

describe('UKI context budget', () => {
  it('leaves a conversation that fits untouched', () => {
    const msgs = [m('system', 'sys'), m('user', 'hi')];
    const r = budgetMessages(msgs, { windows: [8192] });
    expect(r.messages).toEqual(msgs);
    expect(r.report.dropped + r.report.truncated + r.report.deduplicated).toBe(0);
  });

  it('uses the smallest candidate window, keeps the system prompt and the current turn', () => {
    const msgs = [m('system', 'You are UKI.'), ...Array.from({ length: 40 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `turn ${i} ${big(800)}`)), m('user', 'the question now')];
    const r = budgetMessages(msgs, { windows: [1_000_000, 8192], responseTokens: 600 });
    expect(r.report.windowTokens).toBe(8192);
    expect(r.report.afterTokens).toBeLessThanOrEqual(r.report.budgetTokens);
    expect(r.messages[0].content).toBe('You are UKI.');
    expect(r.messages.at(-1)!.content).toBe('the question now');
    expect(r.messages.some((x) => /earlier message\(s\) were left out/.test(x.content))).toBe(true);
    // The newest history is what survives.
    expect(r.messages.some((x) => x.content.startsWith('turn 39'))).toBe(true);
    expect(r.messages.some((x) => x.content.startsWith('turn 0 '))).toBe(false);
  });

  it('bounds a huge tool result instead of dropping the whole conversation, and says so', () => {
    const msgs = [m('system', 's'), m('user', 'read the log'), m('assistant', `RESULT ${big(60_000, 'a')}END`), m('user', 'what failed?')];
    const r = budgetMessages(msgs, { windows: [8192] });
    const tool = r.messages.find((x) => x.content.startsWith('RESULT'))!;
    expect(tool).toBeTruthy();
    expect(tool.content).toMatch(/characters left out/);
    expect(tool.content.endsWith('END')).toBe(true);
    expect(r.report.truncated).toBe(1);
    expect(totalTokens(r.messages)).toBeLessThanOrEqual(r.report.budgetTokens);
  });

  it('drops exact duplicate messages first', () => {
    const dup = `RESULT ${big(9000)}`;
    const msgs = [m('system', 's'), m('assistant', dup), m('assistant', dup), m('assistant', dup), m('user', 'go')];
    const r = budgetMessages(msgs, { windows: [8192] });
    expect(r.report.deduplicated).toBe(2);
  });

  it('falls back to a small default window when none is known', () => {
    const r = budgetMessages([m('system', 's'), m('user', big(200_000))], { windows: [] });
    expect(r.report.windowTokens).toBe(8192);
  });
});
