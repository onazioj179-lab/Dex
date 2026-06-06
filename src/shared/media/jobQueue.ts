// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Media job queue (ROADMAP-600 §3.U #592 transcode queue, #598 progress/cancel,
 * #600 job history). Pure, deterministic priority queue for background media
 * jobs (export, transcode, proxy, thumbnail) — the renderer drives the actual
 * encoding; this tracks state, ordering, progress and history.
 */

// DEX v6.0 — media job queue

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface MediaJob<T = unknown> {
  id: string;
  kind: string;
  payload: T;
  priority: number;
  status: JobStatus;
  /** 0..100. */
  progress: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export class MediaJobQueue<T = unknown> {
  private jobs: MediaJob<T>[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Enqueue a job. Higher `priority` runs first; ties break by insertion order. */
  add(kind: string, payload: T, priority = 0): MediaJob<T> {
    this.seq += 1;
    const job: MediaJob<T> = {
      id: `job-${this.seq}`, kind, payload, priority,
      status: 'queued', progress: 0, createdAt: this.now(),
    };
    this.jobs.push(job);
    return job;
  }

  get(id: string): MediaJob<T> | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  list(status?: JobStatus): MediaJob<T>[] {
    return status ? this.jobs.filter((j) => j.status === status) : this.jobs.slice();
  }

  /** The next job that should run (highest priority, then FIFO), or undefined. */
  peekNext(): MediaJob<T> | undefined {
    let best: MediaJob<T> | undefined;
    for (const j of this.jobs) {
      if (j.status !== 'queued') continue;
      if (!best || j.priority > best.priority || (j.priority === best.priority && j.createdAt < best.createdAt)) {
        best = j;
      }
    }
    return best;
  }

  /** Mark the next queued job running and return it. */
  startNext(): MediaJob<T> | undefined {
    const job = this.peekNext();
    if (job) { job.status = 'running'; job.startedAt = this.now(); }
    return job;
  }

  setProgress(id: string, percent: number): void {
    const job = this.get(id);
    if (job && job.status === 'running') job.progress = Math.max(0, Math.min(100, percent));
  }

  complete(id: string): void {
    const job = this.get(id);
    if (!job) return;
    job.status = 'done'; job.progress = 100; job.endedAt = this.now();
  }

  fail(id: string, error: string): void {
    const job = this.get(id);
    if (!job) return;
    job.status = 'failed'; job.error = error; job.endedAt = this.now();
  }

  cancel(id: string): void {
    const job = this.get(id);
    if (!job || job.status === 'done') return;
    job.status = 'cancelled'; job.endedAt = this.now();
  }

  remove(id: string): boolean {
    const i = this.jobs.findIndex((j) => j.id === id);
    if (i < 0) return false;
    this.jobs.splice(i, 1);
    return true;
  }

  /** Drop finished jobs (done/failed/cancelled); returns how many were cleared. */
  clearFinished(): number {
    const before = this.jobs.length;
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    return before - this.jobs.length;
  }

  counts(): Record<JobStatus, number> {
    const c: Record<JobStatus, number> = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const j of this.jobs) c[j.status] += 1;
    return c;
  }
}
