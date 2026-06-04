import { describe, it, expect } from 'vitest';
import { countWords, countChars, readingTimeMinutes, textStats } from '../../src/shared/format/wordCount';

describe('word count', () => {
  it('counts words', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('  spaced   out  ')).toBe(2);
    expect(countWords('')).toBe(0);
    expect(countWords('one')).toBe(1);
  });

  it('counts characters with/without spaces', () => {
    expect(countChars('a b c', true)).toBe(5);
    expect(countChars('a b c', false)).toBe(3);
  });

  it('estimates reading time', () => {
    expect(readingTimeMinutes('word '.repeat(400).trim(), 200)).toBe(2);
    expect(readingTimeMinutes('', 200)).toBe(0);
    expect(readingTimeMinutes('hi', 200)).toBe(1); // min 1
  });

  it('builds full stats', () => {
    const s = textStats('Hello world. How are you?');
    expect(s.words).toBe(5);
    expect(s.sentences).toBe(2);
    expect(s.lines).toBe(1);
    expect(s.charsNoSpaces).toBe(21);
  });

  it('handles empty text', () => {
    expect(textStats('')).toMatchObject({ words: 0, lines: 0, sentences: 0, readingTimeMin: 0 });
  });
});
