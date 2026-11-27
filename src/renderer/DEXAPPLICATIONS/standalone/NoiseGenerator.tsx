/**
 * DEX Platform - Noise Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Ambient sound generator for focus (white/pink/brown noise, rain, waves, cafe, nature)
 *
 * All layers are synthesized live with the Web Audio API and can be mixed
 * simultaneously. Each layer owns its own gain node feeding a shared master
 * gain so per-layer and master volume are independent. Presets (named sets of
 * enabled layers + volumes) persist to localStorage. The sleep timer ramps the
 * master gain to silence over a few seconds before stopping.
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { useRunningApps } from '../../store/runningApps';
import { formatClock } from '../../../shared/format/units';

/** Line glyph per sound (was a two-letter code like "WN"). */
const GLYPHS: Record<string, React.ReactNode> = {
  white: <path d="M3 12h1M6 8v8M9 5v14M12 9v6M15 4v16M18 7v10M21 12h0" />,
  pink: <path d="M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-3 5-1" />,
  brown: <path d="M2 14c3-4 6-4 9 0s6 4 9 0M2 18c3-2 6-2 9 0s6 2 9 0" />,
  rain: <><path d="M20 15.5A4.5 4.5 0 0 0 17.5 7a6 6 0 0 0-11.4 1.6A4 4 0 0 0 7 16.5" /><path d="M8 19v2M12 17v3M16 19v2" /></>,
  waves: <path d="M2 7c2 2 4 2 6 0s4-2 6 0 4 2 6 0M2 12c2 2 4 2 6 0s4-2 6 0 4 2 6 0M2 17c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />,
  wind: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />,
  fire: <path d="M12 3c1 3 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z" />,
  stream: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  cafe: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" /><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" /></>,
};
const NoiseGlyph: React.FC<{ id: string; size?: number }> = ({ id, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {GLYPHS[id] ?? GLYPHS.white}
  </svg>
);
const EQ_CSS = `
.dex-noise-eq { display: flex; align-items: flex-end; gap: 5px; height: 48px; }
.dex-noise-eq span { width: 6px; border-radius: 9999px; background: currentColor; height: 30%; }
.dex-noise-eq[data-on] span { animation: dexNoiseEq 1.1s ease-in-out infinite; }
.dex-noise-eq[data-on] span:nth-child(2) { animation-delay: -0.3s; } .dex-noise-eq[data-on] span:nth-child(3) { animation-delay: -0.7s; }
.dex-noise-eq[data-on] span:nth-child(4) { animation-delay: -0.15s; } .dex-noise-eq[data-on] span:nth-child(5) { animation-delay: -0.5s; }
@keyframes dexNoiseEq { 0%, 100% { height: 25%; } 50% { height: 100%; } }
@media (prefers-reduced-motion: reduce) { .dex-noise-eq[data-on] span { animation: none; height: 70%; } }
`;

interface LayerDef {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const LAYERS: LayerDef[] = [
  { id: 'white', label: 'White Noise', icon: 'WN', color: '#e8e8e8' },
  { id: 'pink', label: 'Pink Noise', icon: 'PN', color: '#ff91a4' },
  { id: 'brown', label: 'Brown Noise', icon: 'BN', color: '#a0522d' },
  { id: 'rain', label: 'Rain', icon: 'RN', color: '#4a90d9' },
  { id: 'waves', label: 'Ocean Waves', icon: 'OC', color: '#0077be' },
  { id: 'wind', label: 'Wind', icon: 'WD', color: '#87ceeb' },
  { id: 'fire', label: 'Fireplace', icon: 'FI', color: '#ff6b35' },
  { id: 'stream', label: 'Stream', icon: 'SM', color: '#5f9ea0' },
  { id: 'cafe', label: 'Café', icon: 'CF', color: '#d2691e' },
];

const STORAGE_KEY = 'dex.noise.presets.v1';
const STATE_KEY = 'dex.noise.state.v1';
const FADE_SECONDS = 4;

interface SavedPreset {
  id: string;
  name: string;
  layers: Record<string, number>; // layerId -> volume (0..1)
}

/** A live audio layer: its sources, its dedicated gain, and any modulation oscillators/timers. */
interface LiveLayer {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  extra: AudioNode[];
  timers: ReturnType<typeof setInterval>[];
}

// ---------------------------------------------------------------------------
// Noise buffer generation
// ---------------------------------------------------------------------------

/** White / pink / brown noise filled into a reusable looping buffer. */
function fillNoise(data: Float32Array, type: 'white' | 'pink' | 'brown'): void {
  const len = data.length;
  if (type === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // brown
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
}

function makeNoiseBuffer(ctx: AudioContext, type: 'white' | 'pink' | 'brown', seconds = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  fillNoise(buffer.getChannelData(0), type);
  return buffer;
}

const NoiseGenerator: React.FC = () => {
  // -- persisted UI state -------------------------------------------------
  const [activeMix, setActiveMix] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.layers === 'object' && parsed.layers) return parsed.layers;
      }
    } catch { /* ignore corrupt state */ }
    return { white: 0.5 };
  });
  const [volume, setVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const v = JSON.parse(raw)?.master;
        if (typeof v === 'number' && v >= 0 && v <= 1) return v;
      }
    } catch { /* ignore */ }
    return 0.5;
  });
  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(p => p && p.id && p.name && p.layers);
      }
    } catch { /* ignore */ }
    return [];
  });

  const [playing, setPlaying] = useState(false);
  const [timer, setTimer] = useState(0); // minutes, 0 = no timer
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [presetName, setPresetName] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const layersRef = useRef<Record<string, LiveLayer>>({});
  const noiseCacheRef = useRef<Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>>>({});
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);

  // -- persist UI state ---------------------------------------------------
  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ layers: activeMix, master: volume }));
    } catch { /* storage may be full/blocked */ }
  }, [activeMix, volume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch { /* ignore */ }
  }, [presets]);

  // -----------------------------------------------------------------------
  // Audio context + master bus
  // -----------------------------------------------------------------------
  const ensureContext = useCallback((): { ctx: AudioContext; master: GainNode } | null => {
    try {
      if (!audioCtxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* ignore */ });
      if (!masterRef.current) {
        const master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        masterRef.current = master;
      }
      return { ctx, master: masterRef.current };
    } catch {
      return null;
    }
  }, [volume]);

  const getNoise = useCallback((ctx: AudioContext, type: 'white' | 'pink' | 'brown'): AudioBuffer => {
    let buf = noiseCacheRef.current[type];
    if (!buf) {
      buf = makeNoiseBuffer(ctx, type);
      noiseCacheRef.current[type] = buf;
    }
    return buf;
  }, []);

  /** Looping noise source feeding `dest`. */
  const noiseSource = useCallback((ctx: AudioContext, type: 'white' | 'pink' | 'brown', dest: AudioNode): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx, type);
    src.loop = true;
    src.connect(dest);
    return src;
  }, [getNoise]);

  // -----------------------------------------------------------------------
  // Per-layer synthesis. Each builder wires nodes, starts sources, and returns
  // a LiveLayer whose `gain` is already connected to master.
  // -----------------------------------------------------------------------
  const buildLayer = useCallback((ctx: AudioContext, master: GainNode, id: string, vol: number): LiveLayer | null => {
    try {
      const gain = ctx.createGain();
      gain.gain.value = vol;
      gain.connect(master);

      const sources: AudioScheduledSourceNode[] = [];
      const extra: AudioNode[] = [];
      const timers: ReturnType<typeof setInterval>[] = [];

      const start = (n: AudioScheduledSourceNode) => { n.start(); sources.push(n); };

      switch (id) {
        case 'white':
        case 'pink':
        case 'brown': {
          start(noiseSource(ctx, id, gain));
          break;
        }
        case 'rain': {
          // Bright filtered noise = hiss, plus randomized droplet bursts.
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 1000;
          const hiss = ctx.createGain();
          hiss.gain.value = 0.5;
          hp.connect(hiss).connect(gain);
          start(noiseSource(ctx, 'white', hp));
          extra.push(hp, hiss);

          // Droplets: short band-passed noise envelopes scheduled randomly.
          const dropBuf = getNoise(ctx, 'white');
          const scheduleDrops = () => {
            const now = ctx.currentTime;
            const count = 4 + Math.floor(Math.random() * 6);
            for (let i = 0; i < count; i++) {
              const at = now + Math.random() * 0.25;
              const ds = ctx.createBufferSource();
              ds.buffer = dropBuf;
              ds.loop = true;
              const bp = ctx.createBiquadFilter();
              bp.type = 'bandpass';
              bp.frequency.value = 1500 + Math.random() * 4000;
              bp.Q.value = 2 + Math.random() * 4;
              const env = ctx.createGain();
              env.gain.setValueAtTime(0, at);
              env.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.12, at + 0.004);
              env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + Math.random() * 0.06);
              ds.connect(bp).connect(env).connect(gain);
              ds.start(at);
              ds.stop(at + 0.2);
              ds.onended = () => { try { bp.disconnect(); env.disconnect(); } catch { /* */ } };
            }
          };
          scheduleDrops();
          timers.push(setInterval(scheduleDrops, 250));
          break;
        }
        case 'waves': {
          // Brown/pink noise through a lowpass whose cutoff + a gain LFO swell
          // and recede like surf.
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 600;
          const swell = ctx.createGain();
          swell.gain.value = 0.2;
          lp.connect(swell).connect(gain);
          start(noiseSource(ctx, 'brown', lp));

          // Slow LFO modulating swell gain (amplitude) for the wash.
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.08;
          const lfoDepth = ctx.createGain();
          lfoDepth.gain.value = 0.16;
          lfo.connect(lfoDepth).connect(swell.gain);
          start(lfo);

          // Second slower LFO sweeping the lowpass cutoff for motion.
          const lfo2 = ctx.createOscillator();
          lfo2.frequency.value = 0.05;
          const lfo2Depth = ctx.createGain();
          lfo2Depth.gain.value = 300;
          lfo2.connect(lfo2Depth).connect(lp.frequency);
          start(lfo2);
          extra.push(lp, swell, lfoDepth, lfo2Depth);
          break;
        }
        case 'wind': {
          // Lowpassed noise with an LFO sweeping the cutoff = gusts.
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 500;
          lp.Q.value = 4;
          const g = ctx.createGain();
          g.gain.value = 0.35;
          lp.connect(g).connect(gain);
          start(noiseSource(ctx, 'pink', lp));

          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.12;
          const depth = ctx.createGain();
          depth.gain.value = 350;
          lfo.connect(depth).connect(lp.frequency);
          start(lfo);
          extra.push(lp, g, depth);
          break;
        }
        case 'fire': {
          // Low rumble + randomized crackle pops.
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 380;
          const rumble = ctx.createGain();
          rumble.gain.value = 0.28;
          lp.connect(rumble).connect(gain);
          start(noiseSource(ctx, 'brown', lp));
          extra.push(lp, rumble);

          const crackBuf = getNoise(ctx, 'white');
          const scheduleCracks = () => {
            const now = ctx.currentTime;
            const count = 1 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
              const at = now + Math.random() * 0.4;
              const cs = ctx.createBufferSource();
              cs.buffer = crackBuf;
              cs.loop = true;
              const hp = ctx.createBiquadFilter();
              hp.type = 'highpass';
              hp.frequency.value = 1500 + Math.random() * 2000;
              const env = ctx.createGain();
              env.gain.setValueAtTime(0, at);
              env.gain.linearRampToValueAtTime(0.18 + Math.random() * 0.2, at + 0.002);
              env.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.04);
              cs.connect(hp).connect(env).connect(gain);
              cs.start(at);
              cs.stop(at + 0.15);
              cs.onended = () => { try { hp.disconnect(); env.disconnect(); } catch { /* */ } };
            }
          };
          scheduleCracks();
          timers.push(setInterval(scheduleCracks, 420));
          break;
        }
        case 'stream': {
          // Bubbling water: bandpassed white noise + gentle cutoff wobble.
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1800;
          bp.Q.value = 0.8;
          const g = ctx.createGain();
          g.gain.value = 0.4;
          bp.connect(g).connect(gain);
          start(noiseSource(ctx, 'white', bp));

          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.7;
          const depth = ctx.createGain();
          depth.gain.value = 600;
          lfo.connect(depth).connect(bp.frequency);
          start(lfo);
          extra.push(bp, g, depth);
          break;
        }
        case 'cafe': {
          // Murmur bed (band-passed brown noise around speech band) plus
          // sparse mid clinks for a coffee-shop ambience.
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 500;
          bp.Q.value = 0.6;
          const murmur = ctx.createGain();
          murmur.gain.value = 0.45;
          bp.connect(murmur).connect(gain);
          start(noiseSource(ctx, 'brown', bp));

          // Slow murmur swell.
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.3;
          const depth = ctx.createGain();
          depth.gain.value = 0.12;
          lfo.connect(depth).connect(murmur.gain);
          start(lfo);
          extra.push(bp, murmur, depth);

          // Occasional cup/cutlery clink.
          const clinkBuf = getNoise(ctx, 'white');
          const scheduleClinks = () => {
            if (Math.random() > 0.5) return;
            const at = ctx.currentTime + Math.random() * 0.8;
            const cs = ctx.createBufferSource();
            cs.buffer = clinkBuf;
            cs.loop = true;
            const bpc = ctx.createBiquadFilter();
            bpc.type = 'bandpass';
            bpc.frequency.value = 2500 + Math.random() * 3000;
            bpc.Q.value = 8;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, at);
            env.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.05, at + 0.003);
            env.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 + Math.random() * 0.1);
            cs.connect(bpc).connect(env).connect(gain);
            cs.start(at);
            cs.stop(at + 0.4);
            cs.onended = () => { try { bpc.disconnect(); env.disconnect(); } catch { /* */ } };
          };
          timers.push(setInterval(scheduleClinks, 900));
          break;
        }
        default:
          // Unknown id -> fall back to gentle pink noise so nothing is silent.
          start(noiseSource(ctx, 'pink', gain));
          break;
      }

      return { gain, sources, extra, timers };
    } catch {
      return null;
    }
  }, [noiseSource, getNoise]);

  /** Tear down a single live layer's nodes/timers. */
  const teardownLayer = useCallback((layer: LiveLayer) => {
    layer.timers.forEach(t => clearInterval(t));
    layer.sources.forEach(s => { try { s.stop(); } catch { /* already stopped */ } try { s.disconnect(); } catch { /* */ } });
    layer.extra.forEach(n => { try { n.disconnect(); } catch { /* */ } });
    try { layer.gain.disconnect(); } catch { /* */ }
  }, []);

  const stopLayer = useCallback((id: string) => {
    const layer = layersRef.current[id];
    if (layer) {
      teardownLayer(layer);
      delete layersRef.current[id];
    }
  }, [teardownLayer]);

  const startLayer = useCallback((id: string, vol: number) => {
    const ctxBundle = ensureContext();
    if (!ctxBundle) return;
    stopLayer(id);
    const layer = buildLayer(ctxBundle.ctx, ctxBundle.master, id, vol);
    if (layer) layersRef.current[id] = layer;
  }, [ensureContext, stopLayer, buildLayer]);

  const stopAllLayers = useCallback(() => {
    Object.keys(layersRef.current).forEach(stopLayer);
  }, [stopLayer]);

  // -----------------------------------------------------------------------
  // Transport
  // -----------------------------------------------------------------------
  const clearTimers = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (fadeTimeoutRef.current) { clearTimeout(fadeTimeoutRef.current); fadeTimeoutRef.current = null; }
  }, []);

  const hardStop = useCallback(() => {
    clearTimers();
    stopAllLayers();
    // Reset master gain back to its set volume for the next play.
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(volume, ctx.currentTime);
      } catch { /* */ }
    }
    setTimeLeft(0);
    setPlaying(false);
    playingRef.current = false;
  }, [clearTimers, stopAllLayers, volume]);

  useEffect(() => useRunningApps.subscribe((state, previous) => {
    if (playingRef.current && previous.runningApps.some(app => app.id === 'noisegenerator') &&
        !state.runningApps.some(app => app.id === 'noisegenerator')) hardStop();
  }), [hardStop]);

  const start = useCallback(() => {
    const bundle = ensureContext();
    if (!bundle) return;
    const { ctx, master } = bundle;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(volume, ctx.currentTime);
    } catch { /* */ }
    const enabled = Object.entries(activeMix).filter(([, v]) => v > 0);
    if (enabled.length === 0) return; // nothing to play
    enabled.forEach(([id, v]) => startLayer(id, v));
    setPlaying(true);
    playingRef.current = true;
    setTimeLeft(timer > 0 ? timer * 60 : 0);
  }, [ensureContext, volume, activeMix, startLayer, timer]);

  /** Fade master to silence over FADE_SECONDS, then hard stop. */
  const fadeOutAndStop = useCallback(() => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    if (ctx && master) {
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.0001, now + FADE_SECONDS);
      } catch { /* */ }
    }
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    fadeTimeoutRef.current = setTimeout(() => { hardStop(); }, FADE_SECONDS * 1000 + 100);
  }, [hardStop]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) hardStop();
    else start();
  }, [hardStop, start]);

  // -- master volume in real time ----------------------------------------
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    if (ctx && master && playingRef.current) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(volume, ctx.currentTime);
      } catch { master.gain.value = volume; }
    }
  }, [volume]);

  // -- countdown ----------------------------------------------------------
  useEffect(() => {
    if (playing && timeLeft > 0) {
      countdownRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
            fadeOutAndStop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, timeLeft > 0]);

  // -- cleanup on unmount -------------------------------------------------
  useEffect(() => () => {
    clearTimers();
    stopAllLayers();
    if (masterRef.current) { try { masterRef.current.disconnect(); } catch { /* */ } }
    if (audioCtxRef.current) void audioCtxRef.current.close().catch(() => {});
    masterRef.current = null;
    audioCtxRef.current = null;
  }, [clearTimers, stopAllLayers]);

  // -----------------------------------------------------------------------
  // Layer mixing helpers
  // -----------------------------------------------------------------------
  const toggleLayer = useCallback((id: string) => {
    setActiveMix(prev => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
        if (playingRef.current) stopLayer(id);
      } else {
        const vol = 0.5;
        next[id] = vol;
        if (playingRef.current) startLayer(id, vol);
      }
      return next;
    });
  }, [stopLayer, startLayer]);

  const setLayerVolume = useCallback((id: string, vol: number) => {
    setActiveMix(prev => ({ ...prev, [id]: vol }));
    const layer = layersRef.current[id];
    if (playingRef.current && layer) {
      const ctx = audioCtxRef.current;
      try {
        if (ctx) {
          layer.gain.gain.cancelScheduledValues(ctx.currentTime);
          layer.gain.gain.setValueAtTime(vol, ctx.currentTime);
        } else {
          layer.gain.gain.value = vol;
        }
      } catch { layer.gain.gain.value = vol; }
    }
  }, []);

  // -----------------------------------------------------------------------
  // Presets
  // -----------------------------------------------------------------------
  const savePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const layers: Record<string, number> = {};
    Object.entries(activeMix).forEach(([id, v]) => { if (v > 0) layers[id] = v; });
    if (Object.keys(layers).length === 0) return;
    setPresets(prev => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Replace by name if it already exists.
      const existing = prev.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const entry: SavedPreset = { id, name, layers };
      if (existing >= 0) {
        const copy = prev.slice();
        copy[existing] = { ...entry, id: prev[existing].id };
        return copy;
      }
      return [...prev, entry];
    });
    setPresetName('');
  }, [presetName, activeMix]);

  const loadPreset = useCallback((preset: SavedPreset) => {
    // Restart cleanly from the preset.
    const wasPlaying = playingRef.current;
    if (wasPlaying) { stopAllLayers(); }
    const layers: Record<string, number> = {};
    Object.entries(preset.layers).forEach(([id, v]) => {
      if (LAYERS.some(l => l.id === id) && typeof v === 'number' && v > 0) layers[id] = Math.min(1, Math.max(0, v));
    });
    setActiveMix(layers);
    if (wasPlaying) {
      const bundle = ensureContext();
      if (bundle) {
        try {
          bundle.master.gain.cancelScheduledValues(bundle.ctx.currentTime);
          bundle.master.gain.setValueAtTime(volume, bundle.ctx.currentTime);
        } catch { /* */ }
      }
      Object.entries(layers).forEach(([id, v]) => startLayer(id, v));
    }
  }, [stopAllLayers, ensureContext, startLayer, volume]);

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  // -----------------------------------------------------------------------
  // Shuffle a soundscape
  // -----------------------------------------------------------------------
  const shuffle = useCallback(() => {
    // Pick 2-4 random layers with random volumes.
    const pool = LAYERS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const count = 2 + Math.floor(Math.random() * 3);
    const chosen = pool.slice(0, count);
    const next: Record<string, number> = {};
    chosen.forEach(l => { next[l.id] = Math.round((0.25 + Math.random() * 0.65) * 100) / 100; });

    const wasPlaying = playingRef.current;
    if (wasPlaying) stopAllLayers();
    setActiveMix(next);
    if (wasPlaying) {
      const bundle = ensureContext();
      if (bundle) {
        try {
          bundle.master.gain.cancelScheduledValues(bundle.ctx.currentTime);
          bundle.master.gain.setValueAtTime(volume, bundle.ctx.currentTime);
        } catch { /* */ }
      }
      Object.entries(next).forEach(([id, v]) => startLayer(id, v));
    }
  }, [stopAllLayers, ensureContext, startLayer, volume]);

  const formatTime = (secs: number) => formatClock(secs);

  const activeCount = Object.values(activeMix).filter(v => v > 0).length;

  return (
    <div style={st.container}>
      {/* Main Display */}
      <div className="dex-liquid-glass-strong" style={st.display}>
        <style>{EQ_CSS}</style>
        <div className="dex-noise-eq" data-on={playing || undefined} aria-hidden="true"
          style={{ marginBottom: 'var(--space-2)', color: playing ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
          <span /><span /><span /><span /><span />
        </div>
        <div style={st.presetName}>
          {activeCount === 0 ? 'No layers selected' : `${activeCount} layer${activeCount > 1 ? 's' : ''} mixed`}
        </div>
        {timeLeft > 0 && playing && (
          <div style={st.timerDisplay}>{formatTime(timeLeft)}</div>
        )}
      </div>

      {/* Transport */}
      <div style={st.transport}>
        <button
          className="dex-liquid-glass"
          style={st.shuffleBtn}
          onClick={shuffle}
          aria-label="Shuffle soundscape"
          title="Shuffle a soundscape"
        >
          <DexIcon name="shuffle" size={16} />
        </button>
        <button
          style={{ ...st.playBtn, background: playing ? 'var(--color-error)' : 'var(--color-accent-fill)' }}
          onClick={togglePlay}
          aria-label={playing ? 'Stop' : 'Play'}
          disabled={!playing && activeCount === 0}
        >
          {playing ? <DexIcon name="square" size={16} /> : <DexIcon name="play" size={16} />}
        </button>
      </div>

      {/* Master Volume */}
      <div style={st.volumeRow}>
        <span style={st.volumeIcon}><DexIcon name="volume-1" size={16} /></span>
        <input
          type="range" min="0" max="1" step="0.01" value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={st.slider}
          aria-label="Master volume"
          aria-valuetext={`${Math.round(volume * 100)} percent`}
        />
        <span style={st.volumeIcon}><DexIcon name="volume-2" size={16} /></span>
      </div>

      {/* Sleep Timer */}
      <div style={st.timerRow}>
        <span style={st.timerLabel}>Sleep Timer</span>
        <div style={st.timerOptions}>
          {[0, 15, 30, 60, 90, 120].map(m => (
            <button
              key={m}
              style={{ ...st.timerBtn, background: timer === m ? 'var(--color-accent-light, rgba(10,132,255,0.25))' : 'transparent', color: timer === m ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
              onClick={() => {
                setTimer(m);
                if (playingRef.current) setTimeLeft(m > 0 ? m * 60 : 0);
              }}
              aria-label={m === 0 ? 'No timer' : `${m} minutes`}
              aria-pressed={timer === m}
            >
              {m === 0 ? 'Off' : `${m}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div style={st.presetSection}>
        <div style={st.presetSaveRow}>
          <input
            type="text"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') savePreset(); }}
            placeholder="Preset name..."
            className="dex-liquid-glass"
            style={st.presetInput}
            aria-label="Preset name"
          />
          <button
            style={st.savePresetBtn}
            onClick={savePreset}
            disabled={!presetName.trim() || activeCount === 0}
            aria-label="Save preset"
          >
            Save
          </button>
        </div>
        {presets.length > 0 && (
          <div style={st.presetChips}>
            {presets.map(p => (
              <div key={p.id} className="dex-liquid-glass" style={st.presetChip}>
                <button
                  style={st.presetChipLoad}
                  onClick={() => loadPreset(p)}
                  aria-label={`Load preset ${p.name}`}
                  title={Object.keys(p.layers).join(', ')}
                >
                  {p.name}
                </button>
                <button
                  style={st.presetChipDel}
                  onClick={() => deletePreset(p.id)}
                  aria-label={`Delete preset ${p.name}`}
                >
                  <DexIcon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Layer Grid */}
      <div style={st.presetGrid}>
        {LAYERS.map(l => {
          const isActive = activeMix[l.id] !== undefined;
          return (
            <div key={l.id} style={st.presetCard}>
              <button
                style={{
                  ...st.presetBtn,
                  background: isActive ? `${l.color}20` : 'var(--color-border-subtle)',
                  borderColor: isActive ? l.color : 'var(--color-bg-hover)',
                }}
                onClick={() => toggleLayer(l.id)}
                aria-label={l.label}
                aria-pressed={isActive}
              >
                <span style={{ display: 'flex', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}><NoiseGlyph id={l.id} /></span>
                {/* Label stays theme text (White Noise's #e8e8e8 vanished on light); the border carries the layer colour. */}
                <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{l.label}</span>
              </button>
              {isActive && (
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={activeMix[l.id]}
                  onChange={e => setLayerVolume(l.id, parseFloat(e.target.value))}
                  style={{ ...st.slider, width: '100%', marginTop: 4, accentColor: l.color }}
                  aria-label={`${l.label} volume`}
                  aria-valuetext={`${Math.round((activeMix[l.id] ?? 0) * 100)} percent`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const st: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto', alignItems: 'center',
  },
  display: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 'var(--space-6) var(--space-8) var(--space-4)', flexShrink: 0,
    borderRadius: 14, marginTop: 'var(--space-4)',
  },
  presetName: { fontSize: 16, fontWeight: 600 },
  timerDisplay: {
    fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)',
    fontVariantNumeric: 'tabular-nums',
  },
  transport: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-4)',
    padding: '0 var(--space-5) var(--space-4)',
  },
  shuffleBtn: {
    width: 40, height: 40, borderRadius: '50%',
    color: 'var(--color-text-primary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    width: 56, height: 56, borderRadius: '50%', border: 'none',
    color: 'var(--color-accent-text, #fff)', fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  volumeRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 var(--space-8) var(--space-4)', width: '100%', maxWidth: 400,
  },
  volumeIcon: { fontSize: 14 },
  slider: {
    flex: 1, height: 4, WebkitAppearance: 'none' as any,
    background: 'var(--color-border)', borderRadius: 2, outline: 'none',
    cursor: 'pointer', accentColor: 'var(--color-accent)',
  },
  timerRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: '0 var(--space-5) var(--space-4)', width: '100%', maxWidth: 400,
  },
  timerLabel: { fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  timerOptions: { display: 'flex', gap: 4 },
  timerBtn: {
    padding: '4px var(--space-2)', borderRadius: 10, border: 'none',
    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  presetSection: {
    width: '100%', maxWidth: 500, padding: '0 var(--space-5) var(--space-4)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  presetSaveRow: { display: 'flex', gap: 'var(--space-2)' },
  presetInput: {
    flex: 1, padding: '6px var(--space-3)', borderRadius: 10,
    color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'var(--font-family)', outline: 'none',
  },
  savePresetBtn: {
    padding: '6px var(--space-4)', borderRadius: 10, border: 'none',
    background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  presetChips: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  presetChip: {
    display: 'flex', alignItems: 'center', borderRadius: 10, overflow: 'hidden',
  },
  presetChipLoad: {
    padding: '4px var(--space-3)', border: 'none', background: 'transparent',
    color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  presetChipDel: {
    padding: '4px 6px', border: 'none', background: 'transparent',
    color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  presetGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 'var(--space-2)', padding: '0 var(--space-5) var(--space-5)', width: '100%', maxWidth: 500,
  },
  presetCard: {
    display: 'flex', flexDirection: 'column',
  },
  presetBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '14px var(--space-2)', borderRadius: 18, cursor: 'pointer',
    border: '1px solid', fontFamily: 'var(--font-family)',
    transition: 'all 0.15s',
  },
};

export default memo(NoiseGenerator);
