// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  isSafeRelPath, planUnpack, detectRuntime, canLocallyInstall, refusalHeadline,
} from '../../src/shared/store/localInstall';

describe('local install — path containment (untrusted envelope keys)', () => {
  it('accepts ordinary relative forward-slash paths', () => {
    expect(isSafeRelPath('index.html')).toBe(true);
    expect(isSafeRelPath('assets/app.js')).toBe(true);
    expect(isSafeRelPath('a/b/c/d.png')).toBe(true);
  });

  it('rejects traversal, absolute, drive, backslash, null, and empty segments', () => {
    expect(isSafeRelPath('../escape')).toBe(false);
    expect(isSafeRelPath('a/../../b')).toBe(false);
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('C:/Windows/system32')).toBe(false);
    expect(isSafeRelPath('a\\b')).toBe(false);
    expect(isSafeRelPath('a//b')).toBe(false);
    expect(isSafeRelPath('a/./b')).toBe(false);
    expect(isSafeRelPath('bad\0name')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
  });

  it('planUnpack returns a sorted entry list for a safe envelope', () => {
    const plan = planUnpack({ 'b.js': 'Yg==', 'a.html': 'YQ==' });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.entries.map((e) => e.relPath)).toEqual(['a.html', 'b.js']);
  });

  it('planUnpack fails closed on any unsafe path or empty set', () => {
    const bad = planUnpack({ 'ok.js': 'YQ==', '../evil': 'YQ==' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain('../evil');
    expect(planUnpack({}).ok).toBe(false);
  });
});

describe('local install — runtime detection (all kinds)', () => {
  it('honours an explicit web/native runtime in the manifest', () => {
    expect(detectRuntime({ runtime: 'native', entry: 'magnify.exe' }, {}).runtime).toBe('native');
    expect(detectRuntime({ runtime: 'web' }, { 'index.html': 'x' }).runtime).toBe('web');
  });

  it('infers web from an index.html and native otherwise', () => {
    expect(detectRuntime({}, { 'index.html': 'x', 'app.js': 'y' })).toEqual({ runtime: 'web', entry: 'index.html' });
    const nested = detectRuntime({}, { 'web/index.html': 'x' });
    expect(nested.runtime).toBe('web');
    expect(nested.entry).toBe('web/index.html');
    expect(detectRuntime({}, { 'magnify.bin': 'x' }).runtime).toBe('native');
  });

  it('infers from a declared entry extension when no runtime is set', () => {
    expect(detectRuntime({ entry: 'ui/index.html' }, {}).runtime).toBe('web');
    expect(detectRuntime({ main: 'bin/magnify' }, {}).runtime).toBe('native');
  });
});

describe('local install — full production gate (approved only)', () => {
  it('allows only an approved report', () => {
    expect(canLocallyInstall({ status: 'approved' })).toBe(true);
    expect(canLocallyInstall({ status: 'pending' })).toBe(false);
    expect(canLocallyInstall({ status: 'rejected' })).toBe(false);
  });

  it('gives a distinct refusal headline per status', () => {
    expect(refusalHeadline('rejected')).toMatch(/rejected/i);
    expect(refusalHeadline('pending')).toMatch(/metadata/i);
  });
});
