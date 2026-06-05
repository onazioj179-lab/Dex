// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseSearchScope } from '../../src/renderer/services/searchScope';

describe('search scope parsing', () => {
  it('returns plain text when unscoped', () => {
    expect(parseSearchScope('budget report')).toEqual({ text: 'budget report' });
  });

  it('parses in:/kind:/type:/app: prefixes to kinds', () => {
    expect(parseSearchScope('in:notes meeting')).toEqual({ text: 'meeting', kinds: ['note'] });
    expect(parseSearchScope('kind:file budget')).toEqual({ text: 'budget', kinds: ['file'] });
    expect(parseSearchScope('app:prism')).toEqual({ text: 'prism', kinds: ['app'] });
  });

  it('maps plural/colloquial aliases', () => {
    expect(parseSearchScope('in:files x').kinds).toEqual(['file']);
    expect(parseSearchScope('kind:workflows y').kinds).toEqual(['action']);
    expect(parseSearchScope('type:commands z').kinds).toEqual(['command']);
  });

  it('collects multiple scopes and trims residual text', () => {
    const out = parseSearchScope('in:notes kind:file   quarterly  ');
    expect(out.text).toBe('quarterly');
    expect(out.kinds?.sort()).toEqual(['file', 'note']);
  });

  it('leaves unrecognised kind words as text', () => {
    expect(parseSearchScope('kind:banana split')).toEqual({ text: 'kind:banana split' });
  });
});
