import { describe, it, expect } from 'vitest';
import { capitalize, titleCase, sentenceCase, camelToWords, humanize } from '../../src/shared/text/titleCase';

describe('text case', () => {
  it('capitalize', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('')).toBe('');
  });

  it('titleCase', () => {
    expect(titleCase('hello world')).toBe('Hello World');
    expect(titleCase('the QUICK fox')).toBe('The Quick Fox');
  });

  it('sentenceCase', () => {
    expect(sentenceCase('HELLO world')).toBe('Hello world');
  });

  it('camelToWords', () => {
    expect(camelToWords('helloWorld')).toBe('hello world');
    expect(camelToWords('myFileName')).toBe('my file name');
  });

  it('humanize kebab/snake', () => {
    expect(humanize('user_id')).toBe('User Id');
    expect(humanize('my-file-name')).toBe('My File Name');
  });
});
