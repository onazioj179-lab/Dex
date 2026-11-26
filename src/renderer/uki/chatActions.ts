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
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { APP_REGISTRY } from '../store/appSubsystem';
import { useNotesStore } from '../store/notesStore';
import { buildDexCommands, findByUtterance } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { parseSystemControl, opensAccess, describeSystemControl, runSystemControl } from './systemControls';

/** Resolve free text to a DEX catalog ACTION command (window/system/nav), or null. */
function resolveDexAction(text: string): ReturnType<typeof findByUtterance> {
  const cmd = findByUtterance(buildDexCommands(APP_DEFINITIONS), text);
  // app launches are handled by app.open; this path is for action commands only.
  return cmd && cmd.action ? cmd : null;
}

/** Whether each action mutates the workspace (drives the confirm tier). */
const ACTION_MUTATES: Record<string, boolean> = {
  'app.open': true,
  'app.close': true,
  'dex.command': true,
  'notes.create': true,
  'tasks.create': true,
  'uki.summarize': false,
  'uki.rewriteTone': false,
  'uki.bulletize': false,
  // Privacy, network and backup: only what opens access asks first.
  'system.safe': false,
  'system.open': true,
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
    // Window / system / navigation commands from the DEX catalog -- "split screen",
    // "tile left", "maximize", "arrange windows", "go back", "toggle assistant", ...
    id: 'chat.dexCommand',
    label: 'Run a DEX command',
    intent: /^(split|tile|snap|maximi[sz]e|minimi[sz]e|arrange|go back|go forward|toggle (uki|assistant)|compact|lock)\b/,
    plan: { steps: [{ actionId: 'dex.command', params: { target: '{{goal}}' } }] },
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
  {
    id: 'chat.createNote',
    label: 'Create a note',
    intent: /^(new note|create (a )?note|take a note|note that|note\s*:)/,
    plan: { steps: [{ actionId: 'notes.create', params: { text: '{{goal}}' } }] },
  },
  {
    id: 'chat.createTask',
    label: 'Create a task',
    intent: /^(add (a )?task|create (a )?task|new task|remind me to|add to-?do|to-?do\s*:)/,
    plan: { steps: [{ actionId: 'tasks.create', params: { text: '{{goal}}' } }] },
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
    // Window/system/nav action from the catalog, run through the one executor.
    'dex.command': (params) => {
      const cmd = resolveDexAction(String(params.target ?? ''));
      if (!cmd) throw new Error('no matching DEX command');
      executeDexCommand(cmd);
      return `Ran ${cmd.label}.`;
    },
    'system.safe': (params) => {
      const c = parseSystemControl(String(params.target ?? ''));
      if (!c || opensAccess(c)) throw new Error('not a safe system command');
      return runSystemControl(c);
    },
    'system.open': (params) => {
      const c = parseSystemControl(String(params.target ?? ''));
      if (!c) throw new Error('no matching system command');
      return runSystemControl(c);
    },
    'uki.summarize': llm('Summarise the following in 3 sentences. Return only the summary:'),
    'uki.rewriteTone': llm('Rewrite the following to be clear and professional. Return only the rewritten text:'),
    'uki.bulletize': llm('Convert the following into 5 concise bullet points. Return only the bullets:'),
    // Create a real note in DEX Notes from the message. The notes store owns
    // persistence (native backend or localStorage fallback) and the open Notes
    // app subscribes to it, so the note appears live or on next open.
    'notes.create': async (params) => {
      const raw = String(params.text ?? '').trim();
      const body = raw.replace(/^(new note|create (a )?note|take a note|note that|note)\s*[:,\-]?\s*/i, '').trim();
      if (!body) throw new Error('there was nothing to put in the note');
      const store = useNotesStore.getState();
      const id = await store.createNote();
      if (!id) throw new Error('could not create the note');
      const title = body.split('\n')[0].slice(0, 80) || 'Untitled';
      const content = JSON.stringify({
        type: 'doc',
        content: body.split('\n').map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        })),
      });
      await store.updateNote(id, { title, plain_text: body, content });
      const a = resolveAppTarget('notes');
      if (a) useRunningApps.getState().launchApp({ id: a.id, name: a.name, icon: a.icon, color: a.color });
      return `Created note "${title}".`;
    },
    // Create a real task in DEX Tasks. Tasks keeps its own local state + storage
    // (no shared store), so queue the task durably and signal the app to drain it
    // -- it adds + persists whether it is already open or opened fresh by us.
    'tasks.create': (params) => {
      const raw = String(params.text ?? '').trim();
      const title = raw.replace(/^(add (a )?task|create (a )?task|new task|remind me to|add to-?do|to-?do)\s*[:,\-]?\s*/i, '').trim();
      if (!title) throw new Error('no task text was given');
      try {
        const q = JSON.parse(localStorage.getItem('dex-uki-pending-tasks') || '[]');
        const arr = Array.isArray(q) ? q : [];
        arr.push({ title });
        localStorage.setItem('dex-uki-pending-tasks', JSON.stringify(arr));
      } catch { /* non-fatal: the app drains what it can */ }
      const a = resolveAppTarget('tasks');
      if (a) useRunningApps.getState().launchApp({ id: a.id, name: a.name, icon: a.icon, color: a.color });
      window.dispatchEvent(new CustomEvent('uki:tasks-pending'));
      return `Added task "${title}".`;
    },
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
  const control = parseSystemControl(trimmed);
  if (control) {
    const open = opensAccess(control);
    return {
      understood: true,
      plan: { id: 'system-control', goal: trimmed, steps: [{ id: 'system-control-1', actionId: open ? 'system.open' : 'system.safe', params: { target: trimmed } }] },
      summary: describeSystemControl(control),
      tier: open ? 'confirm' : 'auto',
    };
  }
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

  // Same guard for catalog action commands: if the phrase doesn't resolve to a
  // real DEX command, don't offer it -- let it fall through to normal chat.
  const unresolvedDex = plan.steps.some(
    (s) => s.actionId === 'dex.command' && !resolveDexAction(String(s.params.target ?? '')),
  );
  if (unresolvedDex) plan = { ...plan, steps: [] };

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
