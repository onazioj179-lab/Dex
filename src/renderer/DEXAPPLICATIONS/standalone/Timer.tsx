/**
 * DEX Platform - Timer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Simple countdown timer with presets
 */
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';

interface TimerPreset {
  label: string;
  seconds: number;
}

const PRESETS: TimerPreset[] = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '25 min', seconds: 1500 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1 hour', seconds: 3600 },
];

const Timer: React.FC = () => {
  const [totalSeconds, setTotalSeconds] = useState(300); // 5 min default
  const [remaining, setRemaining] = useState(300);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [customMin, setCustomMin] = useState(5);
  const [customSec, setCustomSec] = useState(0);
  const [showCustom, setShowCustom] = useState(false);
  // Persisted user presets (v6 Track G): the built-in quick timers are fixed; let
  // users save their own custom durations and reuse them across sessions.
  const [customPresets, setCustomPresets] = useState<TimerPreset[]>(() => {
    try { const raw = localStorage.getItem('dex-timer-presets'); const p = raw ? JSON.parse(raw) : null; if (Array.isArray(p)) return p; } catch { /* ignore */ }
    return [];
  });
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // Format time as MM:SS or HH:MM:SS
  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;

  // Play completion sound
  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (err) {
      console.warn('[Timer] Audio not available');
    }
  }, []);

  // Timer tick
  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = window.setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setIsRunning(false);
            setIsComplete(true);
            playSound();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, playSound]);

  const start = () => {
    if (remaining > 0) {
      setIsRunning(true);
      setIsComplete(false);
    }
  };

  const pause = () => {
    setIsRunning(false);
  };

  const reset = () => {
    setIsRunning(false);
    setRemaining(totalSeconds);
    setIsComplete(false);
  };

  const selectPreset = (preset: TimerPreset) => {
    setTotalSeconds(preset.seconds);
    setRemaining(preset.seconds);
    setIsRunning(false);
    setIsComplete(false);
  };

  const setCustomTime = () => {
    const secs = customMin * 60 + customSec;
    if (secs > 0) {
      setTotalSeconds(secs);
      setRemaining(secs);
      setIsRunning(false);
      setIsComplete(false);
      setShowCustom(false);
    }
  };

  // Persist user presets whenever they change.
  useEffect(() => {
    try { localStorage.setItem('dex-timer-presets', JSON.stringify(customPresets)); } catch { /* ignore */ }
  }, [customPresets]);

  const saveCustomPreset = useCallback(() => {
    const seconds = customMin * 60 + customSec;
    if (seconds <= 0) return;
    const label = customMin > 0 ? (customSec > 0 ? `${customMin}m ${customSec}s` : `${customMin} min`) : `${customSec} sec`;
    setCustomPresets(prev => (prev.some(p => p.seconds === seconds) ? prev : [...prev, { label, seconds }].slice(-12)));
  }, [customMin, customSec]);

  const removeCustomPreset = useCallback((seconds: number) => {
    setCustomPresets(prev => prev.filter(p => p.seconds !== seconds));
  }, []);

  // Circular progress
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div style={s.container}>
      {/* Timer Display */}
      <div style={s.timerSection}>
        <div style={s.circleContainer}>
          <svg width="280" height="280" style={{ transform: 'rotate(-90deg)' }}>
            {/* Background circle */}
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              stroke={isComplete ? 'var(--color-success, #30D158)' : 'var(--color-accent)'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.18s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div style={s.timeDisplay}>
            <span style={{ ...s.time, color: isComplete ? 'var(--color-success, #30D158)' : 'var(--color-text-primary)' }}>
              {formatTime(remaining)}
            </span>
            {isComplete && <span style={s.completeText}>Complete!</span>}
          </div>
        </div>

        {/* Controls */}
        <div style={s.controls}>
          {!isRunning ? (
            <button style={{...s.primaryBtn, opacity: remaining === 0 ? 0.4 : 1, cursor: remaining === 0 ? 'not-allowed' : 'pointer'}} onClick={start} disabled={remaining === 0}>
              <DexIcon name="play" size={24} />
              Start
            </button>
          ) : (
            <button style={{ ...s.primaryBtn, background: 'var(--color-warning, #FF9500)' }} onClick={pause}>
              <DexIcon name="pause" size={24} />
              Pause
            </button>
          )}
          <button style={s.secondaryBtn} onClick={reset}>
            <DexIcon name="refresh" size={18} />
            Reset
          </button>
        </div>
      </div>

      {/* Presets */}
      <div style={s.presetsSection}>
        <div style={s.presetsHeader}>
          <span className="dex-label-caps">Quick Timers</span>
          <button
            style={{ ...s.customToggle, background: showCustom ? 'var(--color-accent)' : 'transparent', color: showCustom ? 'var(--color-text-inverse, #fff)' : 'var(--color-text-secondary)' }}
            onClick={() => setShowCustom(!showCustom)}
          >
            Custom
          </button>
        </div>

        {showCustom ? (
          <div style={s.customInput}>
            <div style={s.inputGroup}>
              <input
                type="number"
                min={0}
                max={99}
                value={customMin}
                onChange={e => setCustomMin(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                style={s.numInput}
              />
              <span style={s.inputLabel}>min</span>
            </div>
            <span style={s.inputColon}>:</span>
            <div style={s.inputGroup}>
              <input
                type="number"
                min={0}
                max={59}
                value={customSec}
                onChange={e => setCustomSec(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                style={s.numInput}
              />
              <span style={s.inputLabel}>sec</span>
            </div>
            <button style={s.setBtn} onClick={setCustomTime}>
              Set
            </button>
            <button style={s.setBtn} onClick={saveCustomPreset} title="Save as a reusable quick timer">
              Save
            </button>
          </div>
        ) : (
          <div style={s.presetsGrid}>
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                style={{
                  ...s.presetBtn,
                  background: totalSeconds === preset.seconds ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  color: totalSeconds === preset.seconds ? 'var(--color-text-inverse, #fff)' : 'var(--color-text-primary)',
                }}
                onClick={() => selectPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
            {customPresets.map(preset => (
              <button
                key={`custom-${preset.seconds}`}
                style={{
                  ...s.presetBtn,
                  background: totalSeconds === preset.seconds ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                  color: totalSeconds === preset.seconds ? 'var(--color-text-inverse, #fff)' : 'var(--color-text-primary)',
                  border: '1px dashed var(--color-border-strong, var(--color-border))',
                }}
                onClick={() => selectPreset(preset)}
                onContextMenu={(e) => { e.preventDefault(); removeCustomPreset(preset.seconds); }}
                title="Saved timer — right-click to remove"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
    padding: 'var(--space-5)',
    overflow: 'auto',
  },
  timerSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-6)',
    paddingBottom: 'var(--space-5)',
  },
  circleContainer: {
    position: 'relative',
    width: 280,
    height: 280,
  },
  timeDisplay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  time: {
    fontSize: 48,
    fontWeight: 300,
    fontFamily: 'var(--font-mono)',
    letterSpacing: 0,
  },
  completeText: {
    display: 'block',
    fontSize: 14,
    color: 'var(--color-success, #30D158)',
    fontWeight: 600,
    marginTop: 4,
  },
  controls: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'center',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-8)',
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse, #fff)',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px var(--space-5)',
    background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  presetsSection: {
    borderTop: '1px solid var(--color-border)',
    paddingTop: 'var(--space-5)',
  },
  presetsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-3)',
  },
  customToggle: {
    padding: '6px var(--space-3)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presetsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-2)',
  },
  presetBtn: {
    padding: 'var(--space-3) var(--space-4)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  customInput: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  numInput: {
    width: 60,
    padding: '10px var(--space-2)',
    fontSize: 24,
    fontWeight: 600,
    textAlign: 'center',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  inputLabel: {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    marginTop: 4,
  },
  inputColon: {
    fontSize: 24,
    color: 'var(--color-text-tertiary)',
    marginBottom: 18,
  },
  setBtn: {
    padding: '10px var(--space-5)',
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse, #fff)',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 'var(--space-2)',
  },
};

export default memo(Timer);
