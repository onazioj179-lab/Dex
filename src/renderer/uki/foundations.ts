// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's intellectual foundations, as working method rather than personas.
 *
 * Five lenses (named for the people whose way of working they encode) are
 * selected per task and blended into ONE voice: UKI never role-plays them or
 * names them in answers. A shared reasoning core (Stoic calm, first
 * principles, empiricism, pragmatism, Socratic inquiry, humanism, fallibilism)
 * applies to every turn and to every agent, so Umari and Xack reason the same
 * way while keeping their own jobs and permissions.
 *
 * Prompt budget matters (every token is latency), so only the 1-3 lenses a
 * task needs are included, each as two or three concrete rules.
 */

export type FoundationId = 'hopper' | 'lovelace' | 'hypatia' | 'lamarr' | 'hamilton';

export interface Foundation {
  id: FoundationId;
  /** Who the lens is drawn from (documentation / tests; never sent as a persona). */
  inspiredBy: string;
  focus: string;
  /** Concrete operating rules, written as instructions. */
  rules: readonly string[];
  /** Words in a request that call for this lens. */
  cues: RegExp;
}

export const FOUNDATIONS: Record<FoundationId, Foundation> = {
  hopper: {
    id: 'hopper',
    inspiredBy: 'Grace Hopper',
    focus: 'programming, debugging and software engineering',
    rules: [
      'Read the actual error or code before proposing a fix; reproduce it when a tool allows.',
      'Prefer the smallest change that fixes the cause, and say how to confirm it worked.',
    ],
    cues: /\b(code|bug|debug|error|exception|stack ?trace|compile|build|test|function|refactor|typescript|javascript|python|rust|script|regex|api|git|commit|terminal|command|crash|fix)\b/i,
  },
  lovelace: {
    id: 'lovelace',
    inspiredBy: 'Ada Lovelace',
    focus: 'algorithms, mathematics and computational reasoning',
    rules: [
      'Work the problem step by step and show the key steps, not just the result.',
      'Check edge cases and units; state complexity or precision when it matters.',
    ],
    cues: /\b(algorithm|math|calculat|equation|formula|probability|statistic|complexity|optimi[sz]e|proof|matrix|integral|derivative|convert|percent|\d+\s*[-+*/^x]\s*\d+)/i,
  },
  hypatia: {
    id: 'hypatia',
    inspiredBy: 'Hypatia',
    focus: 'research, critical analysis and independent judgement',
    rules: [
      'Separate what the sources show from what you infer, and name the source.',
      'Give the strongest opposing view before concluding; say what evidence would change the answer.',
    ],
    cues: /\b(research|why|explain|compare|versus|vs\.?|evidence|source|history|philosoph|argument|analy[sz]e|true|fact|study|should i|pros and cons|opinion)\b/i,
  },
  lamarr: {
    id: 'lamarr',
    inspiredBy: 'Hedy Lamarr',
    focus: 'invention and unconventional, cross-disciplinary solutions',
    rules: [
      'Alongside the conventional answer, offer one unconventional option borrowed from another field, if it is genuinely useful.',
    ],
    cues: /\b(idea|brainstorm|creative|design|invent|alternative|novel|stuck|another way|innovat|name for|concept)\b/i,
  },
  hamilton: {
    id: 'hamilton',
    inspiredBy: 'Margaret Hamilton',
    focus: 'architecture, reliability and security',
    rules: [
      'Before acting, consider what fails if the input is wrong or a step errors, and handle it.',
      'Use the least privilege that works; anything irreversible waits for the user\'s confirmation.',
      'Report each action\'s real outcome; a step that did not complete is said plainly.',
    ],
    cues: /\b(delete|remove|move|rename|install|run|execute|deploy|security|secure|permission|password|backup|architect|reliab|production|system|settings|overwrite|send)\b/i,
  },
};

/**
 * The reasoning core every agent shares. Written as behaviour, so a model can
 * follow it; the schools it comes from are noted for maintainers only:
 * Stoicism, rationalism / first principles, empiricism, pragmatism, Socratic
 * inquiry, humanism, fallibilism.
 */
export const REASONING_CORE: readonly string[] = [
  'Stay even and factual, especially when something failed; focus on what can be done next.', // Stoicism
  'Break problems into their fundamentals instead of reasoning by analogy alone.', // rationalism, first principles
  'Prefer checking (a tool, a file, a source) over asserting; never invent results, files or capabilities.', // empiricism
  'Optimise for what actually helps the user finish their task.', // pragmatism
  'If a request is ambiguous and a wrong guess would be costly, ask one precise question; otherwise state your assumption and proceed.', // Socratic inquiry
  'Respect the user\'s autonomy and wellbeing: explain trade-offs, do not decide for them where the choice is theirs.', // humanism
  'Say how sure you are when it matters. If the user is mistaken, say so politely with the reason; do not agree to please.', // fallibilism, no sycophancy
];

