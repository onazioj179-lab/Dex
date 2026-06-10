// =============================================================================
// DEX 6.0 — uki chat actions (real, confirm-gated multi-step actions)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Brings the proven planner -> actionExecutor -> confirmTier pipeline (the same
// one CreativeCommandBar uses) to the uki chat. An imperative message ("open
// Notes", "summarise: …", "rewrite: …", "bullets: …") is decomposed into a Plan,
// classified by confirm tier, and — once the user approves any mutating step —
// executed against REAL handlers:
//   - app.open      mutates the workspace (launches/focuses an app via the
//                   running-apps store; AppManager renders from currentAppId), so
//                   it is gated behind an explicit confirm.
//   - uki.*         read-only LLM transforms (summarise/rewrite/bulletise) via the
//                   configured provider; auto-runnable, no prompt.
// Intents are anchored to the START of the message so normal conversation
// ("how do I open a file?") is NOT hijacked into an action.

import { decompose, type Plan } from '../../shared/uki/planner';
import {
  createSkillRegistry,
  registerSkill,
  type Skill,
  type SkillRegistry,
} from '../../shared/uki/skills';
import {
  createActionRegistry,
  registerActions,
  executePlan,
  type ActionRegistry,
} from '../../shared/uki/actionExecutor';
import { summarizePlan } from '../../shared/uki/planSummary';
import { tierForAction, type ConfirmTier } from '../../shared/uki/confirmTier';
import { askConfiguredLLM } from './providers/connect';
import { useRunningApps } from '../store/runningApps';
import { APP_REGISTRY } from '../store/appSubsystem';

/** Whether each action mutates the workspace (drives the confirm tier). */
const ACTION_MUTATES: Record<string, boolean> = {
  'app.open': true,
  'app.close': true,
  'uki.summarize': false,
  'uki.rewriteTone': false,
  'uki.bulletize': false,
};

/** True for any action whose handler calls the LLM (needs a configured provider). */
export function planNeedsProvider(plan: Plan): boolean {
  return plan.steps.some((s) => s.actionId.startsWith('uki.'));
}

// Intents anchored at the start of the message → imperative-only, so free-form
// questions are left to the normal chat path.
const CHAT_SKILLS: Skill[] = [
  {
    id: 'chat.openApp',
    label: 'Open an app',
    intent: /^(open|launch|switch to|go to)\b/,
    plan: { steps: [{ actionId: 'app.open', params: { target: '{{goal}}' } }] },
  },
  {
    id: 'chat.closeApp',
    label: 'Close an app',
    intent: /^(close|quit|exit)\b/,
    plan: { steps: [{ actionId: 'app.close', params: { target: '{{goal}}' } }] },
  },
  {
    id: 'chat.summarise',
    label: 'Summarise text',
    intent: /^(summari[sz]e|tl;?dr)\b/,
    plan: { steps: [{ actionId: 'uki.summarize', params: { text: '{{goal}}' } }] },
  },
  {
    id: 'chat.rewrite',
    label: 'Rewrite text',
    intent: /^rewrite\b/,
    plan: { steps: [{ actionId: 'uki.rewriteTone', params: { text: '{{goal}}' } }] },
  },
  {
    id: 'chat.bullets',
    label: 'Bullet points',
    intent: /^bullet/,
    plan: { steps: [{ actionId: 'uki.bulletize', params: { text: '{{goal}}' } }] },
  },
];

function chatSkillRegistry(): SkillRegistry {
  let r = createSkillRegistry();
  for (const s of CHAT_SKILLS) r = registerSkill(r, s);
  return r;
}

/** Match free text against a registered app by name or id, longest name wins. */
function resolveAppTarget(text: string): { id: string; name: string; icon: string; color: string } | null {
  const lower = text.toLowerCase();
  let best: { id: string; name: string; icon: string; color: string } | null = null;
  for (const def of APP_REGISTRY) {
    const name = def.name.toLowerCase();
    const idHit = new RegExp(`\\b${def.id.toLowerCase()}\\b`).test(lower);
    if (lower.includes(name) || idHit) {
      if (!best || name.length > best.name.length) {
        best = { id: def.id, name: def.name, icon: def.icon || def.id, color: def.color || 'var(--color-accent)' };
      }
    }
  }
  return best;
}

