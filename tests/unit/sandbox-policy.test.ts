// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Security policy layer (DEX_FEATURE_BACKLOG 03): per-app network capability
// gating, the Linux bubblewrap jail argv, brokered inner-app IPC, and the unified
// sandbox profile that composes them. Pure-logic, fail-closed assertions.
import { describe, it, expect } from 'vitest';
import {
  deriveNetworkPolicy, checkNetworkRequest, classifyDestination,
} from '../../src/shared/runtime/networkPolicy';
import { buildBwrapArgs, describeSandbox } from '../../src/shared/runtime/linuxSandbox';
import { evaluateIpcRoute, knownChannelNamespaces } from '../../src/shared/runtime/brokeredIpc';
import { buildSandboxProfile } from '../../src/shared/runtime/sandboxProfile';
import type { AppCapability } from '../../src/shared/runtime/appContainer';

describe('networkPolicy — capability gating (AppContainer model)', () => {
  it('a no-network app is denied every internet/private request', () => {
    const p = deriveNetworkPolicy([]);
    expect(checkNetworkRequest(p, 'internet-outbound').allow).toBe(false);
    expect(checkNetworkRequest(p, 'private-outbound').allow).toBe(false);
    expect(checkNetworkRequest(p, 'loopback').allow).toBe(false);
  });
  it("'network' grants internetClient (outbound) but NOT inbound", () => {
    const p = deriveNetworkPolicy(['network']);
    expect(checkNetworkRequest(p, 'internet-outbound').allow).toBe(true);
    expect(checkNetworkRequest(p, 'internet-inbound').allow).toBe(false);
  });
  it('inbound internet requires the server opt-in (internetClientServer)', () => {
    const p = deriveNetworkPolicy(['network'], { inboundInternet: true });
    expect(checkNetworkRequest(p, 'internet-inbound').allow).toBe(true);
  });
  it("'network.local' grants private network but not internet", () => {
    const p = deriveNetworkPolicy(['network.local']);
    expect(checkNetworkRequest(p, 'private-outbound').allow).toBe(true);
    expect(checkNetworkRequest(p, 'internet-outbound').allow).toBe(false);
  });
  it('loopback is denied by default even for fully-networked apps', () => {
    const p = deriveNetworkPolicy(['network', 'network.local']);
    expect(checkNetworkRequest(p, 'loopback').allow).toBe(false);
    expect(deriveNetworkPolicy(['network'], { allowLoopback: true }).allowLoopback).toBe(true);
  });
  it('classifies destinations into the right request kind', () => {
    expect(classifyDestination('localhost')).toBe('loopback');
    expect(classifyDestination('127.0.0.1')).toBe('loopback');
    expect(classifyDestination('192.168.1.5')).toBe('private-outbound');
    expect(classifyDestination('10.0.0.1', true)).toBe('private-inbound');
    expect(classifyDestination('api.openai.com')).toBe('internet-outbound');
    expect(classifyDestination('printer.local')).toBe('private-outbound');
  });
});

describe('linuxSandbox — bubblewrap jail policy', () => {
  const base = { appId: 'demo', dataDir: '/data/demo' };
  it('defaults to maximal isolation: unshare-all, no net, drop caps', () => {
    const args = buildBwrapArgs({ ...base, capabilities: [] });
    expect(args).toContain('--unshare-all');
    expect(args).toContain('--die-with-parent');
    expect(args).toContain('--cap-drop');
    expect(args).not.toContain('--share-net');
  });
  it('shares the network only when declared', () => {
    expect(buildBwrapArgs({ ...base, capabilities: ['network'] })).toContain('--share-net');
    expect(buildBwrapArgs({ ...base, capabilities: ['network.local'] })).toContain('--share-net');
  });
  it('binds the data dir read-write only with files.write', () => {
    const ro = buildBwrapArgs({ ...base, capabilities: ['files.read'] });
    expect(ro).not.toContain('--bind'); // only --ro-bind / --ro-bind-try
    const rw = buildBwrapArgs({ ...base, capabilities: ['files.write'] });
    const i = rw.indexOf('--bind');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(rw[i + 1]).toBe('/data/demo');
  });
  it('exposes /dev/dri only when a gpu capability is declared', () => {
    expect(buildBwrapArgs({ ...base, capabilities: [] })).not.toContain('--dev-bind-try');
    expect(buildBwrapArgs({ ...base, capabilities: ['gpu'] })).toContain('--dev-bind-try');
  });
  it('describeSandbox summarises the posture', () => {
    const lines = describeSandbox({ ...base, capabilities: ['network', 'files.write'] });
    expect(lines.some(l => l.includes('Network: shared'))).toBe(true);
    expect(lines.some(l => l.includes('read-write'))).toBe(true);
  });
});

describe('brokeredIpc — capability-scoped routing', () => {
  const caps: AppCapability[] = ['clipboard', 'files.read'];
  it('forbids direct app-to-app messages (everything via the broker)', () => {
    const d = evaluateIpcRoute({ from: 'a', to: { app: 'b' }, channel: 'ping' }, caps);
    expect(d.allow).toBe(false);
  });
  it('allows a capability-free system channel to the broker', () => {
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'ping' }, []).allow).toBe(true);
  });
  it('gates a channel on the matching capability', () => {
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'clipboard:write' }, caps).allow).toBe(true);
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'net:fetch' }, caps).allow).toBe(false);
  });
  it('files:write needs files.write, not just files.read', () => {
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'files:read' }, caps).allow).toBe(true);
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'files:write' }, caps).allow).toBe(false);
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'files:write' }, ['files.write']).allow).toBe(true);
  });
  it('denies an unknown channel namespace (fail-closed)', () => {
    expect(evaluateIpcRoute({ from: 'a', to: 'broker', channel: 'mystery:do' }, caps).allow).toBe(false);
    expect(knownChannelNamespaces()).toContain('clipboard');
  });
});

describe('sandboxProfile — unified composition', () => {
  it('one call yields network + linux + ipc enforcement inputs', () => {
    const p = buildSandboxProfile({
      appId: 'demo', capabilities: ['network', 'files.write'], dataDir: '/data/demo',
    });
    expect(p.windowsNetworkCapabilities).toContain('internetClient');
    expect(p.linuxBwrapArgs).toContain('--share-net');
    expect(p.ipcMode).toBe('brokered');
    // The bound guards work end to end.
    expect(p.checkDestination('api.openai.com').allow).toBe(true);
    expect(p.checkDestination('localhost').allow).toBe(false);
    expect(p.checkIpc({ from: 'demo', to: 'broker', channel: 'files:write' }).allow).toBe(true);
  });
  it('a zero-capability app is fully locked down', () => {
    const p = buildSandboxProfile({ appId: 'x', capabilities: [], dataDir: '/d' });
    expect(p.windowsNetworkCapabilities).toHaveLength(0);
    expect(p.linuxBwrapArgs).not.toContain('--share-net');
    expect(p.checkDestination('api.openai.com').allow).toBe(false);
  });
});
