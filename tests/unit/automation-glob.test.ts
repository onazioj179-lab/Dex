import { describe, it, expect } from 'vitest';
import { matchGlob, matchAnyGlob, filterByGlob } from '../../src/shared/automation/glob';

describe('automation glob', () => {
  it('matches * within a path segment only', () => {
    expect(matchGlob('*.mp4', 'trailer.mp4')).toBe(true);
    expect(matchGlob('*.mp4', 'a/trailer.mp4')).toBe(false); // * does not cross '/'
    expect(matchGlob('clip-*.png', 'clip-001.png')).toBe(true);
  });

  it('matches ** across separators', () => {
    expect(matchGlob('**/*.mov', 'a/b/c/take.mov')).toBe(true);
    expect(matchGlob('exports/**', 'exports/2026/final.mp4')).toBe(true);
  });

  it('matches ? as a single char', () => {
    expect(matchGlob('img_?.jpg', 'img_5.jpg')).toBe(true);
    expect(matchGlob('img_?.jpg', 'img_55.jpg')).toBe(false);
  });

  it('expands {a,b} alternation', () => {
    expect(matchGlob('*.{jpg,png,webp}', 'photo.png')).toBe(true);
    expect(matchGlob('*.{jpg,png}', 'photo.gif')).toBe(false);
  });

  it('treats regex metacharacters as literals', () => {
    expect(matchGlob('a.b+c.txt', 'a.b+c.txt')).toBe(true);
    expect(matchGlob('a.b+c.txt', 'axbxc.txt')).toBe(false);
  });

  it('matchAnyGlob and filterByGlob', () => {
    expect(matchAnyGlob(['*.png', '*.jpg'], 'x.jpg')).toBe(true);
    expect(filterByGlob('*.mp4', ['a.mp4', 'b.mov', 'c.mp4'])).toEqual(['a.mp4', 'c.mp4']);
  });
});
