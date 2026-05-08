// =============================================================================
// DEX Platform — Track E2/E3: game runtime + compat shim policy
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Game-specific layer atop AppContainer: input device routing, frame-pace
 * targets, and the compatibility shim selector for unmodified PC titles.
 */

import { type AppLoad } from '../runtime/resourceGovernor';

export type Platform = 'win-x64' | 'win-arm64' | 'mac-arm64' | 'mac-x64' | 'linux-x64' | 'linux-arm64' | 'dex-os';

export interface GameProfile {
  gameId: string;
  /** Native target — if 'web' use the in-DEX runtime; otherwise compat shim. */
  target: 'web' | 'native-windows' | 'native-linux' | 'native-mac';
  /** Required API surface: gpu, gamepad, hid, audio low-latency. */
  needs: {
    gpu: boolean;
    gamepad: boolean;
    hid: boolean;
    lowLatencyAudio: boolean;
    multiplayer: boolean;
  };
  /** Anti-cheat tag — kernel-level titles are flagged but never bundled. */
  antiCheat?: 'none' | 'user-mode' | 'kernel-mode';
  /** Target frame rate. */
  targetFps: 30 | 60 | 120;
}

export type CompatShim =
  | { kind: 'native' }
  | { kind: 'proton'; protonVersion: string }
  | { kind: 'gptk' }                       // Apple Game Porting Toolkit
  | { kind: 'win-loader'; overlay: boolean }
  | { kind: 'unsupported'; reason: string };

export function pickCompatShim(profile: GameProfile, host: Platform): CompatShim {
  if (profile.antiCheat === 'kernel-mode') {
    return { kind: 'unsupported', reason: 'kernel-level anti-cheat is not supported' };
  }
  if (profile.target === 'web') return { kind: 'native' };

  if (profile.target === 'native-windows') {
    if (host === 'win-x64' || host === 'win-arm64') return { kind: 'win-loader', overlay: true };
    if (host === 'linux-x64' || host === 'dex-os') return { kind: 'proton', protonVersion: 'GE-Proton-9' };
    if (host === 'linux-arm64') return { kind: 'unsupported', reason: 'no x86 emulation on linux-arm64' };
    if (host === 'mac-arm64') return { kind: 'gptk' };
    if (host === 'mac-x64') return { kind: 'unsupported', reason: 'GPTK requires Apple Silicon' };
  }
  if (profile.target === 'native-linux') {
    if (host === 'linux-x64' || host === 'linux-arm64' || host === 'dex-os') return { kind: 'native' };
    return { kind: 'unsupported', reason: 'native linux binaries cannot run on this host' };
  }
  if (profile.target === 'native-mac') {
    if (host === 'mac-arm64' || host === 'mac-x64') return { kind: 'native' };
    return { kind: 'unsupported', reason: 'native mac binaries cannot run on this host' };
  }
  return { kind: 'unsupported', reason: 'unknown target/host combination' };
}

/** Frame budget in ms per frame at this profile's target fps. */
export function frameBudgetMs(profile: GameProfile): number {
  return Math.floor(1000 / profile.targetFps);
}

/** Build the AppLoad row for the governor when this game is foregrounded. */
export function gameLoad(profile: GameProfile, used: { cpuPctUsed: number; ramMbUsed: number; gpuMemMbUsed: number }): AppLoad {
  return {
    appId: profile.gameId,
    weight: 'critical',
    foreground: true,
    cpuPctUsed: used.cpuPctUsed,
    ramMbUsed: used.ramMbUsed,
    gpuMemMbUsed: used.gpuMemMbUsed,
    suspended: false,
  };
}

export interface SaveSlot {
  slot: number;
  /** SHA-256 of save blob (lives in BlobStore). */
  blobSha256: string;
  bytes: number;
  /** Wall-clock saved at. */
  savedAtMs: number;
  /** True when the save was synced to other devices. */
  cloudSynced: boolean;
}

export interface AchievementEvent {
  gameId: string;
  achievementId: string;
  unlockedAtMs: number;
  /** Ed25519 signature over canonical event (verified by host). */
  signature: string;
}
