// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { topApps, formatTopApps } from '../../src/renderer/pages/taskManagerUki';

const procs = [
  { pid: 1, name: 'msedgewebview2.exe', memory: 300, cpu: 1 },
  { pid: 2, name: 'msedgewebview2.exe', memory: 500, cpu: 2 },
  { pid: 3, name: 'Code.exe', memory: 700, cpu: 9 },
  { pid: 4, name: 'svchost.exe', memory: 50, cpu: 0 },
];

describe('Task Manager for UKI', () => {
  it('adds up same-named processes into one app and ranks by memory', () => {
    const r = topApps(procs, 'memory', 2);
    expect(r.map((x) => [x.name, x.memory, x.count])).toEqual([['msedgewebview2', 800, 2], ['Code', 700, 1]]);
  });
  it('ranks by CPU and formats real units', () => {
    const r = topApps(procs, 'cpu', 1);
    expect(r[0].name).toBe('Code');
    expect(formatTopApps(topApps(procs, 'memory', 2), 'memory', 16384)).toBe('Top 2 by memory (system memory 16.0 GB):\n1. msedgewebview2: 800 MB, 3.0% CPU (2 processes)\n2. Code: 700 MB, 9.0% CPU');
    expect(formatTopApps([], 'cpu')).toBe('No processes were reported.');
  });
});
