// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SpatialHud, spatialMenuActions } from '../../src/renderer/shell/spatial/SpatialHud';
import { useSpatialStore } from '../../src/renderer/store/spatialStore';
import { TouchInputPanel } from '../../src/renderer/pages/settingsPanels/TouchInputPanel';

describe('spatial desktop: no persistent bottom controls', () => {
  beforeEach(() => { useSpatialStore.setState({ enabled: true, minimap: false }); });

  it('renders no toolbar and no minimap by default', () => {
    const { container } = render(<SpatialHud />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    // Overlay sits top-right, never along the bottom edge.
    const hud = container.querySelector('[data-spatial-hud]') as HTMLElement;
    expect(hud.style.bottom).toBe('');
    expect(hud.style.top).toBe('16px');
  });

  it('opens the Windows panel from the shortcut event and the minimap on demand', () => {
    render(<SpatialHud />);
    act(() => { window.dispatchEvent(new CustomEvent('dex-spatial-windows')); });
    expect(screen.getByRole('dialog', { name: 'Spatial desktop panel' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(screen.getByRole('button', { name: 'Grid' })).toBeTruthy();
    act(() => { useSpatialStore.getState().toggleMinimap(); });
    fireEvent.click(screen.getByRole('button', { name: 'Hide minimap' }));
    expect(useSpatialStore.getState().minimap).toBe(false);
  });

  it('exposes every former toolbar action through the desktop menu', () => {
    const ids = spatialMenuActions().map((a) => a.id);
    expect(ids).toEqual(['fit', 'zoom-in', 'zoom-out', 'actual', 'back', 'windows', 'minimap', 'leave']);
    useSpatialStore.setState({ enabled: false });
    expect(spatialMenuActions().map((a) => a.id)).toEqual(['enter']);
  });

  it('migrates a persisted always-on minimap to off', async () => {
    const opts = (useSpatialStore as unknown as { persist: { getOptions: () => { migrate: (p: unknown, v: number) => { minimap: boolean } } } }).persist.getOptions();
    expect(opts.migrate({ minimap: true }, 1).minimap).toBe(false);
    expect(opts.migrate({ minimap: true }, 2).minimap).toBe(true);
  });
});

describe('Settings > Touch & Pen', () => {
  it('reports no touch screen honestly and disables haptics without an actuator', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    render(<TouchInputPanel />);
    expect(screen.getByText('No touch screen reported')).toBeTruthy();
    expect(screen.queryByText('Touch test')).toBeNull();
    const sw = screen.getByRole('switch', { name: 'Haptic feedback' }) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('shows the test pad and counts simultaneous contacts on a touch screen', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 10, configurable: true });
    try {
      render(<TouchInputPanel />);
      expect(screen.getByText('10 simultaneous contacts')).toBeTruthy();
      const pad = screen.getByRole('img', { name: /Touch test pad/ });
      act(() => {
        for (let i = 0; i < 5; i++) {
          pad.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 20 + i, pointerType: 'touch', clientX: 10 + i * 30, clientY: 50, isPrimary: i === 0, bubbles: true }));
        }
      });
      expect(screen.getByText('Now: 5')).toBeTruthy();
      act(() => { pad.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, pointerType: 'touch', bubbles: true })); });
      expect(screen.getByText('Now: 4')).toBeTruthy();
      expect(screen.getByText('Most at once: 5')).toBeTruthy();
    } finally {
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    }
  });
});
