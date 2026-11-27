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

export type TrackedActivity = Readonly<ActivityEntry & { id: number }>;
type ContextState = Omit<WorkContext, 'recentActivity'> & { recentActivity: TrackedActivity[] };
type ContextSnapshot = Readonly<Omit<ContextState, 'openApps' | 'recentActivity'>> & {
  readonly openApps: readonly string[];
  readonly recentActivity: readonly TrackedActivity[];
};

const MAX_ACTIVITY = 20;

function emptyContext(): ContextState {
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
  private ctx = emptyContext();
  private snapshot: ContextSnapshot | undefined;
  private listeners = new Set<() => void>();
  private nextActivityId = 0;
  private now: () => number;

  /** `now` is injectable so activity timestamps are deterministic in tests. */
  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  setProject(project: string | null): void {
    if (this.ctx.project !== project) {
      this.ctx.project = project;
      if (project) this.recordActivity('project', project);
      else this.publish();
    }
  }

  setFile(file: string | null, record = true): void {
    if (this.ctx.file !== file) {
      this.ctx.file = file;
      if (file && record) this.recordActivity('file', file);
      else this.publish();
    }
  }

  setWorkspace(workspace: string | null): void {
    if (this.ctx.workspace === workspace) return;
    this.ctx.workspace = workspace;
    this.publish();
  }

  setTask(task: string | null): void {
    if (this.ctx.task === task) return;
    this.ctx.task = task;
    this.publish();
  }

  /** Replace the set of open apps (deduped, order preserved). */
  setOpenApps(apps: readonly string[]): void {
    const names = [...new Set(apps)];
    const previous = this.ctx.openApps;
    if (names.length === previous.length && names.every((name, i) => name === previous[i])) return;
    this.ctx.openApps = names;
    this.publish();
  }

  /** Append a recent-activity entry (newest first, bounded). */
  recordActivity(kind: string, target: string): void {
    this.ctx.recentActivity.unshift(Object.freeze({ id: this.nextActivityId++, kind, target, at: this.now() }));
    if (this.ctx.recentActivity.length > MAX_ACTIVITY) {
      this.ctx.recentActivity.length = MAX_ACTIVITY;
    }
    this.publish();
  }

  private publish(): void {
    this.snapshot = undefined;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Stable until context changes, with copies made only when read. */
  getSnapshot = (): ContextSnapshot => {
    if (!this.snapshot) {
      this.snapshot = Object.freeze({
        ...this.ctx,
        openApps: Object.freeze([...this.ctx.openApps]),
        recentActivity: Object.freeze([...this.ctx.recentActivity]),
      });
    }
    return this.snapshot;
  };

  /** A snapshot copy of the current context. */
  getContext(): WorkContext {
    return {
      ...this.ctx,
      openApps: [...this.ctx.openApps],
      recentActivity: this.ctx.recentActivity.map(({ kind, target, at }) => ({ kind, target, at })),
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
    this.publish();
  }
}

/** Shared renderer-wide context engine instance. */
export const contextEngine = new ContextEngine();
