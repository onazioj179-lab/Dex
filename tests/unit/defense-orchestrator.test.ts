// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Defense Orchestrator tests
 * @vitest-environment node
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DefenseOrchestrator,
  _internals,
  type DefenseResponses,
} from '../../src/main/security/DefenseOrchestrator';

function makeResponses(): { responses: DefenseResponses; calls: Record<string, ReturnType<typeof vi.fn>> } {
  const calls = {
    snapshot: vi.fn().mockResolvedValue(undefined),
    quarantinePlugin: vi.fn().mockResolvedValue(undefined),
    rotateIPC: vi.fn().mockResolvedValue(undefined),
    lockIdentityVault: vi.fn().mockResolvedValue(undefined),
    networkLockdown: vi.fn().mockResolvedValue(undefined),
    restoreFiles: vi.fn().mockResolvedValue(undefined),
    emitNexusEmergency: vi.fn().mockResolvedValue(undefined),
  };
  return { calls, responses: calls };
}

describe('tierFromScore', () => {
  it('maps scores to tiers', () => {
    expect(_internals.tierFromScore(0)).toBe('green');
    expect(_internals.tierFromScore(2)).toBe('green');
    expect(_internals.tierFromScore(3)).toBe('yellow');
    expect(_internals.tierFromScore(8)).toBe('red');
    expect(_internals.tierFromScore(16)).toBe('critical');
  });
});

describe('DefenseOrchestrator escalation', () => {
  it('starts green; a single low signal stays green', async () => {
    const { responses, calls } = makeResponses();
    const o = new DefenseOrchestrator(responses, { now: () => 1000 });
    const tier = await o.ingest({ kind: 'ipc-anomaly', severity: 'low', source: 't', message: 'm' });
    expect(tier).toBe('green');
    expect(calls.snapshot).not.toHaveBeenCalled();
  });

  it('escalates to yellow with mid-severity activity and snapshots', async () => {
    const { responses, calls } = makeResponses();
    const o = new DefenseOrchestrator(responses, { now: () => 1000 });
    await o.ingest({ kind: 'ipc-anomaly', severity: 'medium', source: 't', message: 'm' });
    await o.ingest({ kind: 'ipc-anomaly', severity: 'medium', source: 't', message: 'm' });
    expect(o.status().tier).toBe('yellow');
    expect(calls.snapshot).toHaveBeenCalledTimes(1);
  });

  it('escalates to red, rotates IPC + locks vault, quarantines flagged plugins', async () => {
    const { responses, calls } = makeResponses();
    const o = new DefenseOrchestrator(responses, { now: () => 1000 });
    // Single high-severity plugin-scan = score 8 = red.
    await o.ingest({ kind: 'plugin-scan', severity: 'high', source: 't', message: 'm', target: 'plugin-evil' });
    expect(o.status().tier).toBe('red');
    expect(calls.rotateIPC).toHaveBeenCalled();
    expect(calls.lockIdentityVault).toHaveBeenCalled();
    expect(calls.quarantinePlugin).toHaveBeenCalledWith('plugin-evil');
    expect(o.status().quarantinedPlugins).toContain('plugin-evil');
  });

  it('escalates to critical, locks down network, restores tampered files, emits emergency', async () => {
    const { responses, calls } = makeResponses();
    const o = new DefenseOrchestrator(responses, { now: () => 1000 });
    await o.ingest({ kind: 'integrity-drift', severity: 'critical', source: 't', message: 'm', target: '/app/main.js' });
    await o.ingest({ kind: 'integrity-drift', severity: 'critical', source: 't', message: 'm', target: '/app/preload.js' });
    expect(o.status().tier).toBe('critical');
    expect(calls.networkLockdown).toHaveBeenCalledWith(true);
    // First critical signal triggers restoreFiles with whatever targets are in window at that moment.
    expect(calls.restoreFiles).toHaveBeenCalledWith(expect.arrayContaining(['/app/main.js']));
    expect(calls.emitNexusEmergency).toHaveBeenCalled();
    expect(o.status().lockdownActive).toBe(true);
  });

  it('does not downgrade automatically inside the quiet window', async () => {
    const { responses } = makeResponses();
    let t = 1000;
    const o = new DefenseOrchestrator(responses, { now: () => t, quietMs: 1000 });
    await o.ingest({ kind: 'ipc-anomaly', severity: 'high', source: 't', message: 'm' });
    expect(o.status().tier).toBe('red');
    t = 1500;
    await o.maybeRecover();
    expect(o.status().tier).toBe('red');
  });

  it('downgrades one step after the quiet window and lifts lockdown when reaching green', async () => {
    const { responses, calls } = makeResponses();
    let t = 1000;
    const o = new DefenseOrchestrator(responses, { now: () => t, quietMs: 1000 });
    await o.ingest({ kind: 'integrity-drift', severity: 'critical', source: 't', message: 'm', target: '/x' });
    expect(o.status().tier).toBe('critical');
    t = 5000;
    await o.maybeRecover();
    expect(o.status().tier).toBe('red');
    t = 9000;
    await o.maybeRecover();
    expect(o.status().tier).toBe('yellow');
    t = 13000;
    await o.maybeRecover();
    expect(o.status().tier).toBe('green');
    expect(calls.networkLockdown).toHaveBeenLastCalledWith(false);
    expect(o.status().lockdownActive).toBe(false);
  });

  it('forceTier upgrades and triggers responses', async () => {
    const { responses, calls } = makeResponses();
    const o = new DefenseOrchestrator(responses, { now: () => 1 });
    await o.forceTier('red');
    expect(o.status().tier).toBe('red');
    expect(calls.rotateIPC).toHaveBeenCalled();
  });

  it('swallows response errors so the orchestrator stays alive', async () => {
    const responses: DefenseResponses = {
      snapshot: vi.fn().mockRejectedValue(new Error('disk full')),
      quarantinePlugin: vi.fn().mockResolvedValue(undefined),
      rotateIPC: vi.fn().mockRejectedValue(new Error('rotate failed')),
      lockIdentityVault: vi.fn().mockResolvedValue(undefined),
      networkLockdown: vi.fn().mockResolvedValue(undefined),
      restoreFiles: vi.fn().mockResolvedValue(undefined),
      emitNexusEmergency: vi.fn().mockResolvedValue(undefined),
    };
    const o = new DefenseOrchestrator(responses, { now: () => 1 });
    await expect(o.ingest({ kind: 'ipc-anomaly', severity: 'high', source: 't', message: 'm' })).resolves.toBe('red');
  });
});
