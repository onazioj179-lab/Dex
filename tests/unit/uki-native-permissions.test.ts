// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ active: true, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.active, invoke: native.invoke }));
import { grant, revoke, listGrants, isGranted } from '../../src/renderer/uki/permissions';
import * as cache from '../../src/renderer/uki/cache';

beforeEach(() => { localStorage.clear(); native.active = true; native.invoke.mockReset(); });
describe('native assistant permission authority', () => {
  it('ignores forged renderer grants under Tauri', async () => {
    await cache.setAsync('uki:permissions', [{ capability: 'shell', scope: 'persistent', grantedTs: 1, schemaVersion: 1 }]);
    native.invoke.mockResolvedValue([]);
    expect(await isGranted('shell')).toBe(false);
    expect(native.invoke).toHaveBeenCalledWith('dex_ipc', { channel: 'uki:permissions:list', args: [] });
  });
  it('requests native consent and propagates user denial', async () => {
    native.invoke.mockResolvedValue({ ok: false, error: 'Permission denied by user' });
    await expect(grant('file-write')).rejects.toThrow('denied by user');
    expect(native.invoke).toHaveBeenCalledWith('dex_ipc', { channel: 'uki:permissions:grant', args: ['file-write', 'session'] });
    native.invoke.mockResolvedValue([]);
    expect(await isGranted('file-write')).toBe(false);
  });
  it('returns native records and revokes through the authority', async () => {
    const record = { schemaVersion: 1, capability: 'file-read', scope: 'session', grantedTs: 1, expiresTs: Date.now() + 1000 };
    native.invoke.mockResolvedValueOnce({ ok: true, record }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce([]);
    expect(await grant('file-read')).toEqual(record);
    await revoke('file-read');
    expect(await listGrants()).toEqual([]);
  });
  it('does not fall back to renderer storage when native IPC fails', async () => {
    native.invoke.mockRejectedValue(new Error('backend unavailable'));
    await expect(listGrants()).rejects.toThrow('backend unavailable');
    await expect(grant('shell')).rejects.toThrow('backend unavailable');
  });
});
