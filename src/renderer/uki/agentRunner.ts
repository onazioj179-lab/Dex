// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI agentic tool loop.
 *
 * The LLM path used to be text-in / text-out: ask once, stream the answer. That
 * made UKI "dumb" -- it could not search the web for real, could not act on DEX,
 * and could not take more than one step. This adds a provider-agnostic ReAct loop
 * on top of the existing `askConfiguredLLM` (works across OpenAI/Anthropic/Google/
 * Ollama/OpenRouter with NO per-provider tool-format wiring):
 *
 *   - The model is given a tool catalog + a one-line text protocol.
 *   - When it wants a tool it replies `TOOL <name> {json-args}`; we run the tool,
 *     feed the result back as the next turn, and loop.
 *   - When it replies without a TOOL line, that is the final answer.
 *
 * Tools are REAL: web_search hits live keyless endpoints (DuckDuckGo + Wikipedia
 * via freeApis), and open_app/close_app/notify drive the actual DEX shell. The
 * loop is bounded by a per-tool budget (shared/uki/webCache) and a step cap.
 */

import { askConfiguredLLM } from './providers/connect';
import type { ChatMessage } from './providers/types';
import { searchWikipedia, lookupInstantAnswer } from './freeApis';
import { formatUkiContexts } from './appContextRegistry';
import { TtlCache, createToolBudget, chargeTool, type ToolBudget } from '../../shared/uki/webCache';
import { notify } from '../services/notify';
import { APP_DEFINITIONS } from '../store/runningApps';

const KNOWN_TOOLS = ['web_search', 'open_app', 'close_app', 'notify', 'get_context', 'list_apps'] as const;
type ToolName = typeof KNOWN_TOOLS[number];

const AGENT_PROTOCOL = `
You are UKI, the in-OS assistant for DEX, and you can ACT, not just talk. You have tools.

When a tool would help, reply with EXACTLY one line and nothing else:
TOOL <tool_name> <json-arguments>
For example:
TOOL web_search {"query": "James Webb telescope latest discovery"}
TOOL open_app {"app": "notes"}

I will run it and reply with a line that starts with "RESULT:" containing the output. Then continue
(use another tool, or give your final answer). When you have the answer, reply NORMALLY with no TOOL line.

Use tools deliberately:
- web_search {"query": string} -- CURRENT or factual info from the live web (news, prices, people, "latest", anything you are unsure about). Prefer this over guessing.
- open_app {"app": string} -- open a DEX app for the user (name or id, e.g. "notes", "Settings", "kanban").
- close_app {"app": string} -- close a running DEX app.
- notify {"title": string, "body": string} -- show the user a notification.
- get_context {} -- see what the user is currently looking at (active app, file, selection).
- list_apps {} -- list the DEX apps you can open.

Rules: take real action when the user asks you to control DEX. Search the web before answering about current
events or anything you cannot be sure of. Keep final answers concise and friendly. Never invent a tool result.
`.trim();

// Web-search results are stable for a few minutes; cache to avoid re-fetching on
// a follow-up turn in the same conversation.
const webSearchCache = new TtlCache<string, string>(5 * 60 * 1000, 200);

interface ToolCall { name: ToolName; args: Record<string, unknown>; }

