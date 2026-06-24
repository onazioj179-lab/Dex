// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Out-of-process plugin-host model (DEX_FEATURE_BACKLOG 10): AUv3-style process
// isolation + crash containment, CLAP-style thread affinity, capability scoping,
// opaque state integrity, and the IPC message contract.
import { describe, it, expect } from 'vitest';
import {
  opThreadAffinity, isCallAllowedOnThread, requiresSeparateProcess,
  pluginCapabilityAllowed, newPluginRuntime, onCrash, shouldRestart,
  validateState, validatePluginMessage,
  negotiateExtension, isolationGroupKey, canInvokeInState, canInvoke,
  type PluginManifest, type PluginState,
} from '../../src/shared/extensibility/pluginHost';

const audioPlugin: PluginManifest = { id: 'reverb', kind: 'audio', capabilities: ['audio.out', 'gpu'] };
const trustedPlugin: PluginManifest = { id: 'sys-eq', kind: 'audio', capabilities: ['audio.out'], trusted: true };

describe('CLAP-style thread affinity', () => {
  it('classifies ops by thread', () => {
    expect(opThreadAffinity('process')).toBe('audio');
    expect(opThreadAffinity('loadState')).toBe('main');
    expect(opThreadAffinity('getExtension')).toBe('any');
  });
  it('forbids cross-thread calls', () => {
    expect(isCallAllowedOnThread('process', 'audio')).toBe(true);
    expect(isCallAllowedOnThread('process', 'main')).toBe(false);   // classic bug
    expect(isCallAllowedOnThread('loadState', 'main')).toBe(true);
    expect(isCallAllowedOnThread('loadState', 'audio')).toBe(false);
    expect(isCallAllowedOnThread('getExtension', 'audio')).toBe(true);
    expect(isCallAllowedOnThread('getExtension', 'main')).toBe(true);
  });
});

describe('process isolation (AUv3)', () => {
  it('untrusted plugins require their own process; trusted may run in-process', () => {
    expect(requiresSeparateProcess(audioPlugin)).toBe(true);
    expect(requiresSeparateProcess(trustedPlugin)).toBe(false);
  });
});

describe('capability scoping', () => {
  it('allows declared capabilities and denies the rest', () => {
    expect(pluginCapabilityAllowed(audioPlugin, 'audio.out')).toBe(true);
    expect(pluginCapabilityAllowed(audioPlugin, 'network')).toBe(false);
  });
});

describe('crash containment', () => {
  it('quarantines after the crash budget and stops restarting', () => {
    let rt = newPluginRuntime('reverb');
    expect(shouldRestart(rt)).toBe(true);
    rt = onCrash(rt); // 1
    rt = onCrash(rt); // 2
    expect(rt.quarantined).toBe(false);
    expect(shouldRestart(rt)).toBe(true);
    rt = onCrash(rt); // 3 -> quarantine (default max 3)
    expect(rt.quarantined).toBe(true);
    expect(shouldRestart(rt)).toBe(false);
  });
  it('respects a custom crash budget', () => {
    let rt = newPluginRuntime('x');
    rt = onCrash(rt, { maxCrashes: 1 });
    expect(rt.quarantined).toBe(true);
  });
});

describe('opaque state integrity', () => {
  const cs = (b: string) => `h(${b})`;
  it('accepts a matching checksum and rejects a tampered blob', () => {
    const good: PluginState = { pluginId: 'reverb', version: 1, blob: 'STATE', checksum: cs('STATE') };
    const bad: PluginState = { ...good, blob: 'TAMPERED' };
    expect(validateState(good, cs)).toBe(true);
    expect(validateState(bad, cs)).toBe(false);
  });
});

describe('IPC message contract', () => {
  it('rejects unknown message kinds (fail-closed)', () => {
    expect(validatePluginMessage({ kind: 'mystery' as any }, 'main').allow).toBe(false);
  });
  it('validates op messages against the sending thread', () => {
    expect(validatePluginMessage({ kind: 'op', op: 'process' }, 'audio').allow).toBe(true);
    expect(validatePluginMessage({ kind: 'op', op: 'process' }, 'main').allow).toBe(false);
    expect(validatePluginMessage({ kind: 'op' }, 'main').allow).toBe(false); // no op
    expect(validatePluginMessage({ kind: 'log' }, 'audio').allow).toBe(true);
  });
});

describe('extension negotiation (CLAP get_extension)', () => {
  it('returns true only for implemented extensions, and never before init', () => {
    const p: PluginManifest = { id: 'x', kind: 'audio', capabilities: [], extensions: ['clap.params', 'clap.state'] };
    expect(negotiateExtension(p, 'clap.params')).toBe(true);
    expect(negotiateExtension(p, 'clap.gui')).toBe(false);
    expect(negotiateExtension(p, 'clap.params', false)).toBe(false); // pre-init
  });
});

describe('isolation granularity (Bitwig)', () => {
  const p: PluginManifest = { id: 'reverb', kind: 'audio', capabilities: [], vendor: 'acme' };
  it('maps each granularity to a process-group key (shared key = shared process)', () => {
    expect(isolationGroupKey(p, 'in-engine')).toBeNull();
    expect(isolationGroupKey(p, 'together')).toBe('shared');
    expect(isolationGroupKey(p, 'per-manufacturer')).toBe('vendor:acme');
    expect(isolationGroupKey(p, 'per-plugin')).toBe('plugin:reverb');
    expect(isolationGroupKey(p, 'individual', 'inst-7')).toBe('instance:inst-7');
  });
  it('two instances of the same plugin share a process per-plugin but not individual', () => {
    expect(isolationGroupKey(p, 'per-plugin', 'a')).toBe(isolationGroupKey(p, 'per-plugin', 'b'));
    expect(isolationGroupKey(p, 'individual', 'a')).not.toBe(isolationGroupKey(p, 'individual', 'b'));
  });
});

describe('lifecycle preconditions (CLAP active-state ordering)', () => {
  it('process only when active; activate only when initialized', () => {
    expect(canInvokeInState('activate', 'initialized')).toBe(true);
    expect(canInvokeInState('activate', 'active')).toBe(false);
    expect(canInvokeInState('process', 'active')).toBe(true);
    expect(canInvokeInState('process', 'initialized')).toBe(false);
    expect(canInvokeInState('deactivate', 'active')).toBe(true);
    expect(canInvokeInState('saveState', 'created')).toBe(false);
    expect(canInvokeInState('saveState', 'initialized')).toBe(true);
    expect(canInvokeInState('getExtension', 'destroyed')).toBe(false);
  });
  it('canInvoke gates on BOTH thread and lifecycle state', () => {
    expect(canInvoke('process', 'audio', 'active')).toBe(true);
    expect(canInvoke('process', 'main', 'active')).toBe(false);   // wrong thread
    expect(canInvoke('process', 'audio', 'initialized')).toBe(false); // wrong state
    expect(canInvoke('loadState', 'main', 'initialized')).toBe(true);
  });
});
