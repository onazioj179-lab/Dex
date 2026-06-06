// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { appCategory, groupByCategory } from '../../src/shared/dock/appCategories';

describe('Dock 2.0 smart grouping', () => {
  it('categorizes known apps; unknown -> other', () => {
    expect(appCategory('canvas')).toBe('creative');
    expect(appCategory('Terminal')).toBe('development'); // case-insensitive
    expect(appCategory('browser')).toBe('communication');
    expect(appCategory('files')).toBe('utility');
    expect(appCategory('some-new-plugin')).toBe('other');
  });

  it('groups apps in category order, preserving within-group order', () => {
    const groups = groupByCategory(['files', 'canvas', 'terminal', 'settings']);
    expect(groups.map((g) => g.category)).toEqual(['creative', 'development', 'utility']);
    expect(groups[0].apps).toEqual(['canvas']);
    expect(groups.find((g) => g.category === 'utility')!.apps).toEqual(['files', 'settings']);
  });

  it('omits empty categories and labels groups', () => {
    const groups = groupByCategory(['files']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'utility', label: 'Utility', apps: ['files'] });
  });
});
