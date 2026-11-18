// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UKI in Task Manager: "show the applications using the most memory". Processes
// with the same name (a browser's many helpers) are added up into one app, so
// the answer matches what people mean by "an app". Read-only; ending a process
// stays in Task Manager, behind its own confirmation. Pure; unit-tested.

export interface ProcRow { pid: number; name: string; cpu?: number; memory?: number }

export function topApps(procs: readonly ProcRow[], by: 'memory' | 'cpu', limit = 10) {
  const groups = new Map<string, { name: string; memory: number; cpu: number; count: number; pids: number[] }>();
  for (const p of procs) {
    const name = (p.name || 'unknown').replace(/\.exe$/i, '');
    const key = name.toLowerCase();
    const g = groups.get(key) ?? { name, memory: 0, cpu: 0, count: 0, pids: [] };
    g.memory += p.memory || 0; g.cpu += p.cpu || 0; g.count++; g.pids.push(p.pid);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name)).slice(0, Math.max(1, Math.min(50, limit)));
}

export function formatTopApps(rows: ReturnType<typeof topApps>, by: 'memory' | 'cpu', totalMb?: number): string {
  if (!rows.length) return 'No processes were reported.';
  const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`);
  const head = `Top ${rows.length} by ${by === 'memory' ? 'memory' : 'CPU'}${totalMb ? ` (system memory ${mb(totalMb)})` : ''}:`;
  return [head, ...rows.map((r, i) => `${i + 1}. ${r.name}: ${mb(r.memory)}, ${r.cpu.toFixed(1)}% CPU${r.count > 1 ? ` (${r.count} processes)` : ''}`)].join('\n');
}
