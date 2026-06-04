import { describe, it, expect } from 'vitest';
import { extractMentions, extractTags, extractWikiLinks, extractUrls, extractRefs } from '../../src/shared/uki/mentions';

describe('mentions', () => {
  it('extracts @mentions (de-duped, not emails)', () => {
    expect(extractMentions('hi @alice and @bob, @alice again')).toEqual(['alice', 'bob']);
    expect(extractMentions('email foo@bar.com')).toEqual([]); // not a mention
  });

  it('extracts #tags', () => {
    expect(extractTags('#design #ux #design')).toEqual(['design', 'ux']);
  });

  it('extracts [[wiki links]]', () => {
    expect(extractWikiLinks('see [[Project X]] and [[Notes]]')).toEqual(['Project X', 'Notes']);
  });

  it('extracts URLs', () => {
    expect(extractUrls('visit https://x.io and http://y.com here')).toEqual(['https://x.io', 'http://y.com']);
  });

  it('extractRefs returns all kinds', () => {
    const refs = extractRefs('@a #b [[c]] https://d.io');
    expect(refs).toEqual({ mentions: ['a'], tags: ['b'], wikiLinks: ['c'], urls: ['https://d.io'] });
  });
});