function chatActionRegistry(systemPrompt: string): ActionRegistry {
  const llm = (instruction: string) => async (params: Record<string, unknown>): Promise<string> => {
    const text = String(params.text ?? '').trim();
    const out = await askConfiguredLLM(`${instruction}\n\n${text}`, systemPrompt);
    return out ?? 'No response — check your AI provider key.';
  };
  return registerActions(createActionRegistry(), {
    'app.open': (params) => {
      const app = resolveAppTarget(String(params.target ?? ''));
      if (!app) throw new Error('no matching app to open');
      useRunningApps.getState().launchApp({ id: app.id, name: app.name, icon: app.icon, color: app.color });
      return `Opened ${app.name}.`;
    },
    'app.close': (params) => {
      const app = resolveAppTarget(String(params.target ?? ''));
      if (!app) throw new Error('no matching app to close');
      const store = useRunningApps.getState();
      if (!store.isAppRunning(app.id)) return `${app.name} is not open.`;
      store.closeApp(app.id);
      return `Closed ${app.name}.`;
    },
    'uki.summarize': llm('Summarise the following in 3 sentences. Return only the summary:'),
    'uki.rewriteTone': llm('Rewrite the following to be clear and professional. Return only the rewritten text:'),
    'uki.bulletize': llm('Convert the following into 5 concise bullet points. Return only the bullets:'),
  });
}

export interface ChatCommand {
  /** True when an imperative intent matched and produced at least one step. */
  understood: boolean;
  plan: Plan;
  /** Human-readable preview of the steps. */
  summary: string;
  /** Strictest tier across the steps (forbidden > confirm > auto). */
  tier: ConfirmTier;
}

/**
 * Parse an imperative chat message into a previewable, tier-classified command.
 * Returns `understood: false` for ordinary conversation (no anchored intent),
 * so the caller falls through to the normal streaming chat.
 */
export function buildChatCommand(goal: string): ChatCommand {
  const trimmed = (goal ?? '').trim();
  const skills = chatSkillRegistry();
  const lower = trimmed.toLowerCase();
  const intentMatched =
    !!trimmed &&
    skills.skills.some((s) =>
      typeof s.intent === 'string' ? lower.includes(s.intent.toLowerCase()) : s.intent.test(lower),
    );
  const decomposed = decompose(trimmed, skills);
  let plan: Plan = intentMatched ? decomposed : { ...decomposed, steps: [] };

  // Don't offer an app open/close action we can't resolve to a real app — let the
  // normal chat field "open the pod bay doors" instead of confirming then failing.
  const unresolvedNav = plan.steps.some(
    (s) =>
      (s.actionId === 'app.open' || s.actionId === 'app.close') &&
      !resolveAppTarget(String(s.params.target ?? '')),
  );
  if (unresolvedNav) plan = { ...plan, steps: [] };

  let tier: ConfirmTier = 'auto';
  for (const step of plan.steps) {
    const t = tierForAction({ op: step.actionId, mutates: ACTION_MUTATES[step.actionId] ?? true });
    if (t === 'forbidden') {
      tier = 'forbidden';
      break;
    }
    if (t === 'confirm') tier = 'confirm';
  }

  return { understood: plan.steps.length > 0, plan, summary: summarizePlan(plan), tier };
}

/** Execute a (previously approved) plan and return a human-readable result. */
export async function runChatCommand(plan: Plan, systemPrompt: string): Promise<string> {
  const res = await executePlan(plan, chatActionRegistry(systemPrompt));
  const outputs = res.results
    .filter((r) => r.status === 'ok' && r.value != null)
    .map((r) => String(r.value));
  if (outputs.length) return outputs.join('\n\n');
  const failed = res.results.find((r) => r.status === 'failed');
  return failed?.error ? `Could not complete: ${failed.error}` : 'Done.';
}
