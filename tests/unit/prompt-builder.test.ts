import { describe, it, expect } from 'vitest';
import { buildPrompt, promptTokens } from '../../src/shared/uki/promptBuilder';

describe('prompt builder', () => {
  it('assembles system, context, history and user', () => {
    const r = buildPrompt({
      system: 'sys', context: 'ctx',
      history: [{ role: 'user', content: 'h1' }, { role: 'assistant', content: 'h2' }],
      user: 'hello',
    }, 10_000);
    expect(r.messages).toHaveLength(5);
    expect(r.messages[0]).toMatchObject({ role: 'system', content: 'sys' });
    expect(r.messages[4]).toMatchObject({ role: 'user', content: 'hello' });
    expect(r.droppedHistory).toBe(0);
  });

  it('drops oldest history to fit, keeping pinned messages', () => {
    const r = buildPrompt({
      system: 's',
      user: 'u',
      history: [
        { role: 'user', content: 'x'.repeat(400) },
        { role: 'assistant', content: 'y'.repeat(400) },
      ],
    }, 30);
    expect(r.droppedHistory).toBe(2);
    expect(r.messages.map((m) => m.content)).toEqual(['s', 'u']);
    expect(r.tokens).toBeLessThanOrEqual(30);
  });

  it('always keeps the latest user message even over budget', () => {
    const r = buildPrompt({ user: 'z'.repeat(400) }, 5);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].role).toBe('user');
  });

  it('promptTokens reports cost', () => {
    const r = buildPrompt({ user: 'abcd' }, 1000);
    expect(promptTokens(r.messages)).toBe(5); // 1 token + 4 overhead
  });
});
