// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI stress and behaviour suite.
 *
 * Drives the real agent loop (runUkiAgent: policy gate, Xack, tool budget,
 * tasks, audit) with a scripted model, so it measures UKI's own cost per step
 * and its behaviour under load, hostile model output and cancellation, without
 * a network or API key. Moderate by default (runs in CI); scale with
 * DEX_STRESS=10, and write the numbers with DEX_STRESS_REPORT=<path.json>.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { writeFileSync } from 'node:fs';

const SCALE = Math.max(1, Number(process.env.DEX_STRESS || 1));
const report: Record<string, unknown> = { scale: SCALE, at: new Date().toISOString() };

// --- Scripted model -----------------------------------------------------------------
// Each run puts its own script in the system prompt ("SCRIPT:<id>"), so concurrent
// runs can never borrow each other's replies.
const scripts = new Map<string, Array<string | ((signal?: AbortSignal) => Promise<string | null>)>>();
let modelCalls = 0;
vi.mock('../../src/renderer/uki/providers/connect', () => ({
  askConfiguredLLM: vi.fn(async (_user: string, system: string, o: { signal?: AbortSignal }) => {
    modelCalls++;
    const id = /SCRIPT:([\w-]+)/.exec(system)?.[1] ?? '';
    const q = scripts.get(id);
    const next = q?.shift();
    if (typeof next === 'function') return next(o?.signal);
    return next ?? `final answer for ${id}`;
  }),
}));
let grants: string[] = [];
vi.mock('../../src/renderer/uki/permissions', () => ({
  listGrants: vi.fn(async () => grants.map((capability) => ({ capability }))),
}));
vi.mock('../../src/renderer/uki/fileTools', () => ({
  FILE_TOOL_NAMES: ['find_files', 'read_file', 'write_file', 'create_folder', 'rename_file', 'move_file', 'trash_file'],
  runFileTool: vi.fn(async (name: string) => `ok ${name}`),
}));

import { runUkiAgent, setUkiToolConfirmHandler } from '../../src/renderer/uki/agentRunner';
import { getUkiActionAudit, clearUkiActionAudit } from '../../src/renderer/uki/appActionRegistry';
import { useUkiTasks } from '../../src/renderer/store/ukiTasksStore';
import { coreSystemPrompt, isCreatorQuestion } from '../../src/renderer/uki/identity';
import { isHistoryRequest, historyKeywords, rankHits, recallFromHistory, type HistoryHit } from '../../src/renderer/uki/chatHistory';
import { parseNoteRequest, parseSummarizeRequest, isReasoningRequest, summarizeText } from '../../src/renderer/uki/assistive';
import { pickUkiVoice } from '../../src/renderer/uki/voice';
import { updateRelationship, philosophyBlock } from '../../src/renderer/uki/philosophy';

// No real network in the suite: record what would have been fetched.
const netCalls: string[] = [];
globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  netCalls.push(String(input));
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
}
const ms = (t0: number) => performance.now() - t0;

beforeEach(() => {
  scripts.clear();
  grants = [];
  clearUkiActionAudit();
  useUkiTasks.setState({ tasks: [] });
  localStorage.clear();
  setUkiToolConfirmHandler(() => true);
});

afterAll(() => {
  if (process.env.DEX_STRESS_REPORT) writeFileSync(process.env.DEX_STRESS_REPORT, JSON.stringify(report, null, 2));
});

