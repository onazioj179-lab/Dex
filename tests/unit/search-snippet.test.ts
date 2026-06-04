import { describe, it, expect } from 'vitest';
import { extractSnippet } from '../../src/shared/search/snippet';

describe('search snippet', () => {
  it('returns short text unchanged', () => {
    expect(extractSnippet('a short note', 'note', 40)).toBe('a short note');
  });

  it('centers a window on the match with ellipses', () => {
    const text = 'lorem '.repeat(20) + 'TARGET ' + 'ipsum '.repeat(20);
    const snip = extractSnippet(text, 'target', 15);
    expect(snip).toContain('TARGET');
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip.length).toBeLessThan(text.length);
  });

  it('falls back to the start when nothing matches', () => {
    const text = 'word '.repeat(40);
    const snip = extractSnippet(text, 'zzz', 20);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip).not.toContain('zzz');
  });
});
