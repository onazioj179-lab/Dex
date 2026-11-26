// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installPermissionGate, setPermissionAsker, useCaptureStore } from '../../src/renderer/services/permissionGate';
import { installNetworkGate, reachOfHost, urlAllowed } from '../../src/renderer/services/networkGate';
import { usePermissionStore } from '../../src/renderer/store/permissionStore';
import { useNetworkStore } from '../../src/renderer/store/networkStore';
import { setThemePreference, THEME_CHANGED_EVENT } from '../../src/renderer/utils/theme';
import { interfaceState, applyInterfaceState } from '../../src/renderer/services/dataBackup';
import { parseSystemControl } from '../../src/renderer/uki/systemControls';
import { buildChatCommand, runChatCommand } from '../../src/renderer/uki/chatActions';

function fakeTrack(kind: 'audio' | 'video') {
  const listeners: (() => void)[] = [];
  const track = {
    kind,
    stopped: false,
    stop() { track.stopped = true; },
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn); },
    dispatchEvent: () => { listeners.forEach((fn) => fn()); return true; },
  };
  return track;
}

describe('permission gate', () => {
  let uninstall: () => void = () => undefined;
  let tracks: ReturnType<typeof fakeTrack>[] = [];
  const getUserMedia = vi.fn(async (c?: MediaStreamConstraints) => {
    tracks = [c?.audio ? fakeTrack('audio') : null, c?.video ? fakeTrack('video') : null].filter(Boolean) as ReturnType<typeof fakeTrack>[];
    return { getTracks: () => tracks } as unknown as MediaStream;
  });
  const position = vi.fn((ok: PositionCallback) => ok({} as GeolocationPosition));
  let target: any;

  beforeEach(() => {
    usePermissionStore.getState().revokeAll();
    getUserMedia.mockClear();
    position.mockClear();
    target = {
      mediaDevices: { getUserMedia },
      geolocation: { getCurrentPosition: position, watchPosition: vi.fn(() => 41), clearWatch: vi.fn() },
    };
    uninstall = installPermissionGate(target);
  });
  afterEach(() => { uninstall(); setPermissionAsker(null); });

  it("never reaches the device when the user says Don't Allow", async () => {
    const ask = vi.fn(async () => false);
    setPermissionAsker(ask);
    await expect(target.mediaDevices.getUserMedia({ audio: true })).rejects.toMatchObject({ name: 'NotAllowedError' });
    // A retry straight away is refused without a second dialog.
    await expect(target.mediaDevices.getUserMedia({ audio: true })).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(usePermissionStore.getState().permissions.microphone.enabled).toBe(false);
  });

  it('asks once for both devices, turns the switches on and counts the capture', async () => {
    const ask = vi.fn(async () => true);
    setPermissionAsker(ask);
    await target.mediaDevices.getUserMedia({ audio: true, video: true });
    expect(ask.mock.calls[0][0]).toEqual(['microphone', 'camera']);
    expect(usePermissionStore.getState().permissions.camera.enabled).toBe(true);
    expect(useCaptureStore.getState().live).toEqual({ microphone: 1, camera: 1 });
    tracks[0].stop();
    expect(useCaptureStore.getState().live).toEqual({ camera: 1 });
  });

  it('stops a running capture when its switch is turned off', async () => {
    const ask = vi.fn(async () => false);
    setPermissionAsker(ask);
    usePermissionStore.getState().setPermission('microphone', true);
    await target.mediaDevices.getUserMedia({ audio: true });
    expect(ask).not.toHaveBeenCalled();
    usePermissionStore.getState().setPermission('microphone', false);
    expect(tracks[0].stopped).toBe(true);
    expect(useCaptureStore.getState().live).toEqual({});
  });

  it('holds location behind the same switch', async () => {
    setPermissionAsker(async () => false);
    const error = vi.fn();
    target.geolocation.getCurrentPosition(vi.fn(), error);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(error.mock.calls[0][0].code).toBe(1);
    expect(position).not.toHaveBeenCalled();
  });
});

