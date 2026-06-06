// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Decode a media URL to mono PCM (ROADMAP-600 #199/#233 wiring support). Thin
 * renderer-only adapter: fetch the (object/blob/http) URL, decode via Web Audio,
 * and down-mix to a single Float32 channel for the pure analysis engines
 * (silenceDetect, beatDetect). Kept tiny and side-effect-free beyond the
 * AudioContext it opens and closes; the heavy logic stays in the shared engines.
 */

// DEX v6.0 — renderer media decode adapter

export interface DecodedAudio {
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
}

type AudioCtor = typeof AudioContext;

function audioContextCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Fetch and decode `url` to mono PCM. Resolves null if Web Audio is unavailable
 * or the resource cannot be fetched/decoded (caller treats that as "skip").
 */
export async function decodeAudioToMono(url: string): Promise<DecodedAudio | null> {
  const Ctor = audioContextCtor();
  if (!Ctor || !url) return null;
  let ctx: AudioContext | null = null;
  try {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    ctx = new Ctor();
    const audio = await ctx.decodeAudioData(buf);
    const channels = audio.numberOfChannels;
    const len = audio.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < channels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
    }
    return { pcm: mono, sampleRate: audio.sampleRate, duration: audio.duration };
  } catch {
    return null;
  } finally {
    if (ctx) { try { await ctx.close(); } catch { /* ignore */ } }
  }
}

/** Slice mono PCM to a [startSec, endSec) window (clamped). */
export function slicePCM(pcm: Float32Array, sampleRate: number, startSec: number, endSec: number): Float32Array {
  const from = Math.max(0, Math.floor(startSec * sampleRate));
  const to = Math.min(pcm.length, Math.ceil(endSec * sampleRate));
  return to > from ? pcm.subarray(from, to) : new Float32Array(0);
}
