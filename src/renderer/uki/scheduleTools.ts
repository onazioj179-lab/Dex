// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's scheduling tools: schedule_task / list_scheduled_tasks /
 * cancel_scheduled_task. They read and write the same store the Task Manager's
 * Scheduled Tasks panel shows, so anything UKI schedules is visible, pausable
 * and deletable by the user. The agent loop gates schedule/cancel on user
 * confirmation (assistantPolicy confirmReason) before these run.
 */

import { useScheduledTasksStore } from '../store/scheduledTasksStore';
import { parseScheduleSpec } from '../../shared/automation/scheduleSpec';
import { describeSchedule, type ScheduledAction } from '../../shared/automation/scheduledTasks';
import { getUkiAppAction } from './appActionRegistry';
import { validateArgsAgainst } from '../../shared/uki/toolValidation';

/**
 * Build a scheduled app-action from a tool call. The schedule_task call itself
 * is confirmed by the user with these exact args shown, so a changing action
 * is stored as pre-approved; it never runs anything else.
 */
export function appActionFor(actionId: string, rawArgs: unknown): { ok: true; action: ScheduledAction } | { ok: false; error: string } {
  const entry = getUkiAppAction(actionId);
  if (!entry) return { ok: false, error: `"${actionId}" is not an action DEX knows right now. Open the app first so its actions are available, then schedule it.` };
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === 'string' && rawArgs.trim()) {
    try { args = JSON.parse(rawArgs); } catch { return { ok: false, error: `args must be a JSON object, for example ${entry.spec.example}` }; }
  } else if (rawArgs && typeof rawArgs === 'object') args = rawArgs as Record<string, unknown>;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: `args must be a JSON object, for example ${entry.spec.example}` };
  const v = validateArgsAgainst(actionId, args, entry.spec.args, entry.spec.example);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, action: { type: 'app-action', actionId, args, appId: entry.appId, mutates: entry.spec.mutates, preApproved: entry.spec.mutates } };
}

const MAX_TITLE = 80;
const MAX_TEXT = 1000;

function clip(s: unknown, n: number): string {
  return String(s ?? '').trim().slice(0, n);
}

function whenText(ms: number | null, now: number): string {
  if (ms === null) return 'not scheduled';
  const d = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, '0');
  const mins = Math.round((ms - now) / 60000);
  const rel = mins < 1 ? 'under a minute' : mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} (in ${rel})`;
}

export function scheduleTaskTool(args: Record<string, unknown>, now = Date.now()): string {
  const title = clip(args.title, MAX_TITLE);
  if (!title) return 'Could not schedule: a title is needed.';
  const spec = parseScheduleSpec(clip(args.when, 200), now);
  if (!spec.ok) return `Could not schedule: ${spec.error}`;
  const prompt = clip(args.prompt, MAX_TEXT);
  const message = clip(args.message, MAX_TEXT);
  const actionId = clip(args.action, 120);
  let action: ScheduledAction;
  if (actionId) {
    const a = appActionFor(actionId, args.args);
    if (!a.ok) return `Could not schedule: ${a.error}`;
    action = a.action;
  } else {
    action = prompt ? { type: 'uki-prompt', prompt } : { type: 'reminder', message: message || title };
  }
  const store = useScheduledTasksStore.getState();
  const id = store.addTask({
    title,
    kind: spec.kind,
    cron: spec.kind === 'cron' ? spec.cron : undefined,
    intervalMs: spec.kind === 'interval' ? spec.intervalMs : undefined,
    atMs: spec.kind === 'once' ? spec.atMs : undefined,
    action,
  }, now);
  const task = useScheduledTasksStore.getState().tasks.find((t) => t.id === id);
  const next = task ? whenText(task.nextRunAt, now) : 'unknown';
  const what = action.type === 'app-action'
    ? `runs ${action.actionId}${action.preApproved ? ', approved now so it runs without asking' : ''}; opens ${action.appId} if it is closed`
    : prompt ? 'UKI will run the request and notify the answer' : 'a notification';
  return `Scheduled "${title}" (${spec.summary}; ${what}). Next run ${next}. Id ${id}. It is listed in Task Manager › Scheduled Tasks.`;
}

export function listScheduledTasksTool(now = Date.now()): string {
  const tasks = useScheduledTasksStore.getState().tasks;
  if (!tasks.length) return 'No scheduled tasks.';
  return tasks.slice(0, 30).map((t) => {
    const what = t.action.type === 'uki-prompt' ? `asks UKI: ${clip(t.action.prompt, 80)}` : t.action.type === 'reminder' ? 'reminder' : `runs ${t.action.actionId}`;
    const state = !t.enabled ? (t.kind === 'once' && t.runCount > 0 ? 'done' : 'paused') : `next ${whenText(t.nextRunAt, now)}`;
    const last = t.lastOutcome ? `, last ${t.lastOutcome === 'ok' ? 'succeeded' : `failed (${clip(t.lastError, 80)})`}` : '';
    return `- ${t.title} [${t.id}]: ${describeSchedule(t)}, ${what}; ${state}${last}`;
  }).join('\n');
}

export function cancelScheduledTaskTool(args: Record<string, unknown>): string {
  const q = clip(args.task, 200).toLowerCase();
  if (!q) return 'Could not cancel: say which task (id or title).';
  const tasks = useScheduledTasksStore.getState().tasks;
  let hits = tasks.filter((t) => t.id.toLowerCase() === q || t.title.toLowerCase() === q);
  if (!hits.length) hits = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (!hits.length) return `Could not cancel: no scheduled task matches "${clip(args.task, 200)}".`;
  if (hits.length > 1) return `Could not cancel: ${hits.length} tasks match (${hits.map((t) => `${t.title} [${t.id}]`).join(', ')}). Use the id.`;
  useScheduledTasksStore.getState().removeTask(hits[0].id);
  return `Deleted the scheduled task "${hits[0].title}".`;
}
