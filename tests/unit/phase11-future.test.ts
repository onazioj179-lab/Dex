import { describe, it, expect } from 'vitest';
import { PluginSandbox, ServiceMesh } from '../../src/shared/phase11/futureInfra';

describe('Phase 11 - PluginSandbox', () => {
  it('install + grant + check + enforce', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    expect(s.check('p', 'fs.read')).toBe(false);
    s.grant('p', 'fs.read');
    expect(s.check('p', 'fs.read')).toBe(true);
    expect(() => s.enforce('p', 'fs.read')).not.toThrow();
  });

  it('cannot grant capability not in manifest', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    expect(() => s.grant('p', 'net.http')).toThrow();
  });

  it('expiresAt invalidates grant', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    s.grant('p', 'fs.read', 100, 200);
    expect(s.check('p', 'fs.read', 150)).toBe(true);
    expect(s.check('p', 'fs.read', 300)).toBe(false);
  });

  it('uninstall removes manifest and grants', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    s.grant('p', 'fs.read');
    s.uninstall('p');
    expect(s.pluginCount()).toBe(0);
    expect(s.check('p', 'fs.read')).toBe(false);
  });

  it('rejects duplicate install and duplicate manifest capabilities', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    expect(() => s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] })).toThrow();
    expect(() => s.install({ id: 'q', version: '1.0.0', capabilities: ['fs.read', 'fs.read'] })).toThrow();
  });

  it('enforce throws when capability missing', () => {
    const s = new PluginSandbox();
    s.install({ id: 'p', version: '1.0.0', capabilities: ['fs.read'] });
    expect(() => s.enforce('p', 'fs.read')).toThrow();
  });
});

describe('Phase 11 - ServiceMesh', () => {
  it('register and resolve highest version', () => {
    const m = new ServiceMesh();
    m.register({ name: 'cache', version: '1.0.0', instance: { v: 1 } });
    m.register({ name: 'cache', version: '1.2.0', instance: { v: 2 } });
    m.register({ name: 'cache', version: '2.0.0', instance: { v: 3 } });
    expect(m.resolve('cache')!.version).toBe('2.0.0');
  });

  it('caret matching stays in same major', () => {
    const m = new ServiceMesh();
    m.register({ name: 'cache', version: '1.0.0', instance: 1 });
    m.register({ name: 'cache', version: '1.5.0', instance: 2 });
    m.register({ name: 'cache', version: '2.0.0', instance: 3 });
    expect(m.resolve('cache', '^1.0.0')!.version).toBe('1.5.0');
  });

  it('exact match', () => {
    const m = new ServiceMesh();
    m.register({ name: 's', version: '1.0.0', instance: 'a' });
    m.register({ name: 's', version: '1.1.0', instance: 'b' });
    expect(m.resolve('s', '1.0.0')!.instance).toBe('a');
  });

  it('rejects bad versions and duplicates', () => {
    const m = new ServiceMesh();
    expect(() => m.register({ name: 's', version: 'bad', instance: 1 })).toThrow();
    m.register({ name: 's', version: '1.0.0', instance: 1 });
    expect(() => m.register({ name: 's', version: '1.0.0', instance: 2 })).toThrow();
  });

  it('unregister cleanup', () => {
    const m = new ServiceMesh();
    const off = m.register({ name: 's', version: '1.0.0', instance: 1 });
    off();
    expect(m.resolve('s')).toBeNull();
    expect(m.list()).toEqual([]);
  });

  it('returns null for unknown', () => {
    expect(new ServiceMesh().resolve('missing')).toBeNull();
  });
});
