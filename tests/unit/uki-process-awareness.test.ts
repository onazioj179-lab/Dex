// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { parseProcessQuestion, formatProcessAnswer, runProcessTool, type ProcessDigest } from '../../src/renderer/uki/processTools';

const digest = (over: Partial<ProcessDigest> = {}): ProcessDigest => ({
  processes: 1243, programs: 187, cpu: 23.4, memoryMb: 11_800, totalMemoryMb: 16_384,
  kinds: { app: { count: 21, memoryMb: 6000 }, background: { count: 1209, memoryMb: 5300 }, dex: { count: 13, memoryMb: 500 } },
  topCpu: [
    { name: 'chrome.exe', count: 46, cpu: 12.5, memoryMb: 4200, windowed: true },
    { name: 'MsMpEng.exe', count: 1, cpu: 4.1, memoryMb: 310, windowed: false },
  ],
  topMemory: [
    { name: 'chrome.exe', count: 46, cpu: 12.5, memoryMb: 4200, windowed: true },
    { name: 'Code.exe', count: 18, cpu: 1.2, memoryMb: 1900, windowed: true },
  ],
  ...over,
});

describe('UKI process awareness', () => {
  it('recognises process questions', () => {
    expect(parseProcessQuestion("What's using my CPU?")).toEqual({ kind: 'cpu' });
    expect(parseProcessQuestion('why is my pc so slow')).toEqual({ kind: 'cpu' });
    expect(parseProcessQuestion('what is using the most memory')).toEqual({ kind: 'memory' });
    expect(parseProcessQuestion('which app is a ram hog')).toEqual({ kind: 'memory' });
    expect(parseProcessQuestion('how many processes are running')).toEqual({ kind: 'count' });
    expect(parseProcessQuestion('is zoom running?')).toEqual({ kind: 'running', name: 'zoom' });
    expect(parseProcessQuestion('is the steam client still open')).toEqual({ kind: 'running', name: 'steam client' });
    expect(parseProcessQuestion('show me the top processes')).toEqual({ kind: 'overview' });
    expect(parseProcessQuestion('what is the capital of France')).toBeNull();
    expect(parseProcessQuestion('remind me to call mum')).toBeNull();
  });

  it('answers with totals and programs added up, in real units', () => {
    const cpu = formatProcessAnswer(digest(), { kind: 'cpu' });
    expect(cpu).toContain('1,243 processes from 187 programs; CPU 23.4%, memory 11.5 GB of 16.0 GB.');
    expect(cpu).toContain('1. chrome.exe (46 processes): 12.5% CPU, 4.1 GB');
    expect(formatProcessAnswer(digest(), { kind: 'memory' })).toContain('2. Code.exe (18 processes): 1.9 GB, 1.2% CPU');
    expect(formatProcessAnswer(digest(), { kind: 'count' })).toContain('21 with a window, 1209 in the background, 13 belong to DEX');
  });

  it('says whether a program is running, with PIDs', () => {
    const yes = formatProcessAnswer(digest({ matches: [{ name: 'Zoom.exe', count: 3, cpu: 2, memoryMb: 600, windowed: true, pids: [10, 11, 12] }] }), { kind: 'running', name: 'zoom' });
    expect(yes).toBe('Yes: Zoom.exe (3 processes) is running, 600 MB, 2% CPU (PID 10, 11, 12).');
    expect(formatProcessAnswer(digest({ matches: [] }), { kind: 'running', name: 'zoom' })).toBe('No process matching "zoom" is running.');
  });

  it('the tool stays short however many processes there are', async () => {
    const many = digest({ processes: 5000, programs: 900, topCpu: Array.from({ length: 8 }, (_, i) => ({ name: `p${i}.exe`, count: 9, cpu: 8 - i, memoryMb: 100, windowed: false })) });
    const invoke = vi.fn().mockResolvedValue(many);
    const out = await runProcessTool({ by: 'cpu' }, invoke);
    expect(invoke).toHaveBeenCalledWith('system:processDigest', {});
    expect(out.split('\n').length).toBeLessThanOrEqual(7);
    expect(out.length).toBeLessThan(600);
    await runProcessTool({ name: 'zoom' }, invoke);
    expect(invoke).toHaveBeenLastCalledWith('system:processDigest', { query: 'zoom' });
    expect(await runProcessTool({}, vi.fn().mockResolvedValue(null))).toMatch(/not available/);
  });
});
