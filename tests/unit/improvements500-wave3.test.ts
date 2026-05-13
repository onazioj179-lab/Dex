// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave 3 tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  snapToGrid, snapToGuides, snapBoxToBoxes,
  parseColor, contrastRatio, evaluateContrast,
  redactString, redactDeep,
  measureSpan,
  crashRecovery, audit, midiMapping,
  LufsMeter, ParticleEmitter, PluginSandbox,
} from '../../src/renderer/improvements500';

describe('snap', () => {
  it('snapToGrid rounds to nearest multiple', () => {
    expect(snapToGrid(13, 8)).toBe(16);
    expect(snapToGrid(11, 8)).toBe(8);
  });

  it('snapToGuides picks closest within threshold', () => {
    expect(snapToGuides(102, [100, 200], 6)).toBe(100);
    expect(snapToGuides(150, [100, 200], 6)).toBe(150); // outside threshold
  });

  it('snapBoxToBoxes aligns to neighbour edge', () => {
    const box = { x: 102, y: 50, width: 50, height: 50 };
    const out = snapBoxToBoxes(box, [{ x: 100, y: 50, width: 100, height: 100 }], 6);
    expect(out.x).toBe(100);
  });
});

describe('contrast', () => {
  it('parseColor handles hex and rgb', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('white on black ratio is 21:1', () => {
    const r = contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
    expect(r).toBeCloseTo(21, 0);
  });

  it('evaluateContrast flags AA pass/fail', () => {
    const ok = evaluateContrast('#000', '#fff');
    expect(ok?.passAANormal).toBe(true);
    const fail = evaluateContrast('#777', '#888');
    expect(fail?.passAANormal).toBe(false);
  });
});

describe('redact', () => {
  it('strips emails and bearer tokens', () => {
    const out = redactString('contact a@b.co with bearer abcdef0123456789ABCDEF');
    expect(out).not.toContain('a@b.co');
    expect(out).not.toContain('abcdef0123456789ABCDEF');
  });

  it('redacts sensitive keys deeply', () => {
    const out = redactDeep({ user: 'x', password: 'hunter2', nested: { token: 't' } }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect(out.user).toBe('x');
  });

  it('handles cycles', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(() => redactDeep(a)).not.toThrow();
  });
});

describe('longTask.measureSpan', () => {
  it('returns the function result', () => {
    expect(measureSpan('test', () => 42)).toBe(42);
  });
});

describe('crashRecovery', () => {
  beforeEach(() => { localStorage.clear(); });

  it('save/load round-trips and clears slot', () => {
    crashRecovery.saveRecovery('app1', { docs: 3 });
    expect(crashRecovery.hasRecovery('app1')).toBe(true);
    const r = crashRecovery.loadRecovery<{ docs: number }>('app1');
    expect(r?.data.docs).toBe(3);
    expect(crashRecovery.hasRecovery('app1')).toBe(false);
  });

  it('previousSessionCrashed reflects pending recovery', () => {
    crashRecovery.saveRecovery('app2', 1);
    expect(crashRecovery.previousSessionCrashed('app2')).toBe(true);
    crashRecovery.commitClean('app2');
    expect(crashRecovery.previousSessionCrashed('app2')).toBe(false);
  });
});

describe('audit', () => {
  beforeEach(() => audit.clearAudit('vault'));

  it('append + list newest-first', () => {
    audit.audit('vault', { action: 'unlock', outcome: 'success' });
    audit.audit('vault', { action: 'unlock', outcome: 'denied' });
    const list = audit.listAudit('vault');
    expect(list[0].outcome).toBe('denied');
    expect(list).toHaveLength(2);
  });
});

describe('midiMapping', () => {
  beforeEach(() => midiMapping._clear());

  it('addBinding upserts by (cc, channel)', () => {
    midiMapping.addBinding({ cc: 7, channel: 0, param: 'volume' });
    midiMapping.addBinding({ cc: 7, channel: 0, param: 'volume2' });
    expect(midiMapping.loadBindings()).toHaveLength(1);
    expect(midiMapping.findBinding(0, 7)?.param).toBe('volume2');
  });

  it('mapCcValue scales to range', () => {
    expect(midiMapping.mapCcValue(0, { cc: 7, channel: 0, param: 'x', min: 0, max: 100 })).toBe(0);
    expect(midiMapping.mapCcValue(127, { cc: 7, channel: 0, param: 'x', min: 0, max: 100 })).toBe(100);
    expect(midiMapping.mapCcValue(64, { cc: 7, channel: 0, param: 'x', min: 0, max: 100 })).toBeCloseTo(50.4, 0);
  });
});

describe('LufsMeter', () => {
  it('returns -Infinity on empty buffer', () => {
    const m = new LufsMeter(48_000);
    expect(m.momentary()).toBe(-Infinity);
  });

  it('louder signal returns higher LUFS than quieter', () => {
    const loud = new LufsMeter(48_000);
    const quiet = new LufsMeter(48_000);
    const N = 48_000;
    const loudBuf = new Float32Array(N);
    const quietBuf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      loudBuf[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000);
      quietBuf[i] = 0.05 * Math.sin(2 * Math.PI * 1000 * i / 48000);
    }
    loud.push(loudBuf);
    quiet.push(quietBuf);
    expect(loud.shortTerm()).toBeGreaterThan(quiet.shortTerm());
  });
});

