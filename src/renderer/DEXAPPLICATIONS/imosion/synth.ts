// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// IMOSION - Built-in Subtractive Software Synthesizer
//
// A real, dependency-free Web Audio instrument so MIDI / piano-roll notes
// produce sound WITHOUT any external VST/AU plugin (native VST hosting is out
// of scope). Provides selectable oscillator shapes, an ADSR amplitude
// envelope, a resonant low-pass filter, polyphony with voice-stealing, and
// proper note-off / cleanup so no voices get stuck or leak.
// =============================================================================

/** Oscillator waveforms exposed by the built-in synth. */
export type SynthWaveform = 'sawtooth' | 'square' | 'sine' | 'triangle';

/** Tweakable parameters for the built-in synth. */
export interface BuiltInSynthParams {
  /** Oscillator 1 shape. */
  waveform: SynthWaveform;
  /** Oscillator 2 detune in cents (a second detuned osc for width); 0 = off. */
  detune: number;
  /** ADSR amplitude envelope (seconds, with sustain 0..1). */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Low-pass filter cutoff in Hz. */
  filterCutoff: number;
  /** Low-pass filter resonance (BiquadFilter Q). */
  filterResonance: number;
  /** Master output level for the synth (0..1). */
  level: number;
}

export const DEFAULT_SYNTH_PARAMS: BuiltInSynthParams = {
  waveform: 'sawtooth',
  detune: 8,
  attack: 0.01,
  decay: 0.18,
  sustain: 0.7,
  release: 0.25,
  filterCutoff: 6000,
  filterResonance: 4,
  level: 0.6,
};

/** MIDI note number -> frequency (A4 = 440 Hz, equal temperament). */
export function midiNoteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** A single active voice (one or two oscillators -> filter -> amp gain). */
interface SynthVoice {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  amp: GainNode;
  note: number;
  startedAt: number;
  releaseTimer: number | null;
}

/**
 * Polyphonic subtractive synthesizer.
 *
 * Signal path per voice:  osc(s) -> low-pass filter -> amp(ADSR) -> output
 * The shared `output` GainNode is connected to whatever destination node the
 * caller passes in (e.g. a track's mixer input), so the synth mixes through
 * the existing channel strip rather than going straight to the speakers.
 */
