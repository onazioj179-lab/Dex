// =============================================================================
// DEX Platform — Wave 8.2 crash export
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Crash export — gathers a structured crash report (stack + recent op log +
 * system info, no PII) and writes it to ~/.dex/crashes/<timestamp>.json so
 * the user can attach it to a bug report.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OpLogEntry {
  ts: number;
  op: string;
  durationMs?: number;
  detail?: string;
}

export interface CrashReport {
  reportVersion: 1;
  timestamp: string;
  appVersion: string;
  platform: string;
  arch: string;
  cpuModel: string;
  totalMemoryMb: number;
  freeMemoryMb: number;
  electronVersion?: string;
  nodeVersion: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  recentOps: OpLogEntry[];
}

const RING: OpLogEntry[] = [];
const RING_SIZE = 200;

export function logOp(entry: OpLogEntry): void {
  RING.push(entry);
  if (RING.length > RING_SIZE) RING.shift();
}

export function snapshotOps(): OpLogEntry[] {
  return RING.slice();
}

export function buildReport(err: unknown, appVersion: string): CrashReport {
  const cpus = os.cpus();
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    reportVersion: 1,
    timestamp: new Date().toISOString(),
    appVersion,
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMemoryMb: Math.round(os.totalmem() / 1_048_576),
    freeMemoryMb: Math.round(os.freemem() / 1_048_576),
    electronVersion: (process.versions as Record<string, string | undefined>).electron,
    nodeVersion: process.versions.node,
    error: { name: e.name, message: redact(e.message), stack: redact(e.stack ?? '') },
    recentOps: snapshotOps(),
  };
}

export async function writeReport(report: CrashReport): Promise<string> {
  const dir = process.env.DEX_HOME ?? path.join(os.homedir(), '.dex');
  const crashes = path.join(dir, 'crashes');
  await fs.mkdir(crashes, { recursive: true });
  const file = path.join(crashes, `${report.timestamp.replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

/** Strip absolute paths to the home directory + email-like tokens. */
function redact(s: string): string {
  if (!s) return s;
  const home = os.homedir();
  const emailRe = /[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/g;
  return s.split(home).join('~').replace(emailRe, '<redacted-email>');
}