describe('ParticleEmitter', () => {
  it('spawns according to rate over time', () => {
    const e = new ParticleEmitter({
      rate: 100, origin: { x: 0, y: 0 },
      speedMin: 10, speedMax: 20, spread: 0.1, direction: 0,
      lifeMin: 5000, lifeMax: 5000,
      sizeMin: 1, sizeMax: 1, gravity: 0, drag: 0, color: '#fff',
    });
    e.step(1000);
    expect(e.count()).toBeGreaterThan(50);
  });

  it('culls dead particles', () => {
    const e = new ParticleEmitter({
      rate: 10, origin: { x: 0, y: 0 },
      speedMin: 0, speedMax: 0, spread: 0, direction: 0,
      lifeMin: 100, lifeMax: 100,
      sizeMin: 1, sizeMax: 1, gravity: 0, drag: 0, color: '#fff',
    });
    e.step(200);
    const before = e.count();
    e.step(500);
    expect(e.count()).toBeLessThanOrEqual(before);
  });
});

describe('PluginSandbox', () => {
  const manifest = {
    pluginId: 'p1',
    permissions: ['storage', 'network'] as const,
    networkAllow: ['*.example.com', 'api.dex.local'] as const,
    quotaBytes: 100,
  };

  it('storage requires permission and respects quota', () => {
    const sb = new PluginSandbox(manifest);
    expect(sb.storageSet('a', 'x'.repeat(50))).toMatchObject({ ok: true });
    expect(sb.storageSet('b', 'x'.repeat(60))).toMatchObject({ ok: false });
  });

  it('denies unpermitted operations', () => {
    const sb = new PluginSandbox({ ...manifest, permissions: [] });
    expect(sb.storageGet('a').ok).toBe(false);
    expect(sb.fetchUrl('https://api.example.com').ok).toBe(false);
  });

  it('network allowlist supports wildcard subdomain', () => {
    const sb = new PluginSandbox(manifest);
    expect(sb.fetchUrl('https://foo.example.com/x').ok).toBe(true);
    expect(sb.fetchUrl('https://example.com/x').ok).toBe(false); // bare apex not matched by *.example.com
    expect(sb.fetchUrl('https://other.org').ok).toBe(false);
    expect(sb.fetchUrl('https://api.dex.local').ok).toBe(true);
  });

  it('handleMessage validates payload', () => {
    const sb = new PluginSandbox(manifest);
    expect(sb.handleMessage(null).ok).toBe(false);
    expect(sb.handleMessage({ kind: 'storage.set', key: 'a', value: 'b' }).ok).toBe(true);
  });
});
