// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppSurface } from '../../src/renderer/components/AppSurface';
import { UnifiedDropdown } from '../../src/renderer/components/UnifiedDropdown';
import { ApplicationPreferences } from '../../src/renderer/pages/ApplicationPreferences';
import { Modal } from '../../src/renderer/ui/Modal';
import { appOpeningBounds } from '../../src/renderer/shell/appWindowPlacement';
import { interruptWindowSnap, queueWindowSnap } from '../../src/renderer/shell/windowSnapMotion';
import { observeAppPreferences, parseWindowSize, preferredWindowSize, useAppPreferences } from '../../src/renderer/store/appPreferences';
import { setReducedMotionPreference, useReducedMotion } from '../../src/renderer/utils/useReducedMotion';

const originalDex = Object.getOwnPropertyDescriptor(window, 'dex');

beforeEach(() => {
  localStorage.clear();
  useAppPreferences.setState({ apps: {}, loaded: false, error: '' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalDex) Object.defineProperty(window, 'dex', originalDex);
  else Reflect.deleteProperty(window, 'dex');
});

it('persists new window dimensions together and updates only the selected app', async () => {
  const invoke = vi.fn(async (channel: string, app: string, key: string, value: string) => {
    const base = { notes: { windowTheme: 'dark' } };
    const apps = channel === 'app-preferences:update' ? { ...base, [app]: { [key]: value } } : base;
    return { success: true, preferences: { version: 1, apps } };
  });
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke } });
  render(<ApplicationPreferences initialApp="browser" />);
  const width = await screen.findByLabelText('Width (px)');
  const height = screen.getByLabelText('Height (px)');
  const apply = screen.getByRole<HTMLButtonElement>('button', { name: 'Apply size' });
  fireEvent.change(width, { target: { value: '1920' } });
  fireEvent.change(height, { target: { value: '99' } });
  expect(apply.disabled).toBe(true);
  fireEvent.change(height, { target: { value: '1080' } });
  fireEvent.click(apply);
  await waitFor(() => expect(preferredWindowSize('browser')).toEqual({ w: 1920, h: 1080 }));
  expect(invoke).toHaveBeenCalledWith('app-preferences:update', 'browser', 'windowSize', '1920x1080');
  expect(useAppPreferences.getState().apps.notes.windowTheme).toBe('dark');
  expect(parseWindowSize('01920x1080')).toBeNull();
  expect(parseWindowSize('3841x1080')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Use app size' }));
  await waitFor(() => expect(preferredWindowSize('browser')).toBeNull());
});

it('applies theme and motion in one mounted app and its portal with global motion taking precedence', () => {
  function MotionStatus({ label }: { label: string }) {
    const reduced = useReducedMotion();
    return <span data-testid={label}>{reduced ? 'reduced' : 'normal'}</span>;
  }
  render(<>
    <AppSurface appId="notes" data-testid="notes">
      <textarea aria-label="Draft" defaultValue="local text" />
      <MotionStatus label="notes-motion" />
      <Modal open title="Notes dialog" onClose={() => undefined} />
    </AppSurface>
    <AppSurface appId="browser" data-testid="browser"><MotionStatus label="browser-motion" /></AppSurface>
  </>);
  const editor = screen.getByRole('textbox', { name: 'Draft' });
  act(() => useAppPreferences.setState({ apps: { notes: { windowTheme: 'light', appMotion: 'reduced' } } }));
  const modal = screen.getByRole('dialog', { name: 'Notes dialog' });
  expect(modal.closest('[data-app-theme]')?.getAttribute('data-app-theme')).toBe('light');
  expect(screen.getByTestId('notes').getAttribute('data-app-motion')).toBe('reduced');
  expect(screen.getByTestId('notes-motion').textContent).toBe('reduced');
  expect(screen.getByTestId('browser').hasAttribute('data-theme')).toBe(false);
  expect(screen.getByTestId('browser-motion').textContent).toBe('normal');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(editor);
  expect((editor as HTMLTextAreaElement).value).toBe('local text');
  act(() => setReducedMotionPreference(true));
  act(() => useAppPreferences.setState({ apps: { notes: { windowTheme: 'dark' } } }));
  expect(modal.closest('[data-app-theme]')?.getAttribute('data-app-theme')).toBe('dark');
  expect(screen.getByTestId('browser-motion').textContent).toBe('reduced');
  expect(screen.getByTestId('notes-motion').textContent).toBe('reduced');
});