/** Extract the first valid `TOOL <name> {json}` directive, or null for a final answer. */
function parseToolDirective(reply: string): ToolCall | null {
  const m = reply.match(/(?:^|\n)\s*(?:`{3}\s*)?TOOL\s+([a-zA-Z_]+)[ \t]*(\{[\s\S]*?\})?/);
  if (!m) return null;
  const name = m[1] as ToolName;
  if (!(KNOWN_TOOLS as readonly string[]).includes(name)) return null;
  let args: Record<string, unknown> = {};
  if (m[2]) { try { args = JSON.parse(m[2]); } catch { /* tolerate malformed args */ } }
  return { name, args };
}

function dispatch(event: string, detail: Record<string, unknown>): void {
  try { window.dispatchEvent(new CustomEvent(event, { detail })); } catch { /* noop */ }
}

/** Real keyless web search: DuckDuckGo Instant Answer + Wikipedia, merged. */
export async function webSearch(query: string): Promise<string> {
  const q = (query || '').trim();
  if (!q) return 'No query provided.';
  const key = q.toLowerCase();
  const cached = webSearchCache.get(key);
  if (cached) return cached;
  const [ddg, wiki] = await Promise.all([
    lookupInstantAnswer(q).catch(() => null),
    searchWikipedia(q).catch(() => null),
  ]);
  const parts: string[] = [];
  if (ddg?.abstract) parts.push(`DuckDuckGo: ${ddg.abstract}${ddg.abstractSource ? ` (source: ${ddg.abstractSource})` : ''}`);
  if (wiki?.extract) parts.push(`Wikipedia — ${wiki.title}: ${wiki.extract}${wiki.contentUrl ? ` (${wiki.contentUrl})` : ''}`);
  const out = parts.length ? parts.join('\n\n') : `No web results found for "${q}".`;
  webSearchCache.set(key, out);
  return out;
}

async function runTool(name: ToolName, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'web_search':
      return webSearch(String(args.query ?? ''));
    case 'open_app': {
      const app = String(args.app ?? '').trim();
      if (!app) return 'No app specified.';
      dispatch('dex-open-app', { appId: app, appName: app });
      return `Opened ${app}.`;
    }
    case 'close_app': {
      const app = String(args.app ?? '').trim();
      if (!app) return 'No app specified.';
      dispatch('dex-close-app', { appId: app, appName: app });
      return `Closed ${app}.`;
    }
    case 'notify': {
      const title = String(args.title ?? 'UKI').trim() || 'UKI';
      const body = String(args.body ?? '').trim();
      void notify({ title, body, source: 'UKI' });
      return 'Notification shown to the user.';
    }
    case 'get_context': {
      const ctx = formatUkiContexts();
      return ctx && ctx.trim() ? ctx : 'No active app context right now.';
    }
    case 'list_apps':
      return Object.entries(APP_DEFINITIONS).map(([id, d]) => `${id} (${d.name})`).join(', ');
    default:
      return `Unknown tool: ${name}`;
  }
}

export interface UkiAgentOptions {
  userText: string;
  /** Base system prompt (DEX/app context + live facts), already assembled. */
  systemPrompt: string;
  /** Prior conversation turns (most-recent last). */
  history?: ChatMessage[];
  /** Surfaces each tool action into UKI's "show thinking" trace. */
  pushStep?: (step: string) => void;
  /** Hard cap on reasoning/tool steps before forcing a final answer. */
  maxSteps?: number;
}

/**
 * Run the agentic loop and return the final answer text, or null if no provider
 * is configured / the model call fails (the caller then degrades to the local
 * fallback, exactly as the old single-shot path did).
 */
export async function runUkiAgent(opts: UkiAgentOptions): Promise<string | null> {
  const pushStep = opts.pushStep ?? (() => {});
  const maxSteps = opts.maxSteps ?? 5;
  const sys = `${opts.systemPrompt}\n\n${AGENT_PROTOCOL}`;
  const messages: ChatMessage[] = [...(opts.history ?? [])];
  let userTurn = opts.userText;
  let budget: ToolBudget = createToolBudget({
    web_search: 4, open_app: 4, close_app: 4, notify: 3, get_context: 2, list_apps: 1,
  });

  for (let step = 0; step < maxSteps; step++) {
    const reply = await askConfiguredLLM(userTurn, sys, {
      history: messages,
      chatOptions: { temperature: 0.5, maxTokens: 700 },
    });
    if (!reply) return null; // provider failure -> caller degrades

    const call = parseToolDirective(reply);
    if (!call) return reply; // no tool requested -> final answer

    // Record the model's tool request turn so it sees its own prior steps.
    messages.push({ role: 'user', content: userTurn });
    messages.push({ role: 'assistant', content: reply });

    const charged = chargeTool(budget, call.name);
    budget = charged.budget;
    if (!charged.ok) {
      pushStep(`Tool budget reached for ${call.name}`);
      userTurn = `RESULT: Budget for ${call.name} is exhausted. Give your best final answer now without more tools.`;
      continue;
    }

    const argPreview = Object.keys(call.args).length ? ` ${JSON.stringify(call.args).slice(0, 80)}` : '';
    pushStep(`Tool: ${call.name}${argPreview}`);
    let result: string;
    try {
      result = await runTool(call.name, call.args);
    } catch (e) {
      result = `Tool error: ${(e as Error)?.message || 'failed'}`;
    }
    userTurn = `RESULT: ${result}`.slice(0, 4000);
  }

  // Step cap hit -- force a tool-free synthesis from everything gathered.
  pushStep('Max tool steps reached -- synthesising answer');
  return askConfiguredLLM('Give your best final answer now. Do NOT use any more tools.', sys, {
    history: messages,
    chatOptions: { temperature: 0.5, maxTokens: 700 },
  });
}
