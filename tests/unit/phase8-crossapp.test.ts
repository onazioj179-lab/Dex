import { describe, it, expect, vi } from 'vitest';
import { ContextBus, MacroComposer } from '../../src/shared/phase8/crossAppIntelligence';

describe('Phase 8 - ContextBus', () => {
  it('publish delivers to subscribers and counts deliveries', () => {
    const bus = new ContextBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('topic', a);
    bus.subscribe('topic', b);
    const n = bus.publish({ topic: 'topic', payload: 1, originApp: 'app', publishedAt: 0 });
    expect(n).toBe(2);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('isolates throwing subscribers', () => {
    const bus = new ContextBus();
    bus.subscribe('t', () => { throw new Error(); });
    const ok = vi.fn();
    bus.subscribe('t', ok);
    bus.publish({ topic: 't', payload: 1, originApp: 'a', publishedAt: 0 });
    expect(ok).toHaveBeenCalled();
  });

  it('unsubscribe stops delivery', () => {
    const bus = new ContextBus();
    const fn = vi.fn();
    const off = bus.subscribe('t', fn);
    off();
    bus.publish({ topic: 't', payload: 1, originApp: 'a', publishedAt: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects bad envelopes', () => {
    const bus = new ContextBus();
    expect(() => bus.publish({ topic: '', payload: null, originApp: 'a', publishedAt: 0 })).toThrow();
    expect(() => bus.publish({ topic: 't', payload: null, originApp: '', publishedAt: 0 })).toThrow();
  });

  it('replay returns alive envelopes only', () => {
    const bus = new ContextBus({ maxRecent: 10 });
    bus.publish({ topic: 't', payload: 1, originApp: 'a', publishedAt: 0, ttlMs: 100 });
    bus.publish({ topic: 't', payload: 2, originApp: 'a', publishedAt: 0, ttlMs: 1000 });
    expect(bus.replay('t', 50).length).toBe(2);
    expect(bus.replay('t', 500).length).toBe(1);
  });

  it('caps recent buffer', () => {
    const bus = new ContextBus({ maxRecent: 2 });
    for (let i = 0; i < 5; i++) {
      bus.publish({ topic: 't', payload: i, originApp: 'a', publishedAt: 0 });
    }
    expect(bus.recentCount()).toBe(2);
  });
});

describe('Phase 8 - MacroComposer', () => {
  it('runs all steps in order', async () => {
    const m = new MacroComposer<string[]>();
    m.define({
      id: 'm1',
      steps: [
        { id: 's1', run: (c) => { c.push('1'); } },
        { id: 's2', run: (c) => { c.push('2'); } },
      ],
    });
    const ctx: string[] = [];
    const r = await m.run('m1', ctx);
    expect(ctx).toEqual(['1', '2']);
    expect(r.ranSteps).toEqual(['s1', 's2']);
    expect(r.failedStep).toBeUndefined();
  });

  it('undoes completed steps on failure (in reverse)', async () => {
    const m = new MacroComposer<string[]>();
    m.define({
      id: 'm1',
      steps: [
        { id: 's1', run: (c) => { c.push('do1'); }, undo: (c) => { c.push('undo1'); } },
        { id: 's2', run: () => { throw new Error('boom'); } },
      ],
    });
    const ctx: string[] = [];
    const r = await m.run('m1', ctx);
    expect(r.failedStep).toBe('s2');
    expect(r.error?.message).toBe('boom');
    expect(r.undone).toBe(true);
    expect(ctx).toEqual(['do1', 'undo1']);
  });

  it('marks undone=false if any step lacks undo', async () => {
    const m = new MacroComposer<number[]>();
    m.define({
      id: 'm',
      steps: [
        { id: 'a', run: (c) => { c.push(1); } },
        { id: 'b', run: () => { throw new Error('x'); } },
      ],
    });
    const r = await m.run('m', []);
    expect(r.undone).toBe(false);
  });

  it('rejects duplicate macro and step ids', () => {
    const m = new MacroComposer<unknown>();
    m.define({ id: 'a', steps: [{ id: 's1', run: () => {} }] });
    expect(() => m.define({ id: 'a', steps: [{ id: 's1', run: () => {} }] })).toThrow();
    expect(() => m.define({ id: 'b', steps: [
      { id: 's1', run: () => {} },
      { id: 's1', run: () => {} },
    ] })).toThrow();
    expect(() => m.define({ id: 'c', steps: [] })).toThrow();
  });

  it('dryRun returns step ids without running', async () => {
    const m = new MacroComposer<unknown>();
    const fn = vi.fn();
    m.define({ id: 'm', steps: [{ id: 's1', run: fn }] });
    expect(m.dryRun('m')).toEqual(['s1']);
    expect(fn).not.toHaveBeenCalled();
  });
});
