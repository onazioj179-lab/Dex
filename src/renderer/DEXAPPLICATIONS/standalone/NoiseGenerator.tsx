/**
 * DEX Platform - Noise Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Ambient sound generator for focus (white/pink/brown noise, rain, nature)
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { formatClock } from '../../../shared/format/units';

interface SoundPreset {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const PRESETS: SoundPreset[] = [
  { id: 'white', label: 'White Noise', icon: 'WN', color: '#e8e8e8' },
  { id: 'pink', label: 'Pink Noise', icon: 'PN', color: '#ff91a4' },
  { id: 'brown', label: 'Brown Noise', icon: 'BN', color: '#a0522d' },
  { id: 'rain', label: 'Rain', icon: 'RN', color: '#4a90d9' },
  { id: 'thunder', label: 'Thunderstorm', icon: 'ST', color: '#6b6b8d' },
  { id: 'wind', label: 'Wind', icon: 'WD', color: '#87ceeb' },
  { id: 'forest', label: 'Forest', icon: 'FR', color: '#228b22' },
  { id: 'fire', label: 'Fireplace', icon: 'FI', color: '#ff6b35' },
  { id: 'ocean', label: 'Ocean Waves', icon: 'OC', color: '#0077be' },
  { id: 'stream', label: 'Stream', icon: 'SM', color: '#5f9ea0' },
  { id: 'birds', label: 'Birds', icon: 'BD', color: '#98fb98' },
  { id: 'cafe', label: 'Caf\u00e9', icon: 'CF', color: '#d2691e' },
];

const NoiseGenerator: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  const [activePreset, setActivePreset] = useState('white');
  const [volume, setVolume] = useState(0.5);
  const [timer, setTimer] = useState(0); // minutes, 0 = no timer
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [mixMode, setMixMode] = useState(false);
  const [activeMix, setActiveMix] = useState<Record<string, number>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Record<string, { source: AudioBufferSourceNode | OscillatorNode; gain: GainNode }>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createNoiseBuffer = useCallback((ctx: AudioContext, type: string): AudioBuffer => {
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

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
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      // Nature-like sounds: filtered noise with amplitude modulation
      let b0 = 0;
      const modFreq = type === 'rain' ? 0.1 : type === 'ocean' ? 0.05 : type === 'wind' ? 0.08 : 0.03;
      const modDepth = type === 'ocean' ? 0.8 : type === 'wind' ? 0.6 : 0.3;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.95 * b0 + w * 0.05;
        const mod = 1 - modDepth + modDepth * Math.sin(2 * Math.PI * modFreq * i / sr);
        data[i] = b0 * mod * 2;
      }
    }
    return buffer;
  }, []);

  const startSound = useCallback((preset: string, vol: number) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => { /* ignore resume errors */ });
    }
    // Stop existing sound for this preset
    if (nodesRef.current[preset]) {
      try { nodesRef.current[preset].source.stop(); } catch { /* already stopped */ }
      try { nodesRef.current[preset].gain.disconnect(); } catch { /* already disconnected */ }
      delete nodesRef.current[preset];
    }

    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(ctx.destination);

    const buffer = createNoiseBuffer(ctx, preset);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();

    nodesRef.current[preset] = { source, gain };
  }, [createNoiseBuffer]);

  const stopSound = useCallback((preset: string) => {
    const node = nodesRef.current[preset];
    if (node) {
      try { node.source.stop(); } catch { /* already stopped */ }
      try { node.gain.disconnect(); } catch { /* already disconnected */ }
      delete nodesRef.current[preset];
    }
  }, []);

  const stopAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    Object.keys(nodesRef.current).forEach(stopSound);
    setTimeLeft(0);
    setPlaying(false);
  }, [stopSound]);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopAll();
    } else {
      if (mixMode) {
        Object.entries(activeMix).forEach(([id, vol]) => {
          if (vol > 0) startSound(id, vol * volume);
        });
      } else {
        startSound(activePreset, volume);
      }
      setPlaying(true);
      setTimeLeft(timer > 0 ? timer * 60 : 0);
    }
  }, [playing, mixMode, activeMix, activePreset, volume, timer, startSound, stopAll]);

  // Update volume in real-time
  useEffect(() => {
    Object.entries(nodesRef.current).forEach(([id, node]) => {
      const targetVol = mixMode ? (activeMix[id] || 0) * volume : volume;
      node.gain.gain.value = targetVol;
    });
  }, [volume, activeMix, mixMode]);

  // Switch preset while playing
  useEffect(() => {
    if (playing && !mixMode) {
      Object.keys(nodesRef.current).forEach(stopSound);
      startSound(activePreset, volume);
    }
  }, [activePreset]);

  // Timer countdown
  useEffect(() => {
    if (playing && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            stopAll();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, timeLeft > 0]);

  // Cleanup on unmount
  useEffect(() => () => {
    Object.keys(nodesRef.current).forEach(k => {
      try { nodesRef.current[k].source.stop(); } catch { /* cleanup */ }
      try { nodesRef.current[k].gain.disconnect(); } catch { /* cleanup */ }
    });
    if (audioCtxRef.current) audioCtxRef.current.close();
  }, []);

  const toggleMixPreset = (id: string) => {
    setActiveMix(prev => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
        if (playing) stopSound(id);
      } else {
        next[id] = 0.5;
        if (playing) startSound(id, 0.5 * volume);
      }
      return next;
    });
  };

  const setMixVolume = (id: string, vol: number) => {
    setActiveMix(prev => ({ ...prev, [id]: vol }));
    if (playing && nodesRef.current[id]) {
      nodesRef.current[id].gain.gain.value = vol * volume;
    }
  };

  const formatTime = (secs: number) => formatClock(secs);

  const currentPreset = PRESETS.find(p => p.id === activePreset)!;

  return (
    <div style={st.container}>
      {/* Main Display */}
      <div style={st.display}>
        <div style={{ fontSize: 64, marginBottom: 'var(--space-2)' }}>
          {mixMode ? 'MX' : currentPreset.icon}
        </div>
        <div style={st.presetName}>{mixMode ? 'Mix Mode' : currentPreset.label}</div>
        {timeLeft > 0 && playing && (
          <div style={st.timerDisplay}>{formatTime(timeLeft)}</div>
        )}
      </div>

      {/* Transport */}
      <div style={st.transport}>
        <button
          style={{ ...st.playBtn, background: playing ? 'var(--color-error)' : 'var(--color-accent)' }}
          onClick={togglePlay}
          aria-label={playing ? 'Stop' : 'Play'}
        >
          {playing ? <DexIcon name="square" size={14} /> : <DexIcon name="play" size={14} />}
        </button>
      </div>

      {/* Volume */}
      <div style={st.volumeRow}>
        <span style={st.volumeIcon}><DexIcon name="volume-2" size={16} /></span>
        <input
          type="range" min="0" max="1" step="0.01" value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={st.slider}
          aria-label="Volume"
        />
        <span style={st.volumeIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></span>
      </div>

      {/* Timer */}
      <div style={st.timerRow}>
        <span style={st.timerLabel}>Sleep Timer</span>
        <div style={st.timerOptions}>
          {[0, 15, 30, 60, 90, 120].map(m => (
            <button
              key={m}
              style={{ ...st.timerBtn, background: timer === m ? 'var(--color-accent-light, rgba(10,132,255,0.25))' : 'transparent', color: timer === m ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
              onClick={() => setTimer(m)}
              aria-label={m === 0 ? 'No timer' : `${m} minutes`}
            >
              {m === 0 ? 'Off' : `${m}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Mix Toggle */}
      <div style={st.mixToggle}>
        <button
          style={{ ...st.mixBtn, background: !mixMode ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : 'transparent', color: !mixMode ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          onClick={() => { setMixMode(false); if (playing) { stopAll(); } }}
        >
          Single
        </button>
        <button
          style={{ ...st.mixBtn, background: mixMode ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : 'transparent', color: mixMode ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          onClick={() => { setMixMode(true); if (playing) { stopAll(); } }}
        >
          Mix
        </button>
      </div>

      {/* Preset Grid */}
      <div style={st.presetGrid}>
        {PRESETS.map(p => {
          const isActive = mixMode ? !!activeMix[p.id] : activePreset === p.id;
          return (
            <div key={p.id} style={st.presetCard}>
              <button
                style={{
                  ...st.presetBtn,
                  background: isActive ? `${p.color}20` : 'var(--color-border-subtle)',
                  borderColor: isActive ? p.color : 'var(--color-bg-hover)',
                }}
                onClick={() => mixMode ? toggleMixPreset(p.id) : setActivePreset(p.id)}
                aria-label={p.label}
                aria-pressed={isActive}
              >
                <span style={{ fontSize: 24 }}>{p.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? p.color : 'var(--color-text-secondary)' }}>{p.label}</span>
              </button>
              {mixMode && activeMix[p.id] !== undefined && (
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={activeMix[p.id] || 0}
                  onChange={e => setMixVolume(p.id, parseFloat(e.target.value))}
                  style={{ ...st.slider, width: '100%', marginTop: 4 }}
                  aria-label={`${p.label} volume`}
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
    padding: 'var(--space-8) var(--space-5) var(--space-4)', flexShrink: 0,
  },
  presetName: { fontSize: 18, fontWeight: 600 },
  timerDisplay: {
    fontSize: 14, color: 'var(--color-accent)', marginTop: 'var(--space-2)',
    fontVariantNumeric: 'tabular-nums',
  },
  transport: {
    display: 'flex', justifyContent: 'center', padding: '0 var(--space-5) var(--space-5)',
  },
  playBtn: {
    width: 56, height: 56, borderRadius: '50%', border: 'none',
    color: 'var(--color-text-inverse, #fff)', fontSize: 20, cursor: 'pointer',
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
    padding: '4px var(--space-2)', borderRadius: 4, border: 'none',
    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  mixToggle: {
    display: 'flex', borderRadius: 6, overflow: 'hidden',
    border: '1px solid var(--color-border, var(--color-border))',
    marginBottom: 'var(--space-4)',
  },
  mixBtn: {
    padding: '6px var(--space-5)', border: 'none', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-family)',
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
    padding: '14px var(--space-2)', borderRadius: 10, cursor: 'pointer',
    border: '1px solid', fontFamily: 'var(--font-family)',
    transition: 'all 0.15s',
  },
};

export default memo(NoiseGenerator);
