// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { formatBytes } from '../../shared/format/units';
import { invokePlatformIpc } from '../services/platform/ipc';

interface Status {
  success?: boolean;
  cpu?: { usage?: number };
  memory?: { used?: number; total?: number };
  disk?: { used?: number; total?: number };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Answer explicit live metric queries with the same native sample as Task Manager. */
export async function answerLocalSystemQuestion(input: string): Promise<string | null> {
  const text = input.trim().toLowerCase().replace(/[.?!]+$/, '').replace(/\s+/g, ' ');
  const cpu = /^(?:(?:show|check) |what is (?:my |the )?)?(?:current |live )?cpu (?:usage|load)$/.test(text);
  const memory = /^(?:(?:show|check) |what is (?:my |the )?)?(?:current |live )?(?:memory|ram) usage$|^how much (?:ram|memory) is (?:in use|being used)$/.test(text);
  const disk = /^(?:(?:show|check) |what is (?:my |the )?)?(?:current |live )?(?:disk|storage) usage$|^how much (?:disk space|storage) is used$/.test(text);
  const summary = /^(?:(?:show|check) )?(?:current |live )?(?:system (?:status|resources)|cpu and (?:memory|ram) usage)$/.test(text);
  if (!cpu && !memory && !disk && !summary) return null;

  const status = await invokePlatformIpc<Status>('system:getStatus');
  if (!status || status.success === false) return 'I couldn’t read a live system sample.';
  const facts: string[] = [];
  const usage = status.cpu?.usage;
  if ((cpu || summary) && finite(usage)) facts.push('CPU usage is ' + Math.min(100, Math.round(usage)) + '%.');
  const memoryUsed = status.memory?.used;
  const memoryTotal = status.memory?.total;
  if ((memory || summary) && finite(memoryUsed) && finite(memoryTotal) && memoryTotal > 0) {
    facts.push('Memory is using ' + formatBytes(memoryUsed) + ' of ' + formatBytes(memoryTotal) + '.');
  }
  const diskUsed = status.disk?.used;
  const diskTotal = status.disk?.total;
  if (disk && finite(diskUsed) && finite(diskTotal) && diskTotal > 0) {
    facts.push('Storage is using ' + formatBytes(diskUsed) + ' of ' + formatBytes(diskTotal) + '.');
  }
  return facts.join(' ') || 'That metric is unavailable in the current system sample.';
}
