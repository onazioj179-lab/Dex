// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's view of the running processes, all of them, however many.
 *
 * The native digest (src-tauri/src/process_digest.rs, `system:processDigest`)
 * adds same-named processes up and keeps only totals, the top programs and
 * name matches, so 1,000+ processes become a few lines. This module turns it
 * into text for the model (the `system_processes` tool) and answers the common
 * questions directly, without a provider: "what's using my CPU", "what uses
 * the most memory", "how many processes", "is zoom running".
 */

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

export interface ProgramRow { name: string; count: number; cpu: number; memoryMb: number; windowed: boolean; pids?: number[] }
export interface ProcessDigest {
  processes: number;
  programs: number;
  cpu: number;
  memoryMb: number;
  totalMemoryMb: number;
  kinds?: Record<string, { count: number; memoryMb: number }>;
  topCpu: ProgramRow[];
  topMemory: ProgramRow[];
  query?: string;
  matches?: ProgramRow[];
}

const gb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const label = (r: ProgramRow) => `${r.name}${r.count > 1 ? ` (${r.count} processes)` : ''}`;

export type ProcessQuestion =
  | { kind: 'cpu' } | { kind: 'memory' } | { kind: 'count' } | { kind: 'running'; name: string } | { kind: 'overview' };

/** Recognise a process question, or null. */
export function parseProcessQuestion(text: string): ProcessQuestion | null {
  const t = text.toLowerCase().replace(/[?!.]+$/, '').trim();
  const running = /^(?:is|are)\s+(.+?)\s+(?:running|open|still running|still open)$/.exec(t)
    || /^(?:is there|any)\s+(.+?)\s+(?:process(?:es)?\s+)?running$/.exec(t);
  if (running) return { kind: 'running', name: running[1].replace(/^(the|my)\s+/, '').trim() };
  if (/\b(how many|number of|count)\b.*\b(processes|programs|apps)\b/.test(t)) return { kind: 'count' };
  if (/\b(cpu|processor|slow(ing)?|lag(ging)?|hot|fan)\b/.test(t) && /\b(what|which|who|why)\b/.test(t)) return { kind: 'cpu' };
  if (/\b(memory|ram)\b/.test(t) && /\b(what|which|who|why|most|using|hog)\b/.test(t)) return { kind: 'memory' };
  if (/\b(what('?s| is)|show|list)\b.*\b(running|processes)\b/.test(t) || /\btop processes\b/.test(t)) return { kind: 'overview' };
  return null;
}

export function formatProcessAnswer(d: ProcessDigest, q: ProcessQuestion = { kind: 'overview' }): string {
  const head = `${d.processes.toLocaleString()} processes from ${d.programs.toLocaleString()} programs; CPU ${d.cpu}%, memory ${gb(d.memoryMb)}${d.totalMemoryMb ? ` of ${gb(d.totalMemoryMb)}` : ''}.`;
  const list = (rows: ProgramRow[], by: 'cpu' | 'memory', n = 5) =>
    rows.slice(0, n).map((r, i) => `${i + 1}. ${label(r)}: ${by === 'cpu' ? `${r.cpu}% CPU, ${gb(r.memoryMb)}` : `${gb(r.memoryMb)}, ${r.cpu}% CPU`}`).join('\n');
  switch (q.kind) {
    case 'count': {
      const k = d.kinds ?? {};
      const parts = [k.app && `${k.app.count} with a window`, k.background && `${k.background.count} in the background`, k.dex && `${k.dex.count} belong to DEX`].filter(Boolean);
      return `${head}${parts.length ? ` ${parts.join(', ')}.` : ''}`;
    }
    case 'cpu':
      return `${head}\nUsing the most CPU right now:\n${list(d.topCpu, 'cpu')}`;
    case 'memory':
      return `${head}\nUsing the most memory:\n${list(d.topMemory, 'memory')}`;
    case 'running': {
      const m = d.matches ?? [];
      if (!m.length) return `No process matching "${q.name}" is running.`;
      return m.slice(0, 5).map((r) => `Yes: ${label(r)} is running, ${gb(r.memoryMb)}, ${r.cpu}% CPU${r.pids?.length ? ` (PID ${r.pids.slice(0, 6).join(', ')}${r.pids.length > 6 ? ', …' : ''})` : ''}.`).join('\n');
    }
    default:
      return `${head}\nTop by CPU:\n${list(d.topCpu, 'cpu', 4)}\nTop by memory:\n${list(d.topMemory, 'memory', 4)}`;
  }
}

/** Fetch the digest (optionally searching a name). */
export async function fetchProcessDigest(invoke: Invoke, query?: string): Promise<ProcessDigest | null> {
  const r = await invoke('system:processDigest', query ? { query } : {}).catch(() => null);
  return r && typeof r === 'object' && typeof (r as ProcessDigest).processes === 'number' ? (r as ProcessDigest) : null;
}

/** The `system_processes` tool: read-only, compact whatever the process count. */
export async function runProcessTool(args: Record<string, unknown>, invoke?: Invoke): Promise<string> {
  const inv = invoke ?? (() => {
    const dex = (globalThis as unknown as { dex?: { invoke?: Invoke } }).dex;
    return dex?.invoke ? dex.invoke.bind(dex) : null;
  })();
  if (!inv) return 'The process list needs the DEX desktop app.';
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const by = args.by === 'cpu' ? 'cpu' : args.by === 'memory' ? 'memory' : null;
  const d = await fetchProcessDigest(inv, name || undefined);
  if (!d) return 'The process list is not available right now.';
  const q: ProcessQuestion = name ? { kind: 'running', name } : by === 'cpu' ? { kind: 'cpu' } : by === 'memory' ? { kind: 'memory' } : { kind: 'overview' };
  return formatProcessAnswer(d, q);
}