export class BuiltInSynth {
  private ctx: AudioContext;
  private output: GainNode;
  private voices = new Map<number, SynthVoice>();
  private params: BuiltInSynthParams;
  private maxPolyphony = 16;
  private destroyed = false;

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    params?: Partial<BuiltInSynthParams>,
  ) {
    this.ctx = audioContext;
    this.params = { ...DEFAULT_SYNTH_PARAMS, ...(params || {}) };
    this.output = this.ctx.createGain();
    this.output.gain.value = this.params.level;
    try {
      this.output.connect(destination);
    } catch {
      // Fallback so a bad destination never leaves the synth silent/orphaned.
      try { this.output.connect(this.ctx.destination); } catch { /* nothing else to do */ }
    }
  }

  /** Update synth parameters live (waveform, ADSR, filter, level). */
  setParams(next: Partial<BuiltInSynthParams>): void {
    this.params = { ...this.params, ...next };
    if (next.level !== undefined && !this.destroyed) {
      try {
        this.output.gain.setTargetAtTime(
          Math.max(0, Math.min(1, this.params.level)),
          this.ctx.currentTime,
          0.02,
        );
      } catch { /* ignore */ }
    }
    // Live-update filter on any still-sounding voices.
    if ((next.filterCutoff !== undefined || next.filterResonance !== undefined) && !this.destroyed) {
      const now = this.ctx.currentTime;
      for (const voice of this.voices.values()) {
        try {
          if (next.filterCutoff !== undefined) {
            voice.filter.frequency.setTargetAtTime(this.clampCutoff(this.params.filterCutoff), now, 0.02);
          }
          if (next.filterResonance !== undefined) {
            voice.filter.Q.setTargetAtTime(Math.max(0.0001, this.params.filterResonance), now, 0.02);
          }
        } catch { /* ignore */ }
      }
    }
  }

  getParams(): BuiltInSynthParams {
    return { ...this.params };
  }

  /** Redirect the synth's master output to a new destination node. */
  setDestination(destination: AudioNode): void {
    if (this.destroyed) return;
    try { this.output.disconnect(); } catch { /* ignore */ }
    try {
      this.output.connect(destination);
    } catch {
      try { this.output.connect(this.ctx.destination); } catch { /* ignore */ }
    }
  }

  private clampCutoff(hz: number): number {
    const nyquist = this.ctx.sampleRate / 2;
    return Math.max(20, Math.min(hz, nyquist - 1));
  }

  /**
   * Trigger a note.
   * @param note     MIDI note number (0-127)
   * @param velocity 0-127 (defaults to 100)
   */
  noteOn(note: number, velocity = 100): void {
    if (this.destroyed) return;
    try {
      // Retrigger: stop any existing voice for this note first.
      if (this.voices.has(note)) this.hardStopVoice(note);

      // Voice stealing if we are at the polyphony cap.
      if (this.voices.size >= this.maxPolyphony) {
        let oldestNote: number | null = null;
        let oldest = Infinity;
        for (const [n, v] of this.voices) {
          if (v.startedAt < oldest) { oldest = v.startedAt; oldestNote = n; }
        }
        if (oldestNote !== null) this.hardStopVoice(oldestNote);
      }

      const now = this.ctx.currentTime;
      const { attack, decay, sustain, detune, waveform } = this.params;
      const vel = Math.max(0, Math.min(1, velocity / 127));
      const freq = midiNoteToFrequency(note);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.clampCutoff(this.params.filterCutoff), now);
      filter.Q.setValueAtTime(Math.max(0.0001, this.params.filterResonance), now);

      const amp = this.ctx.createGain();
      // ADSR attack -> decay -> sustain. Peak scaled by velocity.
      const peak = Math.max(0.0001, vel);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
      amp.gain.linearRampToValueAtTime(
        Math.max(0.0001, peak * sustain),
        now + Math.max(0.001, attack) + Math.max(0.001, decay),
      );

      filter.connect(amp);
      amp.connect(this.output);

      const oscillators: OscillatorNode[] = [];
      const makeOsc = (cents: number) => {
        const osc = this.ctx.createOscillator();
        osc.type = waveform;
        osc.frequency.setValueAtTime(freq, now);
        if (cents) osc.detune.setValueAtTime(cents, now);
        osc.connect(filter);
        osc.start(now);
        oscillators.push(osc);
      };
      makeOsc(0);
      // Optional second, detuned oscillator for a fuller sound.
      if (detune > 0) {
        makeOsc(detune);
        makeOsc(-detune);
      }

      this.voices.set(note, { oscillators, filter, amp, note, startedAt: now, releaseTimer: null });
    } catch {
      // Never let a single failed note break the host UI.
    }
  }

  /** Release a note through the envelope release stage, then clean it up. */
  noteOff(note: number): void {
    if (this.destroyed) return;
    const voice = this.voices.get(note);
    if (!voice) return;
    try {
      const now = this.ctx.currentTime;
      const release = Math.max(0.005, this.params.release);
      const g = voice.amp.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(0.0001, now + release);

      for (const osc of voice.oscillators) {
        try { osc.stop(now + release + 0.02); } catch { /* already stopped */ }
      }

      // Remove from the active map immediately so the same note can retrigger,
      // and disconnect the nodes shortly after the release tail finishes.
      this.voices.delete(note);
      voice.releaseTimer = window.setTimeout(() => {
        this.disconnectVoice(voice);
      }, (release + 0.05) * 1000);
    } catch {
      this.hardStopVoice(note);
    }
  }

  /** Immediately silence + tear down a voice (used for stealing / panic). */
  private hardStopVoice(note: number): void {
    const voice = this.voices.get(note);
    if (!voice) return;
    this.voices.delete(note);
    if (voice.releaseTimer !== null) { clearTimeout(voice.releaseTimer); voice.releaseTimer = null; }
    try {
      const now = this.ctx.currentTime;
      voice.amp.gain.cancelScheduledValues(now);
      voice.amp.gain.setValueAtTime(0.0001, now);
    } catch { /* ignore */ }
    for (const osc of voice.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.disconnectVoice(voice);
  }

  private disconnectVoice(voice: SynthVoice): void {
    for (const osc of voice.oscillators) {
      try { osc.disconnect(); } catch { /* ignore */ }
    }
    try { voice.filter.disconnect(); } catch { /* ignore */ }
    try { voice.amp.disconnect(); } catch { /* ignore */ }
  }

  /** Stop every sounding voice immediately (panic / transport stop). */
  allNotesOff(): void {
    for (const note of Array.from(this.voices.keys())) {
      this.hardStopVoice(note);
    }
  }

  /**
   * Play a single note for a fixed duration (used for piano-roll / keyboard
   * previews). Returns a function that stops it early if needed.
   */
  playNoteFor(note: number, velocity: number, durationSec: number): () => void {
    this.noteOn(note, velocity);
    const timer = window.setTimeout(() => this.noteOff(note), Math.max(30, durationSec * 1000));
    return () => { clearTimeout(timer); this.noteOff(note); };
  }

  /** Tear down the synth and release all audio nodes. */
  destroy(): void {
    if (this.destroyed) return;
    this.allNotesOff();
    this.destroyed = true;
    try { this.output.disconnect(); } catch { /* ignore */ }
  }
}
