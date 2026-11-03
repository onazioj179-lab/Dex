import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpotlightEngine } from '../../src/renderer/shell/SpotlightEngine';
import { useRunningApps } from '../../src/renderer/store/runningApps';
import { useSpatialStore } from '../../src/renderer/store/spatialStore';

describe('Spotlight: open windows and spatial places', () => {
  beforeEach(() => {
    useRunningApps.setState({ runningApps: [], currentAppId: 'home' });
    useSpatialStore.setState({ enabled: false, windows: {}, groups: [], zones: [], views: [] });
  });

  it('finds an open window and switches to it', () => {
    useRunningApps.setState({ runningApps: [{ id: 'calculator', name: 'Calculator', icon: 'calculator', color: '#0A84FF', launchedAt: 1, lastActiveAt: 1, isMinimized: false }] });
    const nav = vi.fn();
    window.addEventListener('dex-spotlight-navigate', nav as EventListener);
    const r = new SpotlightEngine().search('calcul').find((x) => x.id === 'window-calculator');
    expect(r).toBeTruthy();
    expect(r!.subtitle).toBe('Open window');
    r!.action();
    expect((nav.mock.calls[0][0] as CustomEvent).detail).toEqual({ appId: 'calculator' });
    window.removeEventListener('dex-spotlight-navigate', nav as EventListener);
  });

  it('on the spatial desktop, finds groups, zones and views and moves the camera to them', () => {
    const focusGroup = vi.fn(), focusZone = vi.fn(), goToView = vi.fn(), focusWindow = vi.fn();
    useRunningApps.setState({ runningApps: [{ id: 'notes', name: 'Notes', icon: 'notes', color: '#0A84FF', launchedAt: 1, lastActiveAt: 1, isMinimized: false }] });
    useSpatialStore.setState({
      enabled: true,
      windows: { notes: { id: 'notes', title: 'Notes', x: 0, y: 0, w: 400, h: 300, z: 1, minimized: false } },
      groups: [{ id: 'g1', name: 'Research board', color: '#0A84FF', appIds: ['notes'], collapsed: false }],
      zones: [{ id: 'z1', name: 'Research', color: '#0A84FF', x: 0, y: 0, w: 800, h: 600 }],
      views: [{ id: 'v1', name: 'Research overview', camera: { x: 0, y: 0, z: 0.5 } }],
      focusGroup, focusZone, goToView, focusWindow,
    } as never);
    const res = new SpotlightEngine().search('research');
    const ids = res.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['spatial-group-g1', 'spatial-zone-z1', 'spatial-view-v1']));
    res.find((r) => r.id === 'spatial-group-g1')!.action();
    res.find((r) => r.id === 'spatial-zone-z1')!.action();
    res.find((r) => r.id === 'spatial-view-v1')!.action();
    expect(focusGroup).toHaveBeenCalledWith('g1');
    expect(focusZone).toHaveBeenCalledWith('z1');
    expect(goToView).toHaveBeenCalledWith('v1');

    const win = new SpotlightEngine().search('notes').find((r) => r.id === 'window-notes')!;
    expect(win.subtitle).toBe('Open window · on the canvas');
    win.action();
    expect(focusWindow).toHaveBeenCalledWith('notes');
  });

  it('returns no spatial places when the spatial desktop is off', () => {
    useSpatialStore.setState({ zones: [{ id: 'z1', name: 'Research', color: '#0A84FF', x: 0, y: 0, w: 800, h: 600 }] } as never);
    expect(new SpotlightEngine().search('research').some((r) => r.id.startsWith('spatial-'))).toBe(false);
  });
});
