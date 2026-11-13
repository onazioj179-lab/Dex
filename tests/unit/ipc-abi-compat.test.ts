// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// WE DO NOT BREAK USERSPACE: the native IPC channel set is ABI. See
// docs/NATIVE_ABI.md and scripts/ipc-abi.mjs.
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script, no type declarations
import { computeAbi, readLock, checkAbi } from '../../scripts/ipc-abi.mjs';

describe('native IPC ABI (we do not break userspace)', () => {
  const abi = computeAbi();
  const lock = readLock();

  it('finds the native channel set (sanity: the scanner still works)', () => {
    expect(abi.native.length).toBeGreaterThan(1500);
    // A few channels every build has relied on for releases.
    for (const ch of ['app:getVersion', 'fs:readText', 'fs:writeText', 'ledger:accounts:archive']) {
      expect(abi.native).toContain(ch);
    }
  });

  it('serves renderer-local channels from rendererShims', () => {
    expect(abi.local).toContain('auth:biometricsAvailable');
    expect(abi.local).toContain('renderer:heartbeat');
  });

  it('no locked native channel was removed, and no new dead renderer call landed', () => {
    expect(checkAbi(abi, lock)).toEqual([]);
  });

  it('flags a removed channel as a userspace break', () => {
    const broken = { ...abi, native: abi.native.filter((c: string) => c !== 'fs:readText') };
    const problems = checkAbi(broken, lock);
    expect(problems.join('\n')).toMatch(/breaks userspace: fs:readText/);
  });

  it('flags a new renderer call nothing answers', () => {
    const calls = new Map(abi.calls);
    calls.set('nothing:answersThis', 'src/renderer/example.ts');
    const problems = checkAbi({ ...abi, calls, unhandled: [...abi.unhandled, 'nothing:answersThis'] }, lock);
    expect(problems.join('\n')).toMatch(/nothing:answersThis \(src\/renderer\/example\.ts\)/);
  });

  it('Quick Look reads text through a channel that exists', () => {
    expect(abi.unhandled).not.toContain('files:read');
  });
});
