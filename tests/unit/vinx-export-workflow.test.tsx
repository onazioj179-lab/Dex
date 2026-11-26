// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ run: vi.fn(), cancel: vi.fn(), update: vi.fn(), add: vi.fn(), duration: 60 }));
vi.mock('../../src/renderer/DEXAPPLICATIONS/vinx/quickExport', () => ({
  isNativeOnlyFormat: () => false, isQuickExportSupported: () => true,
  runQuickExport: mocks.run,
}));
vi.mock('../../src/renderer/utils/nativeBridge', () => ({ getDiskInfo: async () => [] }));
vi.mock('../../src/renderer/components/DexIcon', () => ({ default: () => null }));
vi.mock('../../src/renderer/DEXAPPLICATIONS/vinx/VinxStore', () => ({ useVinxStore: (selector: any) => selector({
  showExportDialog: true, setShowExportDialog: vi.fn(), addExportJob: mocks.add,
  updateExportJob: mocks.update, removeExportJob: vi.fn(), exportJobs: [],
  project: { frameRate: 30, width: 1280, height: 720, markers: [] }, getSequenceDuration: () => mocks.duration,
}) }));
import { ExportDialog } from '../../src/renderer/DEXAPPLICATIONS/vinx/ExportDialog';
beforeEach(() => { vi.clearAllMocks(); mocks.duration = 60; mocks.run.mockReturnValue({ cancel: mocks.cancel, stop: vi.fn() }); });
afterEach(cleanup);
describe('Vinx export workflow', () => {
  it('uses timeline playback and marks completion only when the encoder completes', () => {
    const start = vi.fn(), stop = vi.fn(), seek = vi.fn();
    render(<><div data-vinx-program-canvas /><ExportDialog startPlayback={start} stopPlayback={stop} seek={seek} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Start export' }));
    const options = mocks.run.mock.calls[0][0];
    expect(options.durationFrames).toBe(60);
    expect(options.startPlayback).toBe(start);
    expect(options.stopPlayback).toBe(stop);
    expect(options.seek).toBe(seek);
    expect(mocks.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'complete' }));
    options.onComplete(new Blob());
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'complete', progress: 100 }));
  });
  it('cancels the capture when the workspace unmounts', () => {
    const { unmount } = render(<><div data-vinx-program-canvas /><ExportDialog startPlayback={vi.fn()} stopPlayback={vi.fn()} seek={vi.fn()} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Start export' }));
    unmount();
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'failed' }));
  });
  it('does not create a fake render for an empty timeline', () => {
    mocks.duration = 0;
    render(<ExportDialog startPlayback={vi.fn()} stopPlayback={vi.fn()} seek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start export' }));
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
