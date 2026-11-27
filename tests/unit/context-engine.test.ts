// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { ContextEngine } from '../../src/shared/uki/contextEngine';

describe('UKI 3.0 ContextEngine', () => {
  it('tracks project/file/workspace/task + open apps', () => {
    const e = new ContextEngine(() => 1000);
    e.setProject('DEX');
    e.setFile('main.rs');
    e.setWorkspace('Engineering');
    e.setTask('migration');
    e.setOpenApps(['files', 'dexcode', 'files']); // deduped

    const ctx = e.getContext();
    expect(ctx.project).toBe('DEX');
    expect(ctx.file).toBe('main.rs');
    expect(ctx.workspace).toBe('Engineering');
    expect(ctx.task).toBe('migration');
    expect(ctx.openApps).toEqual(['files', 'dexcode']);
  });

  it('records project/file changes as recent activity (newest first, bounded)', () => {
    let t = 0;
    const e = new ContextEngine(() => ++t);
    e.setProject('A');
    e.setFile('a.ts');
    e.setFile('b.ts');
    const ctx = e.getContext();
    // newest first
    expect(ctx.recentActivity[0]).toMatchObject({ kind: 'file', target: 'b.ts' });
    expect(ctx.recentActivity.some((a) => a.kind === 'project' && a.target === 'A')).toBe(true);

    for (let i = 0; i < 50; i++) e.recordActivity('tick', String(i));
    expect(e.getContext().recentActivity.length).toBe(20); // bounded
  });

  it('does not double-record an unchanged file', () => {
    const e = new ContextEngine(() => 1);
    e.setFile('x.ts');
    e.setFile('x.ts'); // no change
    expect(e.getContext().recentActivity.filter((a) => a.kind === 'file').length).toBe(1);
  });

  it('summarize() is prompt-ready and empty when nothing is known', () => {
    const e = new ContextEngine(() => 1);
    expect(e.summarize()).toBe('');
    e.setProject('DEX');
    e.setFile('main.rs');
    e.setOpenApps(['files']);
    const s = e.summarize();
    expect(s).toContain('Project: DEX');
    expect(s).toContain('Active file: main.rs');
    expect(s).toContain('Open apps: files');
  });

  it('clear() resets everything', () => {
    const e = new ContextEngine(() => 1);
    e.setProject('DEX');
    e.recordActivity('x', 'y');
    e.clear();
    expect(e.getContext()).toEqual({
      project: null, file: null, workspace: null, task: null, openApps: [], recentActivity: [],
    });
  });

  it('publishes stable snapshots only when context changes', () => {
    const e = new ContextEngine(() => 1);
    const listener = vi.fn(e.getSnapshot);
    const unsubscribe = e.subscribe(listener);
    const empty = e.getSnapshot();

    e.setOpenApps(['Notes', 'Notes']);
    e.setOpenApps(['Notes']);
    e.setWorkspace(null);
    const withApps = e.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toBe(withApps);
    expect(withApps.openApps).toEqual(['Notes']);
    expect(empty.openApps).toEqual([]);

    e.setFile('report.dex', false);
    expect(e.getSnapshot().recentActivity).toEqual([]);
    e.recordActivity('save', 'report.dex');
    const saved = e.getSnapshot().recentActivity[0];
    e.recordActivity('save', 'report.dex');
    expect(e.getSnapshot().recentActivity[1]).toBe(saved);
    expect(e.getSnapshot().recentActivity[0].id).not.toBe(saved.id);
    expect(e.getContext().recentActivity[0]).toEqual({ kind: 'save', target: 'report.dex', at: 1 });

    unsubscribe();
    listener.mockClear();
    e.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});
