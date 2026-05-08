// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { CapabilityBroker, type AuditEvent, type GrantLookup } from '../../src/shared/runtime/capabilityBroker';
import type { TokenVerifier } from '../../src/shared/runtime/capabilityToken';

const verifier: TokenVerifier = { computeHmac: (p: string) => 'h:' + p };

function fixedClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function setupBroker(grantsMap: Record<string, string[]>, clock = fixedClock()) {
  const grants: GrantLookup = {
    isGranted: (appId, cap) => grantsMap[appId]?.includes(cap) ?? false,
  };
  const events: AuditEvent[] = [];
  const sink = { record: (e: AuditEvent) => events.push(e) };
  const broker = new CapabilityBroker(grants, verifier, sink, { now: clock.now });
  return { broker, events, clock };
}

describe('CapabilityBroker', () => {
  it('issues token when granted, audits mint', () => {
    const { broker, events } = setupBroker({ a: ['files.read'] });
    const t = broker.issue('a', 'files.read');
    expect(t).not.toBeNull();
    expect(events[0]!.kind).toBe('mint');
  });

  it('refuses when not granted', () => {
    const { broker, events } = setupBroker({ a: [] });
    expect(broker.issue('a', 'files.read')).toBeNull();
    expect(events[0]!.kind).toBe('grant-missing');
  });

  it('validates own token', () => {
    const { broker } = setupBroker({ a: ['files.read'] });
    const t = broker.issue('a', 'files.read')!;
    expect(broker.validate(t, { appId: 'a', capability: 'files.read' })).toBe(true);
  });

  it('rejects replay', () => {
    const { broker, events } = setupBroker({ a: ['files.read'] });
    const t = broker.issue('a', 'files.read')!;
    expect(broker.validate(t, { appId: 'a', capability: 'files.read' })).toBe(true);
    expect(broker.validate(t, { appId: 'a', capability: 'files.read' })).toBe(false);
    const fail = events.find(e => e.kind === 'verify-fail');
    expect(fail).toBeDefined();
    if (fail && fail.kind === 'verify-fail') expect(fail.reason).toBe('replay');
  });
});
