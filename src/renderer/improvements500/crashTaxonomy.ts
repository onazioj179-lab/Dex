// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Crash record taxonomy. Maps free-form crash reports into a small set of
 * categories for dashboards and rollback policies.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export type CrashCategory =
  | 'renderer'
  | 'main'
  | 'native'
  | 'gpu'
  | 'memory'
  | 'worker'
  | 'unhandled-rejection'
  | 'unknown';

export interface CrashRecord {
  type?: string;
  reason?: string;
  message?: string;
  stack?: string;
}

export function classifyCrash(record: CrashRecord): CrashCategory {
  const haystack = `${record.type ?? ''} ${record.reason ?? ''} ${record.message ?? ''}`.toLowerCase();
  if (/gpu|webgl|d3d|metal/.test(haystack)) return 'gpu';
  if (/oom|out of memory|allocator|heap/.test(haystack)) return 'memory';
  if (/worker|utility-process/.test(haystack)) return 'worker';
  if (/native|napi|rust panic|segfault/.test(haystack)) return 'native';
  if (/unhandled.?rejection|promise/.test(haystack)) return 'unhandled-rejection';
  if (/renderer|web-contents|webcontents/.test(haystack)) return 'renderer';
  if (/main|electron-main/.test(haystack)) return 'main';
  return 'unknown';
}

export function summarizeCrashes(records: readonly CrashRecord[]): Record<CrashCategory, number> {
  const totals: Record<CrashCategory, number> = {
    renderer: 0, main: 0, native: 0, gpu: 0, memory: 0,
    worker: 0, 'unhandled-rejection': 0, unknown: 0,
  };
  for (const r of records) totals[classifyCrash(r)] += 1;
  return totals;
}
