// =============================================================================
// DEX Platform - Scheduled task runner
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Drives the scheduled-tasks store against the SharedTick heartbeat: on each
// tick it fires every DUE task, records the run in the UKI task ledger (so
// scheduled work shows up in Nexus), and folds the outcome back through the
// pure engine (applyRunResult) — successes reschedule the next slot, failures
// back off and retry, then resume cadence. Mandate: "rehook ourselves to check
// on tasks... everything happens in the background."

import { sharedTick } from './SharedTick';
import { notify } from './notify';
import { useScheduledTasksStore } from '../store/scheduledTasksStore';
import { useUkiTasks } from '../store/ukiTasksStore';
import { runUkiAction } from '../uki/appActionRegistry';
import { dueTasks, applyRunResult, type ScheduledTask } from '../../shared/automation/scheduledTasks';

const SUBSCRIBER_ID = 'scheduled-task-runner';
/** How often to check for due tasks. 30s keeps minute-granularity crons honest. */
const CHECK_INTERVAL_MS = 30_000;

/** Result markers runUkiAction returns instead of throwing — treat as failures. */
const ACTION_FAILURE = /not running|needs the user'?s confirmation|Unknown app action|failed|error/i;

class ScheduledTaskRunner {
  private started = false;
  private inFlight = new Set<string>();

  start(): void {
    if (this.started) return;
    this.started = true;
    sharedTick.subscribe(SUBSCRIBER_ID, (now) => { void this.tick(now); }, CHECK_INTERVAL_MS, { fireImmediately: true });
  }

  stop(): void {
    if (!this.started) return;
    sharedTick.unsubscribe(SUBSCRIBER_ID);
    this.started = false;
  }

  /** Public for tests: run one scheduling pass at `now`. */
  async tick(now: number): Promise<void> {
    const due = dueTasks(useScheduledTasksStore.getState().tasks, now);
    for (const task of due) {
      if (this.inFlight.has(task.id)) continue; // don't overlap a slow run
      this.inFlight.add(task.id);
      void this.execute(task, now).finally(() => this.inFlight.delete(task.id));
    }
  }

  private async execute(task: ScheduledTask, now: number): Promise<void> {
    const ledger = useUkiTasks.getState();
    const ledgerId = ledger.startTask(task.title, 'automation');
    let outcome: 'ok' | 'error' = 'ok';
    let detail = '';
    try {
      if (task.action.type === 'reminder') {
        await notify({ title: task.title, body: task.action.message || 'Scheduled reminder', source: 'Scheduler' });
        detail = 'reminder delivered';
      } else if (task.action.type === 'app-action') {
        const res = await runUkiAction(task.action.actionId || '', task.action.args || {});
        detail = res;
        ledger.logTaskStep(ledgerId, res.slice(0, 140));
        if (ACTION_FAILURE.test(res)) { outcome = 'error'; }
      } else if (task.action.type === 'uki-prompt') {
        const prompt = (task.action.prompt || '').trim();
        if (!prompt) throw new Error('no prompt to run');
        ledger.logTaskStep(ledgerId, `Asking UKI: ${prompt.slice(0, 100)}`);
        // Lazy: the agent loop is only loaded when a prompt task actually fires.
        const [{ runUkiAgent }, { buildSystemPrompt }] = await Promise.all([
          import('../uki/agentRunner'),
          import('../uki/identity'),
        ]);
        const answer = await runUkiAgent({
          userText: `${prompt}

(This is a scheduled task "${task.title}" running in the background; the user is not watching. Answer briefly.)`,
          systemPrompt: buildSystemPrompt(),
          pushStep: (st) => ledger.logTaskStep(ledgerId, st.slice(0, 140)),
        });
        if (!answer) {
          outcome = 'error';
          detail = 'No AI provider answered (add a provider key in UKI settings).';
        } else {
          detail = answer;
          await notify({ title: task.title, body: answer.slice(0, 400), source: 'UKI' });
        }
      } else {
        outcome = 'error';
        detail = `unknown action type`;
      }
    } catch (err) {
      outcome = 'error';
      detail = err instanceof Error ? err.message : String(err);
    }

    if (outcome === 'ok') ledger.completeTask(ledgerId, detail);
    else ledger.failTask(ledgerId, detail);

    // Fold the outcome back through the pure engine against the LATEST stored
    // task (it may have been toggled/edited during the async run).
    const fresh = useScheduledTasksStore.getState().tasks.find(t => t.id === task.id);
    if (fresh) {
      const updated = applyRunResult(fresh, now, outcome, outcome === 'error' ? detail : undefined, { baseMs: 5_000, factor: 3, maxMs: 300_000 });
      useScheduledTasksStore.getState().patchRuntime(task.id, updated);
    }
  }
}

export const scheduledTaskRunner = new ScheduledTaskRunner();
