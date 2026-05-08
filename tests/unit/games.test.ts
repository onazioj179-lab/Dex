// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseSteamManifest, parseEpicManifest, planLaunch, recordSession, type DiscoveredGame } from '../../src/shared/games/launcher';
import { pickCompatShim, frameBudgetMs, type GameProfile } from '../../src/shared/games/runtime';

describe('launcher', () => {
  it('parses steam manifest', () => {
    const g = parseSteamManifest({ appid: '440', name: 'TF2' });
    expect(g?.id).toBe('steam:440');
  });
  it('rejects malformed', () => {
    expect(parseSteamManifest({ appid: '', name: '' })).toBeNull();
    expect(parseEpicManifest({})).toBeNull();
  });
  it('plans launch via storefront', () => {
    const g: DiscoveredGame = { id: 'steam:440', source: 'steam', title: 'TF2' };
    const plan = planLaunch(g);
    expect(plan.viaStorefront).toBe(true);
    expect(plan.command[1]).toContain('rungameid/440');
  });
  it('records playtime', () => {
    const r1 = recordSession(undefined, 'g', 60, '2026-01-01T00:01:00Z');
    const r2 = recordSession(r1, 'g', 120, '2026-01-01T00:03:00Z');
    expect(r2.totalSec).toBe(180);
    expect(r2.sessions).toBe(2);
  });
});

describe('runtime + compat shim', () => {
  const profile: GameProfile = { gameId: 'g', target: 'native-windows', needs: { gpu: true, gamepad: true, hid: false, lowLatencyAudio: true, multiplayer: false }, antiCheat: 'none', targetFps: 60 };
  it('windows native on windows host = win-loader', () => {
    expect(pickCompatShim(profile, 'win-x64').kind).toBe('win-loader');
  });
  it('windows native on linux = proton', () => {
    expect(pickCompatShim(profile, 'linux-x64').kind).toBe('proton');
  });
  it('windows native on linux-arm64 = unsupported', () => {
    expect(pickCompatShim(profile, 'linux-arm64').kind).toBe('unsupported');
  });
  it('windows native on mac-arm64 = gptk', () => {
    expect(pickCompatShim(profile, 'mac-arm64').kind).toBe('gptk');
  });
  it('kernel anti-cheat is unsupported', () => {
    expect(pickCompatShim({ ...profile, antiCheat: 'kernel-mode' }, 'linux-x64').kind).toBe('unsupported');
  });
  it('frame budget for 60fps = 16ms', () => {
    expect(frameBudgetMs(profile)).toBe(16);
  });
});
