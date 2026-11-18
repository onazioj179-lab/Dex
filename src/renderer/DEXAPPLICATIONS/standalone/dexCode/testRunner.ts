// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Code test runner. The command is the one the project's manifest declares
// (Umari reads package.json / Cargo.toml / pyproject / go.mod ...); nothing is
// guessed. It runs through Xack: the approval sheet shows the exact command and
// folder, the ticket covers only that, and the terminal broker runs it
// non-elevated with output captured. The summary is parsed from the real
// output; an unrecognised format reports only the exit code.

import { xackRequest, xackDecide } from '../../../uki/xack';
import { requestApproval } from '../../../uki/approvals';
import { umariProjects, type UmariProject } from '../../../uki/umari';

type Invoke = (channel: string, ...args: unknown[]) => Promise<any>;
const invoke = (channel: string, arg?: unknown): Promise<any> => {
  const fn = (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke;
  return fn ? fn(channel, arg).catch(() => null) : Promise.resolve(null);
};

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** The project that owns `folder` (deepest root that contains it). Pure. */
export function projectFor(folder: string, projects: UmariProject[]): UmariProject | null {
  const f = norm(folder);
  let best: UmariProject | null = null;
  for (const p of projects) {
    const r = norm(p.root);
    if ((f === r || f.startsWith(`${r}\\`)) && (!best || r.length > norm(best.root).length)) best = p;
  }
  return best;
}

export interface TestSummary { passed?: number; failed?: number; skipped?: number; framework?: string }

/** Read pass/fail counts from common runners' final lines. Pure. */
export function summarizeTestOutput(out: string): TestSummary | null {
  const text = out.replace(/\x1b\[[0-9;]*m/g, '');
  let m = text.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/);
  if (m) return { framework: 'vitest', failed: Number(m[1] ?? 0), passed: Number(m[2]), skipped: m[3] ? Number(m[3]) : undefined };
  m = text.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed/);
  if (m) return { framework: 'jest', failed: Number(m[1] ?? 0), skipped: m[2] ? Number(m[2]) : undefined, passed: Number(m[3]) };
  const cargo = [...text.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored/g)];
  if (cargo.length) return { framework: 'cargo', passed: cargo.reduce((n, c) => n + Number(c[1]), 0), failed: cargo.reduce((n, c) => n + Number(c[2]), 0), skipped: cargo.reduce((n, c) => n + Number(c[3]), 0) };
  m = text.match(/=+ (?:(\d+) failed, )?(\d+) passed(?:, (\d+) skipped)?[^=]* in [\d.]+s/);
  if (m) return { framework: 'pytest', failed: Number(m[1] ?? 0), passed: Number(m[2]), skipped: m[3] ? Number(m[3]) : undefined };
  m = text.match(/=+ (\d+) failed(?:, (\d+) passed)?[^=]* in [\d.]+s/);
  if (m) return { framework: 'pytest', failed: Number(m[1]), passed: Number(m[2] ?? 0) };
  const goOk = (text.match(/^ok\s+\S+/gm) ?? []).length;
  const goFail = (text.match(/^FAIL\s+\S+/gm) ?? []).length;
  if (goOk + goFail > 0) return { framework: 'go (packages)', passed: goOk, failed: goFail };
  return null;
}

export async function findTestCommand(folder: string): Promise<{ project: UmariProject | null; command: string | null; why?: string }> {
  const projects = await umariProjects();
  if (!projects) return { project: null, command: null, why: 'Test discovery needs the DEX desktop app.' };
  const project = projectFor(folder, projects);
  if (!project) return { project: null, command: null, why: 'This folder is not a detected project. Add its parent in Settings › UKI › Indexed folders, or open a folder with package.json, Cargo.toml, pyproject.toml or go.mod.' };
  if (!project.testCommand) return { project, command: null, why: `${project.name}'s ${project.manifests.join(', ')} declares no test command.` };
  return { project, command: project.testCommand };
}

export interface TestRun { id: string; status: string; exitCode: number | null; output: string; summary: TestSummary | null }

/** Ask (Xack), run, and wait. `onProgress` gets the live output tail. */
export async function runTests(cwd: string, command: string, onProgress: (r: TestRun) => void, signal?: { cancelled: boolean }): Promise<TestRun> {
  const x = await xackRequest('terminal.run', { command, cwd }, { summary: command, scope: cwd });
  if (!x) throw new Error('Running tests needs the DEX desktop app.');
  if (x.decision === 'refuse') throw new Error(x.reason || 'Xack refused the command.');
  if (x.decision === 'ask') {
    const a = await requestApproval({
      title: 'run your project\'s tests',
      subject: command,
      code: true,
      facts: [{ label: 'Folder', value: cwd }],
      cls: x.class,
      reason: 'the test command your project declares; it runs as you, not as administrator',
      remember: ['exact'],
    });
    if (x.requestId) await xackDecide(x.requestId, a.allow, a.allow ? a.remember : 'once');
    if (!a.allow) throw new Error('Not run: you declined.');
  }
  const r = await invoke('ukiterm:run', { command, cwd, label: `Tests: ${command}`, timeoutSec: 1800, xackRequest: x.requestId ?? '' });
  if (!r?.ok) throw new Error(r?.error || 'The command broker refused it.');
  let run: TestRun = { id: r.id, status: 'running', exitCode: null, output: '', summary: null };
  for (;;) {
    await new Promise((res) => setTimeout(res, 600));
    if (signal?.cancelled) { await invoke('ukiterm:cancel', r.id); signal.cancelled = false; }
    const g = await invoke('ukiterm:get', r.id);
    const t = g?.task;
    if (!t) continue;
    const output = String(t.output ?? '');
    run = { id: r.id, status: t.status, exitCode: t.exitCode ?? null, output, summary: summarizeTestOutput(output) };
    onProgress(run);
    if (t.status !== 'running') return run;
  }
}
