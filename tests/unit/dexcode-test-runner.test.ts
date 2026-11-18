// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { projectFor, summarizeTestOutput } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/testRunner';

const proj = (name: string, root: string) => ({ name, root, kinds: ['node'], manifests: ['package.json'], testCommand: 'npm test', buildCommand: null, scripts: [], hasGit: false, modified: 0 });

describe('DEX Code test runner', () => {
  it('finds the deepest project that owns a folder, case- and slash-insensitive', () => {
    const ps = [proj('mono', 'C:/w/mono'), proj('pkg', 'C:/w/mono/packages/pkg')];
    expect(projectFor('c:/w/mono/packages/pkg/src', ps)?.name).toBe('pkg');
    expect(projectFor('C:/w/mono/docs', ps)?.name).toBe('mono');
    expect(projectFor('C:/w/monorepo', ps)).toBeNull();
  });

  it('reads real runner summaries', () => {
    expect(summarizeTestOutput(' Test Files  2 passed (2)\n      Tests  1 failed | 33 passed | 2 skipped (36)')).toMatchObject({ framework: 'vitest', passed: 33, failed: 1, skipped: 2 });
    expect(summarizeTestOutput('\x1b[32m      Tests  12 passed\x1b[0m (12)')).toMatchObject({ passed: 12, failed: 0 });
    expect(summarizeTestOutput('Tests:       2 failed, 40 passed, 42 total')).toMatchObject({ framework: 'jest', failed: 2, passed: 40 });
    expect(summarizeTestOutput('test result: ok. 11 passed; 0 failed; 0 ignored\ntest result: FAILED. 3 passed; 1 failed; 2 ignored')).toMatchObject({ framework: 'cargo', passed: 14, failed: 1, skipped: 2 });
    expect(summarizeTestOutput('===== 1 failed, 9 passed, 1 skipped in 0.42s =====')).toMatchObject({ framework: 'pytest', failed: 1, passed: 9, skipped: 1 });
    expect(summarizeTestOutput('ok  \texample.com/a\t0.1s\nFAIL\texample.com/b\t0.2s')).toMatchObject({ passed: 1, failed: 1 });
    expect(summarizeTestOutput('Build finished')).toBeNull();
  });
});
