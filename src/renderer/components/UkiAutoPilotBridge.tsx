// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UkiAutoPilotBridge
 * -----------------------------------------------------------------------------
 * Glue between UkiOverlay and the AutoPilot stack (ActionBus + slash parser +
 * approval card). Renders pending approval cards, exposes a single
 * `runUkiSlashIfApplicable(text)` helper that the overlay can call as a
 * fallthrough before its AI round-trip.
 *
 * Decoupled from UkiOverlay's internal state so we don't have to surgically
 * edit that 4000-line file.
 */

// DEX v3.8.0 - UKI AutoPilot bridge

import * as React from 'react';
import ActionBus from '../services/ActionBus';
import { parseSlashToPlan } from '../services/UkiSlashCommands';
import { UkiApprovalCard } from './UkiApprovalCard';
import { useUkiStore } from '../store/ukiStore';
import type { PlanGraph, PlanStepResult } from '../../shared/types/plan-graph';

interface RunResult {
  handled: boolean;
  reply?: string;
}

function summarizeResults(plan: PlanGraph, results: PlanStepResult[]): string {
  const ok = results.filter((r) => r.status === 'done').length;
  const fail = results.filter((r) => r.status === 'failed');
  if (fail.length === 0) {
    if (results.length === 1 && results[0].output) {
      const out = results[0].output as Record<string, unknown>;
      if (typeof out.summary === 'string') return out.summary as string;
      if (typeof out.translated === 'string') return `(${(out.targetLang as string) || '?'}) ${out.translated}`;
      if (typeof out.words === 'number') return `${out.words} words / ${out.chars} chars / ${out.lines} lines`;
      if (typeof out.id === 'string' && typeof out.ms === 'number') {
        return `Timer started for ${Math.round((out.ms as number) / 1000)}s (id ${out.id})`;
      }
      if (typeof out.length === 'number') return `Copied ${out.length} chars to clipboard`;
      if (typeof out.opened === 'string') return 'Link opened';
      if (typeof out.path === 'string') return out.path ? `Screenshot saved: ${out.path}` : 'Screenshot bridge unavailable';
      if (typeof out.events === 'number') return `Snapshot captured (${out.events} events)`;
      if (typeof out.shown === 'boolean') return 'Toast shown';
      if (typeof out.active === 'boolean') return out.active ? 'Focus mode on' : 'Focus mode off';
      if (typeof out.muted === 'boolean') return out.muted ? `Muted ${out.count || 0} media` : `Unmuted ${out.count || 0} media`;
      if (typeof out.delivered === 'string') return 'Notification sent';
      if (typeof out.dismissed === 'string') return `Dismissed ${out.dismissed}`;
      if (typeof out.stopped === 'boolean') return out.stopped ? 'Timer stopped' : 'No matching timer';
      return 'Done';
    }
    return `${plan.steps.length}-step plan finished (${ok}/${results.length}).`;
  }
  return `Plan finished with ${fail.length} error${fail.length === 1 ? '' : 's'}: ${fail[0].error || 'unknown'}`;
}

/**
 * Try to run text as a Wave-1 slash command. Returns handled=true if a plan
 * matched (the plan runs in the background; reply is the immediate
 * acknowledgement). Returns handled=false if no command matched, so the
 * caller can fall through to its own router.
 */
export async function runUkiSlashIfApplicable(text: string): Promise<RunResult> {
  const plan = parseSlashToPlan(text);
  if (!plan) return { handled: false };
  // Fire-and-collect; surface result via a dispatched event for chat overlay
  ActionBus.execute(plan).then((results) => {
    const reply = summarizeResults(plan, results);
    try {
      window.dispatchEvent(new CustomEvent('uki:autopilot-result', {
        detail: { planId: plan.id, utterance: plan.utterance, reply, results },
      }));
    } catch { /* best effort */ }
  }).catch((err) => {
    try {
      window.dispatchEvent(new CustomEvent('uki:autopilot-result', {
        detail: { planId: plan.id, utterance: plan.utterance, reply: `Plan failed: ${err?.message || err}`, results: [] },
      }));
    } catch { /* best effort */ }
  });
  return {
    handled: true,
    reply: plan.risk === 'destructive'
      ? `Approval needed for ${plan.steps.length}-step plan…`
      : `Running ${plan.steps.length}-step plan…`,
  };
}

/**
 * Floating approval card host. Subscribes to ActionBus events and renders
 * UkiApprovalCard for any plan awaiting approval. Self-contained — drop
 * `<UkiAutoPilotBridge />` anywhere inside the UkiOverlay.
 */
export const UkiAutoPilotBridge: React.FC = () => {
  const [pending, setPending] = React.useState<PlanGraph[]>([]);

  React.useEffect(() => {
    const offWait = ActionBus.on('plan:awaiting-approval', ({ plan }) => {
      setPending((prev) => (prev.find((p) => p.id === plan.id) ? prev : [...prev, plan]));
    });
    const clear = (planId: string) => setPending((prev) => prev.filter((p) => p.id !== planId));
    const offApproved = ActionBus.on('plan:approved', ({ planId }) => clear(planId));
    const offDenied = ActionBus.on('plan:denied', ({ planId }) => clear(planId));
    const offFinished = ActionBus.on('plan:finished', ({ planId }) => clear(planId));
    const offFailed = ActionBus.on('plan:failed', ({ planId }) => clear(planId));
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent).detail as { planId: string; utterance?: string; reply: string } | undefined;
      if (!detail?.reply) return;
      try {
        useUkiStore.getState().addConversationTurn({
          id: `autopilot-${detail.planId}`,
          userText: detail.utterance || 'AutoPilot',
          response: detail.reply,
          intent: 'autopilot-result',
          success: true,
          timestamp: Date.now(),
        });
      } catch { /* best effort */ }
    };
    window.addEventListener('uki:autopilot-result', onResult as EventListener);
    return () => {
      offWait();
      offApproved();
      offDenied();
      offFinished();
      offFailed();
      window.removeEventListener('uki:autopilot-result', onResult as EventListener);
    };
  }, []);

  if (pending.length === 0) return null;

  return (
    <div style={{ position: 'relative', zIndex: 2 }}>
      {pending.map((plan) => (
        <UkiApprovalCard
          key={plan.id}
          plan={plan}
          onApprove={() => ActionBus.approve(plan.id)}
          onDeny={() => ActionBus.deny(plan.id)}
        />
      ))}
    </div>
  );
};

export default UkiAutoPilotBridge;
