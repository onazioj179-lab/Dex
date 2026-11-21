import React, { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpatialWorkspace } from '../../src/renderer/shell/SpatialWorkspace';
import { clampCamera, fitSpatialWindows, resizeWindow, zoomAt } from '../../src/renderer/shell/spatialGeometry';
import { useMotionPresence } from '../../src/renderer/utils/useMotionPresence';
import { prefersReducedMotion, setReducedMotionPreference } from '../../src/renderer/utils/useReducedMotion';
import { clampImagePan, zoomImageAt } from '../../src/renderer/pages/galleryImageView';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Spatial workspace', () => {
  const viewport = { width: 1200, height: 800 };

  it('keeps the same workspace point beneath an anchored zoom', () => {
    const start = { scale: 0.85, x: 24, y: 40 };
    const anchor = { x: 420, y: 350 };
    const next = zoomAt(start, 1.25, anchor, viewport);
    expect((anchor.x - next.x) / next.scale).toBeCloseTo((anchor.x - start.x) / start.scale);
    expect((anchor.y - next.y) / next.scale).toBeCloseTo((anchor.y - start.y) / start.scale);
  });

  it('bounds extreme pan and scale so the workspace remains recoverable', () => {
    expect(clampCamera({ scale: 5, x: 9000, y: -9000 }, viewport))
      .toEqual({ scale: 1.5, x: 1080, y: -1104 });
  });

  it('fits the union of open windows with space below for the controls', () => {
    const view = fitSpatialWindows([
      { x: 20, y: 20, w: 450, h: 360 },
      { x: 540, y: 290, w: 630, h: 470 },
    ], viewport)!;
    expect(view.scale).toBeLessThan(1);
    expect(20 * view.scale + view.x).toBeGreaterThanOrEqual(24);
    expect(20 * view.scale + view.y).toBeCloseTo(20);
    expect(760 * view.scale + view.y).toBeCloseTo(708);
    expect(fitSpatialWindows([], viewport)).toBeNull();
  });

  it('keeps opposite resize edges fixed and handles windows already below their default minimum', () => {
    const workspace = { x: 0, y: 0, w: 1200, h: 800 };
    const original = { x: 100, y: 80, w: 550, h: 420 };
    expect(resizeWindow(original, workspace, 'nw', 500, 500))
      .toEqual({ x: 290, y: 220, w: 360, h: 280 });
    expect(resizeWindow(original, workspace, 'se', 1200, 800))
      .toEqual({ x: 100, y: 80, w: 1100, h: 720 });
    const small = { x: 0, y: 0, w: 300, h: 240 };
    expect(resizeWindow(small, workspace, 'se', 0, 0)).toEqual(small);
  });

  it('restores the view and keeps the same editable surface across repeated toggles', () => {
    localStorage.setItem('dex-spatial-camera', JSON.stringify({ scale: 1.25, x: 0, y: 0 }));
    const Harness = ({ active }: { active: boolean }) => {
      const viewportRef = useRef<HTMLDivElement>(null);
      return <SpatialWorkspace active={active} viewportRef={viewportRef} onExit={() => {}}>
        <textarea aria-label="Draft" />
      </SpatialWorkspace>;
    };
    const { rerender } = render(<Harness active={false} />);
    const editor = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } });
    rerender(<Harness active />);
    expect(screen.getByRole('button', { name: 'Reset view, current zoom 125%' })).toBeTruthy();
    rerender(<Harness active={false} />);
    rerender(<Harness active />);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
    expect((editor as HTMLTextAreaElement).value).toBe('Unsaved draft');
  });

  it('leaves pan mode before exiting spatial view with Escape', () => {
    const exit = vi.fn();
    const Harness = () => {
      const viewportRef = useRef<HTMLDivElement>(null);
      return <SpatialWorkspace active viewportRef={viewportRef} onExit={exit}><div /></SpatialWorkspace>;
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Fit open windows' })).toBeDisabled();
    const pan = screen.getByRole('button', { name: 'Pan workspace' });
    fireEvent.click(pan);
    expect(pan).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(pan, { key: 'Escape' });
    expect(pan).toHaveAttribute('aria-pressed', 'false');
    expect(exit).not.toHaveBeenCalled();
    fireEvent.keyDown(pan, { key: 'Escape' });
    expect(exit).toHaveBeenCalledOnce();
  });
});

describe('Shell motion', () => {
  const Surface = ({ open }: { open: boolean }) => {
    const present = useMotionPresence(open);
    return present ? <button data-testid="surface" {...(!open ? { inert: '' } : {})}>Reusable surface</button> : null;
  };

  it('keeps a reversing surface mounted and marks it inert immediately on dismissal', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Surface open />);
    const surface = screen.getByTestId('surface');
    rerender(<Surface open={false} />);
    expect(surface.hasAttribute('inert')).toBe(true);
    act(() => vi.advanceTimersByTime(60));
    rerender(<Surface open />);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('surface')).toBe(surface);
    expect(surface.hasAttribute('inert')).toBe(false);
  });

  it('dismisses immediately when the preference changes at runtime', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Surface open />);
    rerender(<Surface open={false} />);
    expect(screen.getByTestId('surface')).toBeTruthy();
    act(() => setReducedMotionPreference(true));
    expect(prefersReducedMotion()).toBe(true);
    expect(screen.queryByTestId('surface')).toBeNull();
  });
});

describe('Gallery zoom and pan', () => {
  it('keeps the image coordinate beneath a zoom anchor', () => {
    const start = { zoom: 2, pan: { x: -20, y: 40 } };
    const anchor = { x: 400, y: 240 };
    const next = zoomImageAt(start, 3, anchor);
    expect((anchor.x - next.pan.x) / next.zoom).toBe((anchor.x - start.pan.x) / start.zoom);
    expect((anchor.y - next.pan.y) / next.zoom).toBe((anchor.y - start.pan.y) / start.zoom);
  });

  it('bounds panning by the fitted and rotated photograph and recenters fit mode', () => {
    const view = { zoom: 2, pan: { x: 999, y: -999 } };
    const viewport = { width: 1000, height: 800 };
    const portrait = { width: 800, height: 1600 };
    expect(clampImagePan(view, viewport, portrait, 0).pan).toEqual({ x: 0, y: -400 });
    expect(clampImagePan(view, viewport, portrait, 90).pan).toEqual({ x: 300, y: 0 });
    expect(clampImagePan({ ...view, zoom: 1 }, viewport, portrait, 0).pan).toEqual({ x: 0, y: 0 });
  });
});
