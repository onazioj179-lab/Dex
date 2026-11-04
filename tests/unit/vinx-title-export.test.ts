// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { describe, expect, it, vi } from 'vitest';
import { drawExportTitles } from '../../src/renderer/DEXAPPLICATIONS/vinx/quickExport';

describe('Vinx title export', () => {
  it('composites title lines with scaled typography and opacity', () => {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 640 });
    host.innerHTML = '<div data-vinx-export-title style="opacity:0.5"><span style="font-size:24px;font-family:Arial;font-weight:700;color:rgb(255,255,255)">First\nSecond</span></div>';
    document.body.append(host);
    const ctx = { save: vi.fn(), restore: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawExportTitles(ctx, host, 1280, 720);
    expect(ctx.font).toBe('700 48px Arial');
    expect(ctx.globalAlpha).toBe(0.5);
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).toHaveBeenCalledWith('First', 640, 331.2, 1280);
    expect(ctx.restore).toHaveBeenCalledOnce();
    host.remove();
  });
  it('omits hidden overlays', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div data-vinx-export-title style="display:none"><span>Hidden</span></div>';
    const ctx = { fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawExportTitles(ctx, host, 1280, 720);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
