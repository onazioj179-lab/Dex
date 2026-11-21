// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.

interface IncomingTask {
  title: string;
  notes?: string;
  dueDate?: string;
}

export const TASK_INTAKE_EVENT = 'dex-task-intake';
const pending: IncomingTask[] = [];

export function sendToTasks(task: IncomingTask): boolean {
  const title = task.title.trim().slice(0, 200);
  if (!title || pending.length >= 32) return false;
  pending.push({ ...task, title });
  window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'tasks' } }));
  window.dispatchEvent(new Event(TASK_INTAKE_EVENT));
  return true;
}

export function takeIncomingTasks(): IncomingTask[] {
  return pending.splice(0);
}