export type AgentId = 'uki' | 'umari' | 'xack';

/**
 * Each agent keeps its identity and tools; this only sets which lenses it
 * always leans on in addition to what the task calls for.
 */
export const AGENT_EMPHASIS: Record<AgentId, { role: string; always: readonly FoundationId[] }> = {
  uki: { role: 'UKI, the intelligence layer of DEX', always: [] },
  umari: { role: 'Umari, the project and file knowledge agent', always: ['hypatia'] },
  xack: { role: 'Xack, the action and permission broker', always: ['hamilton'] },
};

const MAX_LENSES = 3;

/**
 * Pick the lenses a task needs, most relevant first. `actionable` (the turn
 * can use tools that change things) always brings in the reliability lens.
 */
export function selectFoundations(
  text: string,
  opts: { agent?: AgentId; foregroundAppId?: string | null; actionable?: boolean } = {},
): FoundationId[] {
  const scored: Array<{ id: FoundationId; score: number }> = [];
  for (const f of Object.values(FOUNDATIONS)) {
    const hits = (text.match(new RegExp(f.cues.source, 'gi')) ?? []).length;
    if (hits) scored.push({ id: f.id, score: hits });
  }
  // The app the user is in is a strong hint about the kind of work.
  const app = opts.foregroundAppId ?? '';
  if (/dexcode|terminal|git|env|ssh/.test(app)) scored.push({ id: 'hopper', score: 0.5 });
  if (/calculator|unitconverter|ledger/.test(app)) scored.push({ id: 'lovelace', score: 0.5 });
  if (/browser|notes|learn|pdfviewer/.test(app)) scored.push({ id: 'hypatia', score: 0.5 });

  const total = new Map<FoundationId, number>();
  for (const s of scored) total.set(s.id, (total.get(s.id) ?? 0) + s.score);
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  const forced: FoundationId[] = [...AGENT_EMPHASIS[opts.agent ?? 'uki'].always];
  if (opts.actionable && !forced.includes('hamilton')) forced.push('hamilton');
  const out: FoundationId[] = [];
  for (const id of [...forced, ...ranked]) if (!out.includes(id)) out.push(id);
  return out.slice(0, MAX_LENSES);
}

/** The prompt block: shared core + the selected lenses' rules. */
export function buildReasoningBlock(lenses: readonly FoundationId[], agent: AgentId = 'uki'): string {
  const lines = [`[How ${AGENT_EMPHASIS[agent].role.split(',')[0]} reasons]`, ...REASONING_CORE.map((r) => `- ${r}`)];
  if (lenses.length) {
    lines.push('[For this task]');
    for (const id of lenses) for (const r of FOUNDATIONS[id].rules) lines.push(`- ${r}`);
  }
  lines.push('Speak as one consistent voice; never name these principles or the people behind them.');
  return lines.join('\n');
}

// -- Outcome verification (cross-check the answer against what really ran) ----

export interface ToolOutcome { name: string; result: string }

const FAILED = /^(Not performed|Tool error|Error|Failed|Denied|Blocked|Cancelled)\b|declined|not allowed|permission (?:is )?missing|could not|couldn't|refused/i;
const CLAIMS_SUCCESS = /\b(done|completed|i(?:'ve| have) (?:\w+ ){0,2}(?:created|deleted|moved|renamed|saved|opened|ran|run|sent|installed|updated|added|removed|written|wrote)|successfully|all set)\b/i;

/**
 * A deterministic check run after the model's final answer: when a tool that
 * the turn used did not complete, and the answer reads as success without
 * mentioning that tool's failure, append the real outcome. The model is told
 * never to do this; this makes it impossible for the user to be misled if it
 * does anyway.
 */
export function verifyAnswerAgainstOutcomes(answer: string, outcomes: readonly ToolOutcome[]): string {
  const failed = outcomes.filter((o) => FAILED.test(o.result.trim()));
  if (!failed.length || !CLAIMS_SUCCESS.test(answer)) return answer;
  const acknowledged = /not (?:performed|completed|done)|did(?:n't| not)|failed|couldn't|could not|declined|blocked|wasn't|was not/i.test(answer);
  if (acknowledged) return answer;
  const notes = failed.map((o) => `${o.name}: ${o.result.replace(/\s+/g, ' ').slice(0, 160)}`);
  return `${answer}\n\nCorrection: not everything above completed. ${notes.join(' ')}`;
}
