// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's speaking voice: one place for voice choice, speed, pitch and volume.
 *
 * Her default is a crisp, professional British woman's voice: Windows' neural
 * en-GB voices first (Sonia, Libby, Maisie), then Hazel, Google UK English
 * Female and the macOS British voices, then any female English voice. The
 * user's choices in Settings › UKI (voice, speed, pitch, volume) always win;
 * before this module the floating panel ignored them and used fixed values.
 */

export interface UkiVoicePrefs {
  voiceURI?: string;
  gender?: 'female' | 'male' | 'auto';
  rate?: number;
  pitch?: number;
  volume?: number;
}

/** Speed steps offered by the panel's speed control. */
export const SPEED_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const DEFAULT_RATE = 1.05;
const SETTINGS_KEY = 'dex-settings';

/** British female voices, best first. Neural ("Natural"/"Online") voices outrank older desktop ones. */
const BRITISH_FEMALE = [/sonia/i, /libby/i, /maisie/i, /hazel/i, /google uk english female/i, /serena/i, /kate/i, /stephanie/i, /martha/i, /amy/i, /emma.*(gb|uk|brit)/i];
const FEMALE_HINTS = ['female', 'woman', 'sonia', 'libby', 'maisie', 'hazel', 'serena', 'kate', 'martha', 'amy', 'samantha', 'victoria', 'karen', 'tessa', 'fiona', 'moira', 'allison', 'ava', 'susan', 'zira', 'aria', 'jenny', 'emma', 'michelle', 'sara'];
const MALE_HINTS = ['male', 'daniel', 'alex', 'fred', 'oliver', 'tom', 'david', 'mark', 'george', 'james', 'guy', 'ryan', 'brian', 'aaron', 'thomas', 'arthur'];

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'voiceURI' | 'lang'>;

function hay(v: VoiceLike): string { return `${v.name} ${v.voiceURI}`.toLowerCase(); }
function isFemale(v: VoiceLike): boolean { const h = hay(v); return !/\bmale\b/.test(h.replace(/female/g, '')) && FEMALE_HINTS.some((x) => h.includes(x)); }
function isMale(v: VoiceLike): boolean { const h = hay(v).replace(/female/g, ''); return MALE_HINTS.some((x) => h.includes(x)); }
function isBritish(v: VoiceLike): boolean { return /^en[-_]gb/i.test(v.lang) || /united kingdom|great britain|\buk\b|british/i.test(v.name); }
function isNeural(v: VoiceLike): boolean { return /natural|neural|online/i.test(v.name); }

/** Choose her voice from what the system offers. */
export function pickUkiVoice<V extends VoiceLike>(voices: V[], prefs: UkiVoicePrefs = {}): V | null {
  if (!voices.length) return null;
  if (prefs.voiceURI) {
    const exact = voices.find((v) => v.voiceURI === prefs.voiceURI);
    if (exact) return exact;
  }
  const english = voices.filter((v) => /^en/i.test(v.lang));
  const pool = english.length ? english : voices;
  if (prefs.gender === 'male') return pool.find((v) => isBritish(v) && isMale(v)) ?? pool.find(isMale) ?? pool[0];
  // Female (the default) and Auto: a British woman, neural first.
  const british = pool.filter((v) => isBritish(v) && !isMale(v));
  for (const want of BRITISH_FEMALE) {
    const neural = british.find((v) => want.test(v.name) && isNeural(v));
    if (neural) return neural;
  }
  for (const want of BRITISH_FEMALE) {
    const any = british.find((v) => want.test(v.name)) ?? pool.find((v) => want.test(v.name));
    if (any) return any;
  }
  return british.find(isFemale) ?? pool.find((v) => isFemale(v) && isNeural(v)) ?? pool.find(isFemale) ?? british[0] ?? pool[0];
}

/** The user's voice settings (Settings › UKI), with her defaults. */
export function readVoicePrefs(): Required<Omit<UkiVoicePrefs, 'voiceURI'>> & { voiceURI: string } {
  let s: Record<string, unknown> = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') ?? {}; } catch { /* defaults */ }
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const g = s.ukiVoiceGender;
  return {
    voiceURI: typeof s.ukiVoiceURI === 'string' ? s.ukiVoiceURI : '',
    gender: g === 'male' || g === 'auto' ? g : 'female',
    rate: num(s.ukiVoiceRate, DEFAULT_RATE, 0.5, 2),
    pitch: num(s.ukiVoicePitch, 1, 0.5, 2),
    volume: num(s.ukiVoiceVolume, 1, 0, 1),
  };
}

/** Change one voice setting (the panel's speed control writes here; Settings reads the same key). */
export function writeVoicePref(key: 'ukiVoiceRate' | 'ukiVoicePitch' | 'ukiVoiceVolume', value: number): void {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') ?? {};
    s[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent('dex-uki-voice-changed', { detail: { [key]: value } }));
  } catch { /* storage unavailable */ }
}

/** Next speed step up (+1) or down (-1) from the current rate. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const steps = [...SPEED_STEPS] as number[];
  if (dir > 0) return steps.find((s) => s > rate + 0.001) ?? steps[steps.length - 1];
  return [...steps].reverse().find((s) => s < rate - 0.001) ?? steps[0];
}

/** Text tuned for speech: no markdown symbols, links or code read aloud. */
export function speakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Speak with her voice and the user's settings. `onEnd` always fires once. */
export function speakAsUki(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const prefs = readVoicePrefs();
  const u = new SpeechSynthesisUtterance(speakableText(text));
  u.rate = prefs.rate;
  u.pitch = prefs.pitch;
  u.volume = prefs.volume;
  const voice = pickUkiVoice(synth.getVoices(), prefs);
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
  let done = false;
  const finish = () => { if (!done) { done = true; onEnd?.(); } };
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}
