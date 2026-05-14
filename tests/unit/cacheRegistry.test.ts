import { describe, it, expect, beforeEach } from 'vitest';

// Re-import module fresh for each test via cache-busting
let mod: typeof import('../../src/renderer/services/CacheRegistry');

beforeEach(async () => {
  // Vitest module cache is shared — reset by re-importing after clearing
  // We isolate state by importing once per suite since the registry is module-level.
  // For full isolation we'd need vi.resetModules(), but the registry API is
  // deterministic so we unregister everything manually instead.
  mod = await import('../../src/renderer/services/CacheRegistry');
  // clear registry between tests
  const snap = mod.getCacheSnapshot();
  snap.forEach(entry => mod.unregisterCache(entry.id));
});

describe('CacheRegistry', () => {
  it('registerCache returns a unique id each call', () => {
    const id1 = mod.registerCache({ name: 'A', flush: () => 0 });
    const id2 = mod.registerCache({ name: 'B', flush: () => 0 });
    expect(id1).not.toBe(id2);
    expect(mod.registrySize()).toBe(2);
  });

  it('unregisterCache removes entry from registry', () => {
    const id = mod.registerCache({ name: 'X', flush: () => 0 });
    expect(mod.registrySize()).toBe(1);
    mod.unregisterCache(id);
    expect(mod.registrySize()).toBe(0);
  });

  it('flushAll calls every registered flush and sums bytes', () => {
    mod.registerCache({ name: 'A', flush: () => 100 });
    mod.registerCache({ name: 'B', flush: () => 200 });
    const freed = mod.flushAll();
    expect(freed).toBe(300);
  });

  it('flushAll returns 0 when all entries return undefined', () => {
    mod.registerCache({ name: 'A', flush: () => undefined });
    const freed = mod.flushAll();
    expect(freed).toBe(0);
  });

  it('flushAll swallows errors from individual flush callbacks', () => {
    mod.registerCache({ name: 'Bad', flush: () => { throw new Error('boom'); } });
    mod.registerCache({ name: 'Good', flush: () => 50 });
    expect(() => mod.flushAll()).not.toThrow();
    expect(mod.flushAll()).toBe(50);
  });

  it('flushByPrefix only flushes matching entries', () => {
    mod.registerCache({ name: 'LayerImage-A', flush: () => 400 });
    mod.registerCache({ name: 'LayerImage-B', flush: () => 600 });
    mod.registerCache({ name: 'VideoFrame', flush: () => 1000 });
    const freed = mod.flushByPrefix('LayerImage');
    expect(freed).toBe(1000);
  });

  it('getCacheSnapshot includes sizeBytes when provided', () => {
    mod.registerCache({ name: 'WithSize', flush: () => 0, sizeBytes: () => 512 });
    const snap = mod.getCacheSnapshot();
    expect(snap.length).toBe(1);
    expect(snap[0].name).toBe('WithSize');
    expect(snap[0].sizeBytes).toBe(512);
  });

  it('getCacheSnapshot sizeBytes is undefined when not provided', () => {
    mod.registerCache({ name: 'NoSize', flush: () => 0 });
    const snap = mod.getCacheSnapshot();
    expect(snap[0].sizeBytes).toBeUndefined();
  });
});
