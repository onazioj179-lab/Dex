// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Spatial Audio
 * Positions UI sounds in the stereo field based on the screen location
 * of the triggering element. Wraps Web Audio API.
 */

// ---------------------------------------------------------------------------
// SINGLETON CONTEXT
// ---------------------------------------------------------------------------

const SOUND_PREF_KEY = 'dex-ui-sounds';

function readSoundPref(): boolean {
  try { return localStorage.getItem(SOUND_PREF_KEY) !== 'off'; } catch { return true; }
}

let _ctx: AudioContext | null = null;
// Persisted so a muted user stays muted across restarts (default: on).
let _enabled = readSoundPref();

function getContext(): AudioContext | null {
  if (!_enabled) return null;
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  try {
    _ctx = new AudioContext();
  } catch {
    _ctx = null;
  }
  return _ctx;
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export function setSoundEnabled(on: boolean): void {
  _enabled = on;
  try { localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
  if (!on && _ctx) {
    _ctx.close().catch((e: unknown) => { console.warn('[DEX]', e); });
    _ctx = null;
  }
}

export function isSoundEnabled(): boolean {
  return _enabled;
}

/**
 * Compute stereo pan from an element's screen-center x.
 * Maps left edge to -1, right edge to +1.
 */
function panFromX(x: number): number {
  const w = window.innerWidth;
  if (w <= 0) return 0;
  return Math.max(-1, Math.min(1, (x / w) * 2 - 1));
}

/**
 * Play a synthesized tone positioned in stereo space.
 * @param x - screen x coordinate of the triggering element center
 * @param frequency - Hz
 * @param attack - seconds
 * @param decay - seconds
 * @param volume - 0..1
 */
export function playSpatialTone(
  x: number,
  frequency: number,
  attack: number,
  decay: number,
  volume: number,
): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch((e: unknown) => { console.warn('[DEX]', e); });
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();

  osc.type = 'sine';
  osc.frequency.value = frequency;
  pan.pan.value = panFromX(x);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay);

  osc.connect(gain);
  gain.connect(pan);
  pan.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + attack + decay + 0.01);
}

// ---------------------------------------------------------------------------
// NAMED SOUND PRESETS
// ---------------------------------------------------------------------------

/** Toggle switch click */
export function playToggle(x: number): void {
  playSpatialTone(x, 1200, 0.002, 0.03, 0.15);
}

/** Drop thud */
export function playDrop(x: number): void {
  playSpatialTone(x, 80, 0.005, 0.08, 0.2);
}

/** Notification pop */
export function playNotification(x: number): void {
  playSpatialTone(x, 880, 0.01, 0.12, 0.12);
}

/** Copy confirmation */
export function playCopy(x: number): void {
  playSpatialTone(x, 1600, 0.003, 0.05, 0.1);
}

/** Error / rejection */
export function playError(x: number): void {
  playSpatialTone(x, 220, 0.005, 0.15, 0.12);
}

/** Window focus lift */
export function playLift(x: number): void {
  playSpatialTone(x, 600, 0.003, 0.04, 0.08);
}
