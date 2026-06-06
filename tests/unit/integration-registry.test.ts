// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  getIntegration,
  listByCategory,
  validateConnection,
  INTEGRATIONS,
} from '../../src/shared/integrations/registry';

describe('Third-party integration registry', () => {
  it('looks up integrations by id', () => {
    expect(getIntegration('github')?.category).toBe('vcs');
    expect(getIntegration('figma')?.auth).toBe('oauth');
    expect(getIntegration('not-real')).toBeUndefined();
  });

  it('lists integrations by category', () => {
    const comm = listByCategory('communication').map((i) => i.id);
    expect(comm).toContain('slack');
    expect(comm).toContain('gmail');
    expect(listByCategory('storage').map((i) => i.id)).toContain('dropbox');
  });

  it('validates a connection request', () => {
    expect(validateConnection('github', 'ghp_x').ok).toBe(true);
    expect(validateConnection('github', '   ').ok).toBe(false);
    expect(validateConnection('unknown', 'x').ok).toBe(false);
  });

  it('every integration declares the required fields', () => {
    for (const i of INTEGRATIONS) {
      expect(Boolean(i.id && i.name && i.category && i.auth)).toBe(true);
    }
    expect(INTEGRATIONS.length).toBeGreaterThanOrEqual(10);
  });
});
