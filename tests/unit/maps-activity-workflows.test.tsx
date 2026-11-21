// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Maps from '../../src/renderer/DEXAPPLICATIONS/standalone/Maps';
import Activity from '../../src/renderer/DEXAPPLICATIONS/standalone/LiveActivityBrowser';
import { saveBlobAs } from '../../src/renderer/services/nativeSave';
import { useCreativeInput } from '../../src/renderer/services/creativeIntake';
import { takeCalendarDraft } from '../../src/renderer/services/calendarDraft';

const map = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  setStyle: vi.fn(), line: vi.fn(),
}));

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      on(event: string, cb: (event: unknown) => void) { map.handlers.set(event, cb); }
      off(event: string) { map.handlers.delete(event); }
      once(event: string, cb: () => void) { if (event === 'idle') cb(); }
      setStyle = map.setStyle;
      isStyleLoaded = () => true;
      getSource = () => undefined;
      addSource = map.line;
      addLayer() {}
      getLayer() {}
      remove() {}
      flyTo() {}
    },
    Marker: class {
      setLngLat() { return this; }
      addTo() { return this; }
      remove() {}
    },
  },
}));
vi.mock('../../src/renderer/services/nativeSave', () => ({ saveBlobAs: vi.fn().mockResolvedValue(null) }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); map.handlers.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); takeCalendarDraft(); });

function clickMap(lng: number, lat: number) {
  act(() => map.handlers.get('click')?.({ lngLat: { lng, lat } }));
}

it('starts a Calendar draft and encodes the dropped pin as a geo QR payload', () => {
  const receive = vi.fn();
  function Receiver() { useCreativeInput('qrcode', receive); return null; }
  render(<><Maps /><Receiver /></>);
  clickMap(3.39, 6.45);
  fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
  expect(receive).toHaveBeenCalledWith('geo:6.45,3.39');
  fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
  const draft = takeCalendarDraft()!;
  expect(draft.description).toContain('6.450');
  expect(draft.end.getTime() - draft.start.getTime()).toBe(30 * 60_000);
});

it('measures each segment of a map path and can undo the last point', () => {
  render(<Maps />);
  fireEvent.click(screen.getByRole('button', { name: 'Measure distance' }));
  clickMap(0, 0);
  clickMap(0, 1);
  clickMap(1, 1);
  expect(screen.getByText(/3 points/)).toBeVisible();
  expect(map.line.mock.lastCall?.[1].data.geometry.coordinates).toEqual([[0, 0], [0, 1], [1, 1]]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove last point' }));
  expect(screen.getByText(/2 points/)).toBeVisible();
});

it('chooses a basemap and recalls a saved place after reopening Maps', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ results: [{ name: 'Lagos', latitude: 6.45, longitude: 3.39, country: 'Nigeria' }] }),
  })));
  const first = render(<Maps />);
  const search = screen.getByRole('searchbox', { name: 'Search places' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Lagos' } });
  const results = await screen.findByRole('listbox', { name: 'Search results' });
  fireEvent.click(within(results).getByRole('button', { name: 'Save place' }));
  fireEvent.click(within(results).getByRole('button', { name: /Lagos/ }));
  fireEvent.focus(search);
  expect(within(screen.getByRole('listbox', { name: 'Recent searches' })).getByText('Lagos')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'Satellite' }));
  expect(map.setStyle.mock.lastCall?.[0]).toMatchObject({ sources: { raster: { type: 'raster' } } });
  first.unmount();
  render(<Maps />);
  fireEvent.click(screen.getByRole('button', { name: 'Saved places' }));
  expect(screen.getByText('Lagos')).toBeVisible();
});

it('counts new activity when the feed stays the same size and saves only the filtered rows', async () => {
  const entry = (id: number, title: string, app: string) => ({
    id, title, app, event_type: 'test', source: 'local', details: '', created_at: new Date().toISOString(),
  });
  let feed = [entry(2, 'Old note', 'notes'), entry(1, 'Old task', 'tasks')];
  vi.stubGlobal('dex', { invoke: vi.fn(async (channel: string) => channel === 'activity-feed:get' ? feed : null) });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  render(<Activity />);
  fireEvent.click(screen.getByRole('button', { name: 'App', exact: true }));
  await screen.findByText('Old note');
  fireEvent.click(screen.getByRole('button', { name: 'Pause live feed' }));
  feed = [entry(3, 'New note', 'notes'), feed[0]];
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await screen.findByText('Resume (1)');
  expect(screen.queryByText('New note')).toBeNull();
  fireEvent.click(screen.getByText('Resume (1)'));
  await screen.findByText('New note');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'New note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save filtered activity' }));
  await waitFor(() => expect(saveBlobAs).toHaveBeenCalledTimes(1));
  const [name, blob] = vi.mocked(saveBlobAs).mock.calls[0];
  expect(name).toBe('DEX-activity.txt');
  const text = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(text).toContain('New note');
  expect(text).not.toContain('Old note');
});