it('fits launch dimensions to the workspace, respects app minimums and gives explicit maximize priority', () => {
  const workspace = { x: 24, y: 40, w: 1250, h: 760 };
  const defaults = { w: 900, h: 620, maximized: true };
  const minimum = { w: 740, h: 440 };
  const bounds = () => appOpeningBounds('notes', workspace, [], defaults, minimum);
  expect(bounds()).toEqual(workspace);
  useAppPreferences.setState({ apps: { notes: { windowSize: '1280x530' } } });
  expect(bounds()).toEqual({ x: 24, y: 48, w: 1250, h: 530 });
  expect(appOpeningBounds('notes', workspace, [], defaults, minimum, true)).toEqual(bounds());
  useAppPreferences.setState({ apps: { notes: { windowSize: '350x260' } } });
  expect(bounds()).toEqual({ x: 279, y: 48, w: 740, h: 440 });
  expect(appOpeningBounds('notes', workspace, [], defaults)).toEqual({ x: 469, y: 48, w: 360, h: 280 });
  useAppPreferences.setState({ apps: { notes: { windowSize: '960x600', windowOpenMode: 'maximized' } } });
  expect(bounds()).toEqual(workspace);
});

it('reloads preferences when another DEX window broadcasts a change', async () => {
  let push: (() => void) | undefined;
  const on = vi.fn((_event: string, callback: () => void) => { push = callback; });
  const off = vi.fn();
  const invoke = vi.fn(async () => ({
    success: true, preferences: { version: 1, apps: { notes: { windowTheme: 'dark' } } },
  }));
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke, on, off } });
  const stop = observeAppPreferences();
  try {
    expect(on).toHaveBeenCalledWith('dex-app-preferences-changed', expect.any(Function));
    push?.();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('app-preferences:get'));
    await waitFor(() => expect(useAppPreferences.getState().apps.notes.windowTheme).toBe('dark'));
  } finally {
    stop();
  }
  expect(off).toHaveBeenCalledWith('dex-app-preferences-changed', expect.any(Function));
});

it('reverses a shared dropdown on the same element and disables it as soon as it closes', () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const choose = vi.fn();
  const items = [{ id: 'disabled', label: 'Unavailable', disabled: true }, { id: 'real', label: 'Choose' }];
  function Menu({ open }: { open: boolean }) {
    const trigger = useRef<HTMLButtonElement>(null);
    return <><button ref={trigger}>Trigger</button>
      <UnifiedDropdown open={open} triggerRef={trigger} onClose={close} items={items} onSelect={choose} />
    </>;
  }
  const view = render(<Menu open />);
  const menu = screen.getByRole('menu');
  const item = screen.getByRole('menuitem', { name: 'Choose' });
  expect(menu.style.transformOrigin).toBe('0% 0%');
  expect(document.activeElement).toBe(item);
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledOnce();
  view.rerender(<Menu open={false} />);
  expect(menu.hasAttribute('inert')).toBe(true);
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(item);
  expect(choose).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60));
  view.rerender(<Menu open />);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('menu')).toBe(menu);
  expect(menu.hasAttribute('inert')).toBe(false);
});

it('starts a snap from the release bounds and restarts direct manipulation at the visible midpoint', () => {
  const from = { x: 230, y: 150, w: 710, h: 500 };
  const target = { x: 10, y: 50, w: 800, h: 610 };
  const animation = Object.assign(new EventTarget(), { cancel: vi.fn() });
  const animate = vi.fn(() => animation);
  const surface = (model: typeof from) => <AppSurface appId="notes" data-testid="window" bounds={model}
    style={{ left: model.x, top: model.y, width: model.w, height: model.h }} />;
  const view = render(surface(from));
  const element = screen.getByTestId('window');
  Object.defineProperty(element, 'animate', { value: animate });
  element.style.transform = 'translate(120px, 40px)';
  queueWindowSnap(element, from, 240);
  view.rerender(surface(target));
  expect(element.style.transform).toBe('');
  expect(animate).toHaveBeenCalledWith([
    { left: '230px', top: '150px', width: '710px', height: '500px' },
    { left: '10px', top: '50px', width: '800px', height: '610px' },
  ], expect.objectContaining({ duration: 240 }));
  // jsdom does not interpolate animations, so set the represented midpoint.
  Object.assign(element.style, { left: '120px', top: '100px', width: '755px', height: '555px' });
  expect(interruptWindowSnap(element, target)).toEqual({ x: 120, y: 100, w: 755, h: 555 });
  expect(animation.cancel).toHaveBeenCalledOnce();
  expect(element.style.left).toBe('120px');
  expect(interruptWindowSnap(element, target)).toBeNull();
});
