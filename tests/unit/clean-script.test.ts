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
import { checkCandidate, CANDIDATES, PROTECTED } from '../../scripts/clean.mjs';

describe('safe cleanup rules', () => {
  it('refuses protected, tracked, unignored and outside paths', () => {
    expect(checkCandidate('src')).toBe('protected path');
    expect(checkCandidate('src-tauri/target/release')).toBe('protected path');
    expect(checkCandidate('node_modules')).toBe('protected path');
    expect(checkCandidate('../elsewhere')).toBe('outside the repository');
    expect(checkCandidate('package.json')).not.toBeNull(); // tracked / not ignored
    expect(checkCandidate('definitely-not-here-xyz')).toBe('not present');
  });
  it('never lists release builds, sources or user data as candidates', () => {
    const rels: string[] = CANDIDATES.map((c: { rel: string }) => c.rel);
    for (const p of PROTECTED) expect(rels).not.toContain(p);
    expect(rels.some((r) => /release|bundle|AppData|\.git$/i.test(r))).toBe(false);
  });
});
