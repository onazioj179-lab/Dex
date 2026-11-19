// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore -- plain ESM script
import { computeBuildInfo } from '../../scripts/build-info.mjs';

describe('build identity', () => {
  it('is version+build.<commit count>, with the real commit and a UTC time', () => {
    const b = computeBuildInfo({}, new Date('2026-11-19T01:02:03.456Z'));
    expect(b.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(b.buildNumber).toBeGreaterThan(0);
    expect(b.buildId).toBe(`${b.version}+build.${b.buildNumber}`);
    expect(b.commit).toMatch(/^[0-9a-f]{12}(\+dirty)?$/);
    expect(b.channel).toBe('development');
    expect(b.builtAt).toBe('2026-11-19T01:02:03Z');
  });
  it('the same source gives the same number; CI can set it; unknown channels fall back', () => {
    expect(computeBuildInfo({}).buildNumber).toBe(computeBuildInfo({}).buildNumber);
    expect(computeBuildInfo({ DEX_BUILD_NUMBER: '4242', DEX_CHANNEL: 'stable' })).toMatchObject({ buildNumber: 4242, channel: 'stable' });
    expect(computeBuildInfo({ DEX_BUILD_NUMBER: 'abc', DEX_CHANNEL: 'nightly' }).channel).toBe('development');
  });
});