describe('network gate', () => {
  afterEach(() => useNetworkStore.setState({ mode: 'full' }));

  it('classes hosts by how far they reach', () => {
    for (const h of ['localhost', 'tauri.localhost', '127.0.0.1', '[::1]']) expect(reachOfHost(h), h).toBe('pc');
    for (const h of ['192.168.1.4', '10.2.3.4', '172.20.0.1', 'nas', 'printer.local', 'fd12::1']) expect(reachOfHost(h), h).toBe('lan');
    for (const h of ['example.com', '8.8.8.8', '192.168.evil.com', '172.32.0.1']) expect(reachOfHost(h), h).toBe('internet');
  });

  it('allows only what the mode reaches', () => {
    expect(urlAllowed('https://api.openai.com/v1', 'full')).toBe(true);
    expect(urlAllowed('https://api.openai.com/v1', 'local-only')).toBe(false);
    expect(urlAllowed('http://192.168.1.4/x', 'local-only')).toBe(true);
    expect(urlAllowed('http://192.168.1.4/x', 'disabled')).toBe(false);
    expect(urlAllowed('http://127.0.0.1:11434/api/tags', 'disabled')).toBe(true);
    expect(urlAllowed('data:text/plain,hi', 'disabled')).toBe(true);
  });

  it('blocks fetch, sockets and beacons while offline, and passes them when back', async () => {
    const fetch = vi.fn(async () => new Response('ok'));
    const beacon = vi.fn(() => true);
    class Socket { constructor(public url: string) {} }
    const win: any = { fetch, WebSocket: Socket, XMLHttpRequest: undefined, navigator: { sendBeacon: beacon } };
    const uninstall = installNetworkGate(win);
    useNetworkStore.setState({ mode: 'disabled' });
    await expect(win.fetch('https://example.com')).rejects.toThrow('DEX is offline');
    expect(() => new win.WebSocket('wss://example.com')).toThrow('DEX is offline');
    expect(win.navigator.sendBeacon('https://example.com')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    useNetworkStore.setState({ mode: 'full' });
    await win.fetch('https://example.com');
    expect(new win.WebSocket('wss://example.com')).toBeInstanceOf(Socket);
    expect(fetch).toHaveBeenCalledTimes(1);
    uninstall();
  });
});

describe('theme choice', () => {
  it('announces a choice that keeps the same colours (Auto -> Dark)', () => {
    setThemePreference('dark', { animate: false });
    const heard = vi.fn();
    window.addEventListener(THEME_CHANGED_EVENT, heard);
    setThemePreference('dark', { animate: false });
    expect(heard).toHaveBeenCalled();
    window.removeEventListener(THEME_CHANGED_EVENT, heard);
  });
});

describe('backup of interface data', () => {
  it('carries settings and app data, never credentials, and restores exactly', () => {
    const store = new Map<string, string>(Object.entries({
      'dex-settings': '{"a":1}', 'dex.notes': 'n', darkMode: 'false', 'dex-new-since-backup': 'x',
      'forge-workspace': 'w', 'dex-uki-keystore-v1': 'secret', 'dex-uki-key-openai': 'k', 'dex-vault': 'v',
      'dex-browser-keychain': 'p', 'dex.account.v1': 'a', 'dex-permissions': 'granted',
    }));
    const storage = {
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    } as unknown as Storage;
    const state = interfaceState(storage);
    expect(Object.keys(state).sort()).toEqual(['darkMode', 'dex-new-since-backup', 'dex-settings', 'dex.notes', 'forge-workspace']);
    applyInterfaceState({ 'dex-settings': '{"a":0}', 'dex-vault': 'from-backup' }, storage);
    expect(store.get('dex-settings')).toBe('{"a":0}');
    expect(store.has('dex-new-since-backup')).toBe(false);
    expect(store.get('dex-vault')).toBe('v');
    expect(store.get('dex-uki-keystore-v1')).toBe('secret');
    expect(store.get('dex-permissions')).toBe('granted');
    expect(store.has('forge-workspace')).toBe(false);
  });
});

describe('UKI system commands', () => {
  it('understands whole commands only', () => {
    expect(parseSystemControl('Uki, turn off the camera.')).toEqual({ op: 'permission', id: 'camera', on: false });
    expect(parseSystemControl('allow microphone access')).toEqual({ op: 'permission', id: 'microphone', on: true });
    expect(parseSystemControl('go offline')).toEqual({ op: 'network', mode: 'disabled' });
    expect(parseSystemControl('switch to local only mode')).toEqual({ op: 'network', mode: 'local-only' });
    expect(parseSystemControl('back up my data')).toEqual({ op: 'backup' });
    expect(parseSystemControl('privacy status')).toEqual({ op: 'status' });
    for (const q of ['how do I back up my data?', 'turn off the lights', 'go to settings', 'why did the camera turn off', 'back up the car']) {
      expect(parseSystemControl(q), q).toBeNull();
    }
  });

  it('asks before giving access, and restricts at once', () => {
    expect(buildChatCommand('turn on the camera').tier).toBe('confirm');
    expect(buildChatCommand('go online').tier).toBe('confirm');
    expect(buildChatCommand('turn off the camera').tier).toBe('auto');
    expect(buildChatCommand('go offline').tier).toBe('auto');
  });

  it('really switches a permission off', async () => {
    usePermissionStore.getState().setPermission('camera', true);
    await expect(runChatCommand(buildChatCommand('disable the camera').plan, '')).resolves.toBe('Camera access is off.');
    expect(usePermissionStore.getState().permissions.camera.enabled).toBe(false);
  });
});
