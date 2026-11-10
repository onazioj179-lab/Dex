// =============================================================================
// DEX Platform — build serial ("7.0.1 (18a)")
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { formatDisplayVersion } from '../../src/renderer/utils/appVersion';
import pkg from '../../package.json';

describe('build serial', () => {
  it('is set in package.json as <number><letter>', () => {
    expect((pkg as { dexBuild?: string }).dexBuild).toMatch(/^\d+[a-z]$/);
  });
  it('shows next to the unchanged version number', () => {
    expect(formatDisplayVersion('7.0.1', '18a')).toBe('7.0.1 (18a)');
    expect(formatDisplayVersion('7.0.1', '')).toBe('7.0.1');
  });
});
