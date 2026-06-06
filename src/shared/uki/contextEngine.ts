// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI 3.0 Context Engine (GOAL-6D).
 *
 * Tracks the live work context — current project, file, workspace, task, open
 * apps, and recent activity — so UKI knows "what the user is building" without
 * asking repeatedly. Pure, stateful, dependency-free: the renderer feeds it
 * (file opened, project switched, app launched) and UKI reads `summarize()` to
 * seed prompts. Fully unit-testable.
 */

export interface ActivityEntry {
  kind: string;
  target: string;
  at: number;
}

export interface WorkContext {
  project: string | null;
  file: string | null;
  workspace: string | null;
  task: string | null;
  openApps: string[];
  recentActivity: ActivityEntry[];
}

const MAX_ACTIVITY = 20;

function emptyContext(): WorkContext {
  return {
    project: null,
    file: null,
    workspace: null,
    task: null,
    openApps: [],
    recentActivity: [],
  };
}

export class ContextEngine {
  private ctx: WorkContext = emptyContext();
  private now: () => number;

  /** `now` is injectable so activity timestamps are deterministic in tests. */
  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  setProject(project: string | null): void {
    if (this.ctx.project !== project) {
      this.ctx.project = project;
      if (project) this.recordActivity('project', project);
    }
  }

  setFile(file: string | null): void {
    if (this.ctx.file !== file) {
      this.ctx.file = file;
      if (file) this.recordActivity('file', file);
    }
  }

  setWorkspace(workspace: string | null): void {
    this.ctx.workspace = workspace;
  }

  setTask(task: string | null): void {
    this.ctx.task = task;
  }

  /** Replace the set of open apps (deduped, order preserved). */
  setOpenApps(apps: readonly string[]): void {
    const seen = new Set<string>();
    this.ctx.openApps = apps.filter((a) => (seen.has(a) ? false : (seen.add(a), true)));
  }

  /** Append a recent-activity entry (newest first, bounded). */
  recordActivity(kind: string, target: string): void {
    this.ctx.recentActivity.unshift({ kind, target, at: this.now() });
    if (this.ctx.recentActivity.length > MAX_ACTIVITY) {
      this.ctx.recentActivity.length = MAX_ACTIVITY;
    }
  }

  /** A snapshot copy of the current context. */
  getContext(): WorkContext {
    return {
      ...this.ctx,
      openApps: [...this.ctx.openApps],
      recentActivity: this.ctx.recentActivity.map((a) => ({ ...a })),
    };
  }

  /** A compact prompt-ready summary of the live context (empty when nothing known). */
  summarize(): string {
    const parts: string[] = [];
    if (this.ctx.project) parts.push(`Project: ${this.ctx.project}`);
    if (this.ctx.workspace) parts.push(`Workspace: ${this.ctx.workspace}`);
    if (this.ctx.file) parts.push(`Active file: ${this.ctx.file}`);
    if (this.ctx.task) parts.push(`Task: ${this.ctx.task}`);
    if (this.ctx.openApps.length) parts.push(`Open apps: ${this.ctx.openApps.join(', ')}`);
    if (this.ctx.recentActivity.length) {
      const recent = this.ctx.recentActivity
        .slice(0, 5)
        .map((a) => `${a.kind}:${a.target}`)
        .join(', ');
      parts.push(`Recent: ${recent}`);
    }
    return parts.join('\n');
  }

  clear(): void {
    this.ctx = emptyContext();
  }
}

/** Shared renderer-wide context engine instance. */
export const contextEngine = new ContextEngine();
