// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { afterEach, expect, it, vi } from 'vitest';
import { useSoftwareUpdate } from '../../src/renderer/services/softwareUpdate';

const api = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => api);

afterEach(async () => {
  useSoftwareUpdate.setState({ phase: 'idle' });
  api.check.mockResolvedValue(null);
  await useSoftwareUpdate.getState().check();
  useSoftwareUpdate.setState({ phase: 'idle' });
  vi.clearAllMocks();
});

it('counts downloaded bytes and waits for verification before enabling install', async () => {
  let finish!: () => void;
  const verified = new Promise<void>(resolve => { finish = resolve; });
  const install = vi.fn(async () => undefined);
  api.check.mockResolvedValue({
    version: '7.0.3', body: 'Release notes',
    close: vi.fn(async () => undefined), install,
    download: vi.fn(async (emit: (event: unknown) => void) => {
      emit({ event: 'Started', data: { contentLength: 400 } });
      emit({ event: 'Progress', data: { chunkLength: 130 } });
      emit({ event: 'Progress', data: { chunkLength: 270 } });
      emit({ event: 'Finished' });
      await verified;
    }),
  });
  await useSoftwareUpdate.getState().check();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'available', version: '7.0.3' });
  const downloading = useSoftwareUpdate.getState().download();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'verifying', received: 400, total: 400 });
  await useSoftwareUpdate.getState().install();
  expect(install).not.toHaveBeenCalled();
  finish();
  await downloading;
  expect(useSoftwareUpdate.getState().phase).toBe('ready');
  await useSoftwareUpdate.getState().install();
  expect(install).toHaveBeenCalledOnce();
});

it('shows an unsuccessful update check as an error and can retry', async () => {
  api.check.mockRejectedValueOnce(new Error('Update feed unavailable')).mockResolvedValueOnce(null);
  await useSoftwareUpdate.getState().check();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'error', error: 'Update feed unavailable' });
  await useSoftwareUpdate.getState().check();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'current', error: '' });
});
