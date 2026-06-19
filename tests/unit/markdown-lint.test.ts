// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Markdown linting (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { lintMarkdown } from '../../src/shared/format/markdownLint';

describe('lintMarkdown', () => {
  it('returns no issues for clean markdown', () => {
    const md = '# Title\n\n## Section\n\nText with a [good link](https://x.com) and ![alt](img.png).\n';
    expect(lintMarkdown(md)).toEqual([]);
  });

  it('flags a heading level skip', () => {
    const issues = lintMarkdown('# A\n### C\n');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ line: 2 });
    expect(issues[0].message).toContain('h1');
    expect(issues[0].message).toContain('h3');
  });

  it('flags links and images with no URL', () => {
    const issues = lintMarkdown('[text]()\n![alt]()\n');
    expect(issues.map(i => i.message)).toEqual(['Link has no URL', 'Image has no source URL']);
  });

  it('flags a link with empty text but not an image with empty alt', () => {
    const issues = lintMarkdown('[](https://x.com)\n![](logo.png)\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('Link has empty text');
  });

  it('detects an unbalanced code fence', () => {
    const issues = lintMarkdown('text\n```js\nconst x = 1;\n');
    expect(issues.some(i => i.message.includes('Unclosed code block'))).toBe(true);
  });

  it('does not lint content inside a balanced code fence', () => {
    // The "# not a heading skip" and "[x]()" live inside code -> ignored.
    const md = '# Real\n\n```\n###### deep\n[x]()\n```\n';
    expect(lintMarkdown(md)).toEqual([]);
  });
});
