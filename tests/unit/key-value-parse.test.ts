import { describe, it, expect } from 'vitest';
import { parseKeyValues, parseFrontmatter } from '../../src/shared/uki/keyValueParse';

describe('key value parse', () => {
  it('parses key: value lines', () => {
    expect(parseKeyValues('name: Project X\ntags: a, b\n# comment\nempty:')).toEqual({
      name: 'Project X', tags: 'a, b', empty: '',
    });
  });

  it('strips surrounding quotes from values', () => {
    expect(parseKeyValues('title: "Hello"')).toEqual({ title: 'Hello' });
  });

  it('parses frontmatter and body', () => {
    expect(parseFrontmatter('---\ntitle: Hi\nstatus: draft\n---\nBody here')).toEqual({
      data: { title: 'Hi', status: 'draft' },
      body: 'Body here',
    });
  });

  it('returns body unchanged when there is no frontmatter', () => {
    expect(parseFrontmatter('No frontmatter')).toEqual({ data: {}, body: 'No frontmatter' });
  });
});
