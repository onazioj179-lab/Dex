// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Task Queue Thread
// ==========================================================================
// Orchestrates all background task execution with priority scheduling.
// ==========================================================================

import { parentPort } from 'worker_threads';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

interface QueuedTask {
  id: string;
  name: string;
  app: string;
  priority: 'critical' | 'high' | 'normal' | 'low' | 'lowest';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  progress: number;
  progressTotal: number;
  data: any;
}

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3, lowest: 4 };
const MAX_CONCURRENT = 4;

const queue: QueuedTask[] = [];
const active = new Map<string, QueuedTask>();
const completed: QueuedTask[] = [];
let taskCounter = 0;

function createTask(name: string, app: string, priority: string, data: any): QueuedTask {
  taskCounter++;
  const task: QueuedTask = {
    id: `task-${Date.now()}-${taskCounter}`,
    name,
    app,
    priority: (priority as QueuedTask['priority']) || 'normal',
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    error: null,
    progress: 0,
    progressTotal: 100,
    data,
  };
  insertSorted(task);
  return task;
}

function insertSorted(task: QueuedTask): void {
  const rank = PRIORITY_ORDER[task.priority] ?? 2;
  let i = 0;
  while (i < queue.length && (PRIORITY_ORDER[queue[i].priority] ?? 2) <= rank) i++;
  queue.splice(i, 0, task);
}

function processQueue(): void {
  while (active.size < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift()!;
    task.status = 'running';
    task.startedAt = Date.now();
    active.set(task.id, task);
    // Notify main process that task started
    parentPort?.postMessage({
      type: 'task-started',
      payload: { id: task.id, name: task.name, app: task.app },
      requestId: '',
      timestamp: Date.now(),
    });
  }
}

function completeTask(taskId: string, success: boolean, error?: string): void {
  const task = active.get(taskId);
  if (!task) return;
  task.status = success ? 'completed' : 'failed';
  task.completedAt = Date.now();
  task.error = error || null;
  task.progress = success ? task.progressTotal : task.progress;
  active.delete(taskId);
  completed.push(task);
  if (completed.length > 200) completed.splice(0, completed.length - 200);
  processQueue();
}

function cancelTask(taskId: string): boolean {
  const qi = queue.findIndex(t => t.id === taskId);
  if (qi >= 0) {
    queue[qi].status = 'cancelled';
    queue[qi].completedAt = Date.now();
    completed.push(queue[qi]);
    queue.splice(qi, 1);
    return true;
  }
  const at = active.get(taskId);
  if (at) {
    at.status = 'cancelled';
    at.completedAt = Date.now();
    active.delete(taskId);
    completed.push(at);
    processQueue();
    return true;
  }
  return false;
}

function updateProgress(taskId: string, progress: number, total?: number): void {
  const task = active.get(taskId);
  if (!task) return;
  task.progress = progress;
  if (total !== undefined) task.progressTotal = total;
}

function getSnapshot(): {
  queued: QueuedTask[];
  active: QueuedTask[];
  recentCompleted: QueuedTask[];
} {
  return {
    queued: [...queue],
    active: Array.from(active.values()),
    recentCompleted: completed.slice(-20),
  };
}

function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

parentPort?.on('message', (msg: ThreadMessage) => {
  try {
    switch (msg.type) {
      case 'enqueue': {
        const { name, app, priority, data } = msg.payload;
        const task = createTask(name, app, priority, data);
        processQueue();
        respond(msg, { id: task.id });
        break;
      }
      case 'complete':
        completeTask(msg.payload.taskId, msg.payload.success, msg.payload.error);
        respond(msg, { ok: true });
        break;
      case 'cancel': {
        const ok = cancelTask(msg.payload.taskId);
        respond(msg, { ok });
        break;
      }
      case 'update-progress':
        updateProgress(msg.payload.taskId, msg.payload.progress, msg.payload.total);
        respond(msg, { ok: true });
        break;
      case 'get-snapshot':
        respond(msg, getSnapshot());
        break;
      case 'get-active-count':
        respond(msg, { count: active.size, queueLength: queue.length });
        break;
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
