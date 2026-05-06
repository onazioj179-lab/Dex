// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UKI Slash → PlanGraph
 * -----------------------------------------------------------------------------
 * Lightweight parser that turns a leading-slash UKI utterance into a typed
 * PlanGraph that ActionBus can execute. Unknown commands return null so the
 * existing UkiOverlay slash router still owns /open, /note, /task, /find,
 * /run; this module adds the new Wave 1 batch on top.
 *
 * Recognised commands (all map to one ActionBus step unless noted):
 *   /summarize <text>      -> text.summarize
 *   /translate <to> <text> -> text.translate
 *   /diff <a> | <b>        -> text.summarize x2 (returns side-by-side via results)
 *   /screenshot            -> screenshot.capture
 *   /clipboard             -> clipboard.read
 *   /clipboard <text>      -> clipboard.copy
 *   /timer <ms> [label]    -> timer.start
 *   /toast <message>       -> shell.toast
 *   /focus                 -> focus.toggle
 *   /mute                  -> media.muteToggle
 *   /open-link <url>       -> ui.openLink
 *   /snapshot              -> workspace.snapshot
 *   /count <text>          -> text.wordCount
 *   /notify <title> | <body>-> notification.show
 *   /dismiss <id>          -> ambient.dismiss
 */

// DEX v3.8.0 - UKI Slash to PlanGraph

import type { ActionStep, PlanGraph } from '../../shared/types/plan-graph';
import { planRisk } from '../../shared/types/plan-graph';

let counter = 0;
function nextStepId(): string {
  counter = (counter + 1) % 1_000_000;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}

function newPlan(utterance: string, steps: ActionStep[]): PlanGraph {
  return {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    utterance,
    steps,
    createdAt: Date.now(),
    risk: planRisk(steps),
  };
}

function parseDuration(token: string): number | null {
  if (!token) return null;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i.exec(token.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const mul: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return Math.round(n * (mul[unit] || 1000));
}

export function parseSlashToPlan(text: string): PlanGraph | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const space = trimmed.indexOf(' ');
  const cmd = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase();
  const arg = space === -1 ? '' : trimmed.slice(space + 1).trim();

  switch (cmd) {
    case 'summarize':
      if (!arg) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'text.summarize',
        label: `Summarize ${arg.length} chars`, risk: 'safe',
        payload: { text: arg },
      }]);
    case 'translate': {
      if (!arg) return null;
      const sp = arg.indexOf(' ');
      if (sp === -1) return null;
      const to = arg.slice(0, sp);
      const body = arg.slice(sp + 1);
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'text.translate',
        label: `Translate to ${to}`, risk: 'safe',
        payload: { text: body, to },
      }]);
    }
    case 'diff': {
      const parts = arg.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      return newPlan(trimmed, [
        { id: nextStepId(), action: 'text.summarize', label: 'Side A', risk: 'safe', payload: { text: parts[0] } },
        { id: nextStepId(), action: 'text.summarize', label: 'Side B', risk: 'safe', payload: { text: parts[1] } },
      ]);
    }
    case 'screenshot':
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'screenshot.capture',
        label: 'Capture screen', risk: 'reversible',
      }]);
    case 'clipboard':
      if (!arg) return newPlan(trimmed, [{
        id: nextStepId(), action: 'clipboard.read',
        label: 'Read clipboard', risk: 'safe',
      }]);
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'clipboard.copy',
        label: `Copy ${arg.length} chars`, risk: 'safe',
        payload: { text: arg },
      }]);
    case 'timer': {
      if (!arg) return null;
      const sp = arg.indexOf(' ');
      const tok = sp === -1 ? arg : arg.slice(0, sp);
      const label = sp === -1 ? 'Timer' : arg.slice(sp + 1);
      const ms = parseDuration(tok);
      if (ms == null || ms <= 0) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'timer.start',
        label: `Timer ${tok} (${label})`, risk: 'safe',
        payload: { ms, label },
      }]);
    }
    case 'toast':
      if (!arg) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'shell.toast',
        label: 'Toast', risk: 'safe', payload: { message: arg },
      }]);
    case 'focus':
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'focus.toggle',
        label: 'Toggle focus mode', risk: 'safe',
      }]);
    case 'mute':
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'media.muteToggle',
        label: 'Toggle mute', risk: 'safe',
      }]);
    case 'open-link':
      if (!arg) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'ui.openLink',
        label: `Open ${arg}`, risk: 'reversible', payload: { url: arg },
      }]);
    case 'snapshot':
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'workspace.snapshot',
        label: 'Snapshot context', risk: 'reversible',
      }]);
    case 'count':
      if (!arg) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'text.wordCount',
        label: 'Word count', risk: 'safe', payload: { text: arg },
      }]);
    case 'notify': {
      if (!arg) return null;
      const parts = arg.split('|').map((s) => s.trim());
      const title = parts[0] || 'DEX';
      const body = parts.slice(1).join(' | ');
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'notification.show',
        label: `Notify: ${title}`, risk: 'safe', payload: { title, body },
      }]);
    }
    case 'dismiss':
      if (!arg) return null;
      return newPlan(trimmed, [{
        id: nextStepId(), action: 'ambient.dismiss',
        label: `Dismiss ${arg}`, risk: 'safe', payload: { id: arg },
      }]);
    default:
      return null;
  }
}

export const SLASH_COMMANDS = [
  '/summarize', '/translate', '/diff', '/screenshot', '/clipboard',
  '/timer', '/toast', '/focus', '/mute', '/open-link',
  '/snapshot', '/count', '/notify', '/dismiss',
] as const;
