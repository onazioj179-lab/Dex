// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { afterEach, expect, it, vi } from 'vitest';
import { describeUpdateError, useSoftwareUpdate } from '../../src/renderer/services/softwareUpdate';

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
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'error', failedStep: 'check', errorDetail: 'Update feed unavailable' });
  await useSoftwareUpdate.getState().check();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'current', error: '' });
});

const update = (download: ReturnType<typeof vi.fn>, install = vi.fn(async () => undefined)) => ({
  version: '7.0.4', body: '', close: vi.fn(async () => undefined), download, install,
});

it('a failed download retries the same update without a new check', async () => {
  const download = vi.fn()
    .mockRejectedValueOnce(new Error('error sending request: connection reset'))
    .mockImplementationOnce(async (emit: (event: unknown) => void) => { emit({ event: 'Finished' }); });
  api.check.mockResolvedValue(update(download));
  await useSoftwareUpdate.getState().check();
  await useSoftwareUpdate.getState().download();
  expect(useSoftwareUpdate.getState()).toMatchObject({ phase: 'error', failedStep: 'download' });
  expect(useSoftwareUpdate.getState().error).toMatch(/interrupted\. Nothing was installed/);
  await useSoftwareUpdate.getState().retry();
  expect(api.check).toHaveBeenCalledTimes(1);
  expect(download).toHaveBeenCalledTimes(2);
  expect(useSoftwareUpdate.getState().phase).toBe('ready');
});

it('an invalid signature is reported as not installed and never reaches install', async () => {
  const install = vi.fn(async () => undefined);
  api.check.mockResolvedValue(update(vi.fn().mockRejectedValue(new Error('minisign: signature verification failed')), install));
  await useSoftwareUpdate.getState().check();
  await useSoftwareUpdate.getState().download();
  expect(useSoftwareUpdate.getState().error).toMatch(/signature check, so it was not installed/);
  await useSoftwareUpdate.getState().install();
  expect(install).not.toHaveBeenCalled();
});

it('offline fails fast without calling the server', async () => {
  const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await useSoftwareUpdate.getState().check();
  spy.mockRestore();
  expect(api.check).not.toHaveBeenCalled();
  expect(useSoftwareUpdate.getState().error).toMatch(/could not reach the update server/);
});

it('maps disk-space and installer failures to plain language', () => {
  expect(describeUpdateError('download', new Error('os error 112: ENOSPC'))).toMatch(/not enough free disk space/);
  expect(describeUpdateError('install', new Error('failed to run installer'))).toMatch(/current version is unchanged/);
});
