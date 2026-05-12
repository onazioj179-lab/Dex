// =============================================================================
// DEX Platform - Foundations refinement tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//
// Tests for the OS-refinement foundations: ContextBus continuity channels,
// stage store, pin registry, .dexproject manifest, AssetLibrary, snap engine,
// and window manifest.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextBus } from '../../src/renderer/services/ContextBus';
import { useStageStore, STAGE_DEFAULT_ID } from '../../src/renderer/store/stageStore';
import { usePinRegistry } from '../../src/renderer/store/pinRegistry';
import {
  createDexProject,
  setAppView,
  getAppView,
  addPaletteColor,
  addMarker,
  isDexProjectManifest,
  coerceManifest,
  touchProject,
  DEXPROJECT_VERSION,
} from '../../src/renderer/services/DexProject';
import { AssetLibrary } from '../../src/renderer/services/AssetLibrary';
import {
  detectZone,
  rectForZone,
  magnetize,
  makeEnv,
  isThrow,
} from '../../src/renderer/shell/snapEngine';
import {
  captureManifest,
  isDifferent,
  scheduleWrite,
  loadManifest,
  clearManifest,
  flush,
} from '../../src/renderer/shell/WindowManifest';

// ---------------------------------------------------------------------------
// ContextBus continuity channels
// ---------------------------------------------------------------------------
describe('ContextBus continuity channels', () => {
  beforeEach(() => {
    ContextBus._reset();
    ContextBus._setThrottle(0);
  });

  it('delivers continuity:color payloads', () => {
    const fn = vi.fn();
    ContextBus.on('continuity:color', fn);
    ContextBus.emit('continuity:color', { source: 'prism', hex: '#ff8800' });
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ hex: '#ff8800' }));
  });

  it('delivers continuity:timecode + handoff/handoffAck pair', () => {
    const tc = vi.fn();
    const h = vi.fn();
    const ack = vi.fn();
    ContextBus.on('continuity:timecode', tc);
    ContextBus.on('continuity:handoff', h);
    ContextBus.on('continuity:handoffAck', ack);
    ContextBus.emit('continuity:timecode', { source: 'imosion', seconds: 12.5, fps: 60 });
    ContextBus.emit('continuity:handoff', { id: 'h1', from: 'imosion', to: 'vinx', kind: 'clip', payload: {} });
    ContextBus.emit('continuity:handoffAck', { id: 'h1', accepted: true });
    expect(tc).toHaveBeenCalled();
    expect(h).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ id: 'h1', accepted: true });
  });

  it('delivers continuity:project + assetFocus + stage + previewPipe', () => {
    const all = vi.fn();
    ContextBus.on('continuity:project',     (p) => all(p));
    ContextBus.on('continuity:assetFocus',  (p) => all(p));
    ContextBus.on('continuity:stage',       (p) => all(p));
    ContextBus.on('continuity:previewPipe', (p) => all(p));
    ContextBus.emit('continuity:project',     { projectId: 'p1', source: 'imosion' });
    ContextBus.emit('continuity:assetFocus',  { source: 'vinx', assetId: 'b1', kind: 'brush' });
    ContextBus.emit('continuity:stage',       { stageId: 'work' });
    ContextBus.emit('continuity:previewPipe', { pipeId: 'pp1', from: 'vinx', to: 'forge', active: true });
    expect(all).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Stage store
// ---------------------------------------------------------------------------
describe('useStageStore', () => {
  beforeEach(() => {
    // reset to single default stage
    useStageStore.setState({
      stages: [{
        id: STAGE_DEFAULT_ID,
        name: 'Workspace',
        posture: 'work',
        windows: [],
        accent: null,
        wallpaperId: null,
        dnd: false,
        createdAt: 0,
        updatedAt: 0,
        lastActiveAt: 0,
      }],
      activeStageId: STAGE_DEFAULT_ID,
      history: [STAGE_DEFAULT_ID],
    });
    ContextBus._reset();
    ContextBus._setThrottle(0);
  });

  it('creates, renames, and deletes a stage', () => {
    const id = useStageStore.getState().createStage({ name: 'Edit', posture: 'edit' });
    expect(useStageStore.getState().stages.length).toBe(2);
    useStageStore.getState().renameStage(id, 'Editing');
    expect(useStageStore.getState().getStage(id)?.name).toBe('Editing');
    useStageStore.getState().deleteStage(id);
    expect(useStageStore.getState().stages.length).toBe(1);
  });

  it('refuses to delete the default stage', () => {
    useStageStore.getState().deleteStage(STAGE_DEFAULT_ID);
    expect(useStageStore.getState().getStage(STAGE_DEFAULT_ID)).toBeDefined();
  });

  it('emits continuity:stage when active stage switches', () => {
    const fn = vi.fn();
    ContextBus.on('continuity:stage', fn);
    const id = useStageStore.getState().createStage({ name: 'Focus', posture: 'focus' });
    useStageStore.getState().setActiveStage(id);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ stageId: id, previousStageId: STAGE_DEFAULT_ID }));
    expect(useStageStore.getState().activeStageId).toBe(id);
    expect(useStageStore.getState().history[0]).toBe(id);
  });

  it('captures windows and posture mutations', () => {
    useStageStore.getState().captureWindows(STAGE_DEFAULT_ID, [{ appId: 'notes', z: 1 }], 'notes');
    const s = useStageStore.getState().getStage(STAGE_DEFAULT_ID)!;
    expect(s.windows[0].appId).toBe('notes');
    expect(s.focusedAppId).toBe('notes');
    useStageStore.getState().setPosture(STAGE_DEFAULT_ID, 'focus');
    useStageStore.getState().setAccent(STAGE_DEFAULT_ID, '#ff0000');
    useStageStore.getState().setDnd(STAGE_DEFAULT_ID, true);
    const s2 = useStageStore.getState().getStage(STAGE_DEFAULT_ID)!;
    expect(s2.posture).toBe('focus');
    expect(s2.accent).toBe('#ff0000');
    expect(s2.dnd).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pin registry
// ---------------------------------------------------------------------------
describe('usePinRegistry', () => {
  beforeEach(() => {
    usePinRegistry.setState({ ownedPins: [] });
  });

  it('pins folder, project, savedSearch, workspace, view and dedupes', () => {
    const r = usePinRegistry.getState();
    const f1 = r.pinFolder('/work/Projects', 'Projects');
    const f2 = r.pinFolder('/work/Projects', 'Projects'); // duplicate
    expect(f1).toBe(f2);

    r.pinProject('/work/Projects/song.dexproject', 'Song', 'imosion');
    r.pinSavedSearch('kind:image AND tag:hero', 'Hero images', 'gallery');
    r.pinWorkspace('stage-edit', 'Edit', '#60a5fa');
    r.pinView('/files/recent', 'Recent', 'files');

    const owned = usePinRegistry.getState().ownedPins;
    expect(owned.length).toBe(5);
    expect(owned.map((p) => p.kind).sort()).toEqual(['folder', 'project', 'savedSearch', 'view', 'workspace']);
  });

  it('listByKind aggregates registry-owned pins', () => {
    const r = usePinRegistry.getState();
    r.pinFolder('/a');
    r.pinFolder('/b');
    r.pinProject('/c.dexproject');
    expect(r.listByKind('folder').length).toBe(2);
    expect(r.listByKind('project').length).toBe(1);
  });

  it('unpin removes by id', () => {
    const r = usePinRegistry.getState();
    const id = r.pinFolder('/x');
    expect(r.exists(id)).toBe(true);
    r.unpin(id);
    expect(r.exists(id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// .dexproject manifest
// ---------------------------------------------------------------------------
describe('DexProject manifest', () => {
  it('creates a valid manifest with sane defaults', () => {
    const m = createDexProject({ name: 'Demo', appId: 'imosion' });
    expect(isDexProjectManifest(m)).toBe(true);
    expect(m.version).toBe(DEXPROJECT_VERSION);
    expect(m.apps).toContain('imosion');
    expect(m.palette.colors).toEqual([]);
  });

  it('touches MRU app list and updatedAt', async () => {
    const m = createDexProject({ name: 'Demo', appId: 'imosion' });
    await new Promise((r) => setTimeout(r, 5));
    const m2 = touchProject(m, 'vinx');
    expect(m2.apps[0]).toBe('vinx');
    expect(m2.apps).toContain('imosion');
    expect(m2.updatedAt >= m.updatedAt).toBe(true);
  });

  it('sets and gets per-app view state', () => {
    const m = createDexProject({ name: 'Demo' });
    const m2 = setAppView(m, 'imosion', { tracks: 4 });
    const v = getAppView(m2, 'imosion');
    expect(v?.state.tracks).toBe(4);
  });

  it('addPaletteColor validates hex and dedupes', () => {
    let m = createDexProject({ name: 'Demo' });
    m = addPaletteColor(m, '#ABCDEF');
    m = addPaletteColor(m, '#abcdef'); // duplicate after normalization
    m = addPaletteColor(m, 'not a color');
    expect(m.palette.colors).toEqual(['#abcdef']);
  });

  it('addMarker creates a timeline if missing and appends', () => {
    let m = createDexProject({ name: 'Demo' });
    m = addMarker(m, { seconds: 1.0, label: 'intro' });
    m = addMarker(m, { seconds: 2.0, label: 'verse' });
    expect(m.timeline?.markers?.length).toBe(2);
    expect(m.timeline?.markers?.[0].label).toBe('intro');
  });

  it('coerceManifest recovers from a partial blob', () => {
    const m = coerceManifest({ name: 'Recovered' });
    expect(m).not.toBeNull();
    expect(isDexProjectManifest(m!)).toBe(true);
  });

  it('coerceManifest returns null for non-objects', () => {
    expect(coerceManifest(null)).toBeNull();
    expect(coerceManifest(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AssetLibrary
// ---------------------------------------------------------------------------
describe('AssetLibrary', () => {
  beforeEach(() => {
    AssetLibrary._reset();
    ContextBus._reset();
    ContextBus._setThrottle(0);
  });

  it('upserts and retrieves assets', () => {
    const a = AssetLibrary.upsert({ kind: 'brush', name: 'Soft Round', ownerAppId: 'vinx', payload: { size: 12 } });
    expect(AssetLibrary.get('brush', a.id)).toBeDefined();
    const b = AssetLibrary.upsert({ id: a.id, kind: 'brush', name: 'Soft Round', ownerAppId: 'vinx', payload: { size: 24 } });
    expect(b.id).toBe(a.id);
    expect((AssetLibrary.get('brush', a.id)?.payload as { size: number }).size).toBe(24);
  });

  it('list filters by tag and ownerAppId', () => {
    AssetLibrary.upsert({ kind: 'palette', name: 'Sunset', ownerAppId: 'shared', tags: ['warm'], payload: {} });
    AssetLibrary.upsert({ kind: 'palette', name: 'Dawn', ownerAppId: 'prism', tags: ['warm', 'soft'], payload: {} });
    AssetLibrary.upsert({ kind: 'palette', name: 'Night', ownerAppId: 'shared', tags: ['cool'], payload: {} });
    expect(AssetLibrary.list('palette', { tag: 'warm' }).length).toBe(2);
    expect(AssetLibrary.list('palette', { ownerAppId: 'prism' }).length).toBe(1);
  });

  it('subscribe pushes immediately and on change', () => {
    const listener = vi.fn();
    AssetLibrary.subscribe('sample', listener);
    expect(listener).toHaveBeenCalledTimes(1);
    AssetLibrary.upsert({ kind: 'sample', name: 'Kick', ownerAppId: 'imosion', payload: {} });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('focus emits continuity:assetFocus', () => {
    const fn = vi.fn();
    ContextBus.on('continuity:assetFocus', fn);
    const a = AssetLibrary.upsert({ kind: 'lut', name: 'Cinema', ownerAppId: 'shared', payload: {} });
    AssetLibrary.focus(a, 'forge');
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ assetId: a.id, kind: 'lut' }));
  });

  it('importBatch + exportAll round trip', () => {
    const before = AssetLibrary.exportAll();
    expect(before.length).toBe(0);
    AssetLibrary.importBatch([
      { id: 'b1', kind: 'brush', name: 'B1', ownerAppId: 'vinx', payload: {}, createdAt: 1, updatedAt: 1 },
      { id: 'p1', kind: 'palette', name: 'P1', ownerAppId: 'prism', payload: {}, createdAt: 1, updatedAt: 1 },
    ]);
    expect(AssetLibrary.exportAll().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Snap engine
// ---------------------------------------------------------------------------
describe('snapEngine', () => {
  const env = makeEnv(1600, 1000, { top: 28 });

  it('detects edge zones', () => {
    expect(detectZone(2, 500, env)).toBe('left');
    expect(detectZone(1599, 500, env)).toBe('right');
    expect(detectZone(800, 30, env)).toBe('full'); // top bar slim zone (28 + a bit)
  });

  it('detects corners', () => {
    expect(detectZone(2, 30, env)).toBe('top-left');
    expect(detectZone(1599, 30, env)).toBe('top-right');
    expect(detectZone(2, 999, env)).toBe('bottom-left');
    expect(detectZone(1599, 999, env)).toBe('bottom-right');
  });

  it('detects thirds opt-in via bottom edge', () => {
    expect(detectZone(2, 999, env, { thirds: true })).toBe('bottom-left'); // hits left+bottom corner first
    expect(detectZone(200, 999, env, { thirds: true })).toBe('left-third');
    expect(detectZone(800, 999, env, { thirds: true })).toBe('center-third');
    expect(detectZone(1500, 999, env, { thirds: true })).toBe('right-third');
  });

  it('detects stash on velocity throw', () => {
    expect(detectZone(2, 500, env, { stashVelocity: 2.0 })).toBe('stash-left');
    expect(detectZone(1599, 500, env, { stashVelocity: 2.0 })).toBe('stash-right');
  });

  it('rectForZone respects safe area', () => {
    const r = rectForZone('left', env);
    expect(r.y).toBe(28);
    expect(r.height).toBe(972);
    expect(r.width).toBeCloseTo(800, 0);
  });

  it('magnetize snaps within tolerance', () => {
    const a = { x: 102, y: 100, width: 200, height: 100 };
    const n = { x: 100, y: 100, width: 200, height: 100 };
    const out = magnetize(a, [n], 6);
    expect(out.x).toBe(100);
  });

  it('isThrow flags long drags', () => {
    expect(isThrow(50)).toBe(false);
    expect(isThrow(400)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WindowManifest
// ---------------------------------------------------------------------------
describe('WindowManifest', () => {
  beforeEach(() => {
    clearManifest();
  });

  it('captures a manifest snapshot', () => {
    const m = captureManifest([{ appId: 'notes', x: 0, y: 0, width: 800, height: 600, z: 1 }], 'stage-default');
    expect(m.version).toBe(1);
    expect(m.windows.length).toBe(1);
    expect(m.stageId).toBe('stage-default');
  });

  it('isDifferent detects geometry/topology changes', () => {
    const a = captureManifest([{ appId: 'notes', x: 0, y: 0, width: 800, height: 600, z: 1 }]);
    const b = captureManifest([{ appId: 'notes', x: 10, y: 0, width: 800, height: 600, z: 1 }]);
    const c = captureManifest([
      { appId: 'notes', x: 0, y: 0, width: 800, height: 600, z: 1 },
      { appId: 'files', x: 0, y: 0, width: 800, height: 600, z: 2 },
    ]);
    expect(isDifferent(a, b)).toBe(true);
    expect(isDifferent(a, c)).toBe(true);
    expect(isDifferent(a, captureManifest(a.windows, a.stageId))).toBe(false);
  });

  it('scheduleWrite + flush persist and loadManifest reads back', async () => {
    scheduleWrite([{ appId: 'notes', x: 1, y: 2, width: 3, height: 4, z: 5 }], 'stage-default');
    await new Promise((r) => setTimeout(r, 1700));
    const loaded = loadManifest();
    expect(loaded?.windows[0].appId).toBe('notes');
    expect(loaded?.stageId).toBe('stage-default');
    flush();
  });
});