describe('UKI agent loop under load', () => {
  it('runs many tool-using turns with low per-step overhead', async () => {
    const runs = 150 * SCALE;
    const times: number[] = [];
    const before = modelCalls;
    for (let i = 0; i < runs; i++) {
      const id = `seq-${i}`;
      scripts.set(id, ['TOOL get_context {}', 'TOOL list_apps {}', `answer ${i}`]);
      const t0 = performance.now();
      const out = await runUkiAgent({ userText: `what is open ${i}`, systemPrompt: `sys SCRIPT:${id}` });
      times.push(ms(t0));
      expect(out).toContain(`answer ${i}`);
    }
    const perRun = { p50: pct(times, 50), p95: pct(times, 95), max: Math.max(...times) };
    report.sequentialRunMs = perRun;
    report.modelCallsPerRun = (modelCalls - before) / runs;
    // Three model steps and two tools per run; UKI's own work must stay small.
    expect(perRun.p95).toBeLessThan(60);
    // Finished tasks are pruned: the store never grows without bound.
    expect(useUkiTasks.getState().tasks.length).toBeLessThanOrEqual(50);
  });

  it('keeps concurrent runs apart (no answer crosses between runs)', async () => {
    const n = 60 * SCALE;
    const delay = (v: string, t: number) => () => new Promise<string>((r) => setTimeout(() => r(v), t));
    for (let i = 0; i < n; i++) scripts.set(`par-${i}`, [delay('TOOL get_context {}', (i * 7) % 13), delay(`only-mine-${i}`, (i * 5) % 11)]);
    const t0 = performance.now();
    const outs = await Promise.all(Array.from({ length: n }, (_, i) => runUkiAgent({ userText: `q${i}`, systemPrompt: `sys SCRIPT:par-${i}` })));
    report.concurrent = { runs: n, totalMs: ms(t0) };
    outs.forEach((o, i) => expect(o).toContain(`only-mine-${i}`));
    expect(useUkiTasks.getState().tasks.some((t) => t.status === 'running')).toBe(false);
  });

  it('survives hostile model output and always terminates', async () => {
    const cases: Record<string, string[]> = {
      garbage: ['TOOL', 'TOOL {{{', 'TOOL read_file not json', 'final'],
      unknownTool: ['TOOL format_disk {"drive":"C"}', 'final'],
      hugeArgs: [`TOOL web_search {"query": "${'x'.repeat(200_000)}"}`, 'final'],
      endlessTools: Array.from({ length: 200 }, () => 'TOOL get_context {}'),
      empty: ['', '   ', 'final'],
    };
    for (const [name, script] of Object.entries(cases)) {
      scripts.set(name, [...script]);
      const t0 = performance.now();
      const out = await runUkiAgent({ userText: `case ${name}`, systemPrompt: `sys SCRIPT:${name}` });
      const took = ms(t0);
      expect(typeof out === 'string' || out === null, name).toBe(true);
      expect(took, name).toBeLessThan(5000);
      report[`hostile_${name}_ms`] = Math.round(took);
    }
    // An oversized argument is refused by validation before any network call.
    expect(report.hostile_hugeArgs_ms as number).toBeLessThan(300);
    expect(netCalls.filter((u) => u.length > 10_000)).toEqual([]);
    // The endless tool loop must have been cut off by the step cap, not run 200 times.
    const calls = getUkiActionAudit().filter((a) => a.id === 'get_context').length;
    expect(calls).toBeLessThan(40);
    // A tool that does not exist must never run.
    expect(getUkiActionAudit().some((a) => a.id === 'format_disk' && a.outcome === 'ran')).toBe(false);
  });

  it('cancels a storm of in-flight runs cleanly', async () => {
    const n = 30 * SCALE;
    const hang = (signal?: AbortSignal) => new Promise<string | null>((resolve) => {
      if (signal?.aborted) { resolve(null); return; }
      signal?.addEventListener('abort', () => resolve(null), { once: true });
    });
    for (let i = 0; i < n; i++) scripts.set(`cx-${i}`, ['TOOL get_context {}', hang]);
    const runs = Array.from({ length: n }, (_, i) => runUkiAgent({ userText: `long job ${i}`, systemPrompt: `sys SCRIPT:cx-${i}` }));
    for (let i = 0; i < 200 && useUkiTasks.getState().tasks.filter((t) => t.status === 'running').length < Math.min(n, 50); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const t0 = performance.now();
    for (const t of useUkiTasks.getState().tasks) if (t.status === 'running') useUkiTasks.getState().cancelTask(t.id);
    const outs = await Promise.all(runs.map((r) => Promise.race([r, new Promise<string>((res) => setTimeout(() => res('__HUNG__'), 3000))])));
    report.cancelStorm = { runs: n, settleMs: Math.round(ms(t0)) };
    expect(outs.filter((o) => o === '__HUNG__').length).toBe(0);
    expect(useUkiTasks.getState().tasks.some((t) => t.status === 'running')).toBe(false);
  });

  it('never runs a risky tool without asking, even under load', async () => {
    grants = ['file-write'];
    let asked = 0;
    setUkiToolConfirmHandler(() => { asked++; return false; });
    const n = 40 * SCALE;
    await Promise.all(Array.from({ length: n }, (_, i) => {
      scripts.set(`risk-${i}`, ['TOOL trash_file {"path": "C:\\\\Users\\\\me\\\\Downloads\\\\x.zip"}', 'ok']);
      return runUkiAgent({ userText: `delete ${i}`, systemPrompt: `sys SCRIPT:risk-${i}` });
    }));
    expect(asked).toBe(n);
    expect(getUkiActionAudit().filter((a) => a.id === 'trash_file' && a.outcome === 'ran')).toHaveLength(0);
  });
});

describe('UKI memory at scale', () => {
  it('ranks a very large history quickly', () => {
    const n = 20_000 * SCALE;
    const words = ['budget', 'lagos', 'trip', 'terminal', 'rust', 'notes', 'maps', 'invoice', 'dock', 'voice'];
    const hits: HistoryHit[] = Array.from({ length: n }, (_, i) => ({
      conversation_id: `c${i % 997}`, conversation_title: `Chat ${i % 997}`, role: i % 2 ? 'copilot' : 'user',
      content: `${words[i % 10]} ${words[(i * 3) % 10]} message ${i} ${'lorem '.repeat(i % 20)}`, timestamp: i,
    }));
    const t0 = performance.now();
    const top = rankHits(hits, ['budget', 'lagos', 'trip'], null, 8);
    const took = ms(t0);
    report.rankHitsMs = { hits: n, ms: Math.round(took) };
    expect(top).toHaveLength(8);
    expect(took).toBeLessThan(400 * SCALE);
  });

  it('recalls from a slow, large store without blocking for long', async () => {
    const invoke = vi.fn(async (_ch: string, q: unknown) => {
      await new Promise((r) => setTimeout(r, 15));
      return Array.from({ length: 1000 }, (_, i) => ({ conversation_id: `c${i}`, role: 'user', content: `${q} and lagos budget detail ${i}`, timestamp: i }));
    });
    const t0 = performance.now();
    const block = await recallFromHistory(invoke, 'what did we say about the lagos trip budget');
    const took = ms(t0);
    report.recallMs = Math.round(took);
    expect(block).toContain('From earlier conversations');
    expect(block.split('\n').length).toBeLessThanOrEqual(11);
    // Keyword searches run in parallel, so total ~ one search, not one per keyword.
    expect(took).toBeLessThan(400);
  });

  it('keeps her core prompt small enough to stay fast', () => {
    updateRelationship(Array.from({ length: 300 }, (_, i) => ({ title: `${['budget', 'maps', 'terminal'][i % 3]} chat ${i}` })));
    const prompt = coreSystemPrompt();
    report.corePromptChars = prompt.length;
    expect(prompt).toContain('trusted');
    expect(philosophyBlock().length).toBeLessThan(1600);
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe('UKI understanding (behaviour corpus)', () => {
  type Case = [string, (t: string) => unknown, unknown];
  const yes = true, no = false;
  const corpus: Case[] = [
    ['who made you?', isCreatorQuestion, yes],
    ['Who created DEX', isCreatorQuestion, yes],
    ['who built uki', isCreatorQuestion, yes],
    ['what is your creator called, who is your creator', isCreatorQuestion, yes],
    ['who won the match last night', isCreatorQuestion, no],
    ['make me a playlist', isCreatorQuestion, no],
    ['what did we talk about yesterday', isHistoryRequest, yes],
    ['continue where we left off on the budget', isHistoryRequest, yes],
    ['remember what I told you about my sister?', isHistoryRequest, yes],
    ['show my chat history about maps', isHistoryRequest, yes],
    ['did we decide on the hotel', isHistoryRequest, yes],
    ['what is the capital of Ghana', isHistoryRequest, no],
    ['open terminal', isHistoryRequest, no],
    ['take a note that the meeting moved to 3pm', parseNoteRequest, 'the meeting moved to 3pm'],
    ['note: buy milk', parseNoteRequest, 'buy milk'],
    ['remember that my passport expires in May', parseNoteRequest, 'my passport expires in May'],
    ['what is a note in music', parseNoteRequest, null],
    ['how did you get that?', isReasoningRequest, yes],
    ['show your thinking', isReasoningRequest, yes],
    ['how do I bake bread', isReasoningRequest, no],
  ];
  it('routes every corpus utterance correctly', () => {
    const misses: string[] = [];
    for (const [text, fn, want] of corpus) {
      const got = fn(text);
      const ok = typeof want === 'string' ? (got as string | null)?.toLowerCase() === want.toLowerCase() : want === null ? got === null : !!got === want;
      if (!ok) misses.push(`${fn.name}("${text}") -> ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    }
    report.corpus = { cases: corpus.length, misses };
    expect(misses).toEqual([]);
  });

  it('understands summarize requests', () => {
    expect(parseSummarizeRequest('summarize my clipboard')).toBeTruthy();
    expect(parseSummarizeRequest('summarize this')).toBeTruthy();
    expect(parseSummarizeRequest('what is a summary')).toBeNull();
  });

  it('pulls the right search words out of history questions', () => {
    expect(historyKeywords('What did we decide about the Lagos hotel booking last week?')).toEqual(expect.arrayContaining(['lagos', 'hotel', 'booking']));
  });
});

describe('UKI on-device speed', () => {
  it('summarizes a long document fast', () => {
    const text = Array.from({ length: 2000 * SCALE }, (_, i) => `Sentence ${i} talks about ${['budgets', 'travel', 'hiring', 'rust'][i % 4]} and outcomes.`).join(' ');
    const t0 = performance.now();
    const s = summarizeText(text, 3);
    const took = ms(t0);
    report.summarizeMs = { sentences: 2000 * SCALE, ms: Math.round(took) };
    expect(s.length).toBeGreaterThan(0);
    expect(took).toBeLessThan(1500 * SCALE);
  });

  it('picks her voice from a long voice list instantly', () => {
    const voices = Array.from({ length: 500 }, (_, i) => ({ name: `Voice ${i}`, lang: i % 3 ? 'en-US' : 'fr-FR', voiceURI: `v${i}` }));
    voices.push({ name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB', voiceURI: 'sonia' });
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) pickUkiVoice(voices);
    const took = ms(t0) / 200;
    report.pickVoiceMs = Number(took.toFixed(3));
    expect(pickUkiVoice(voices)?.voiceURI).toBe('sonia');
    expect(took).toBeLessThan(5);
  });
});
