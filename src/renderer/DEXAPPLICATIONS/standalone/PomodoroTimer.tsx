/**
 * DEX Platform - Pomodoro Timer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Focus timer with work/break cycles (25/5/15 min)
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';

type Phase = 'work' | 'shortBreak' | 'longBreak';

const PHASE_DURATIONS: Record<Phase, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const PHASE_LABELS: Record<Phase, string> = {
  work: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

const PHASE_COLORS: Record<Phase, string> = {
  work: 'var(--color-error)',
  shortBreak: 'var(--color-success)',
  longBreak: '#5E5CE6',
};

const PomodoroTimer: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('work');
  const [remaining, setRemaining] = useState(PHASE_DURATIONS.work);
  const [running, setRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const totalDuration = PHASE_DURATIONS[phase];
  const progress = 1 - remaining / totalDuration;
  const accentColor = PHASE_COLORS[phase];

  const advancePhase = useCallback(() => {
    if (phase === 'work') {
      const newCount = completedSessions + 1;
      setCompletedSessions(newCount);
      const nextPhase: Phase = newCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      setPhase(nextPhase);
      setRemaining(PHASE_DURATIONS[nextPhase]);
    } else {
      setPhase('work');
      setRemaining(PHASE_DURATIONS.work);
    }
    setRunning(false);
  }, [phase, completedSessions]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          advancePhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, advancePhase]);

  const toggle = useCallback(() => setRunning(r => !r), []);

  const skip = useCallback(() => {
    clearInterval(intervalRef.current);
    advancePhase();
  }, [advancePhase]);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setRemaining(PHASE_DURATIONS[phase]);
  }, [phase]);

  const fmtTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const circleR = 100;
  const circleC = 2 * Math.PI * circleR;
  const strokeDash = circleC * progress;

  return (
    <div style={s.container}>
      {/* Phase selector */}
      <div style={s.phaseTabs}>
        {(['work', 'shortBreak', 'longBreak'] as Phase[]).map(p => (
          <button
            key={p}
            onClick={() => {
              clearInterval(intervalRef.current);
              setPhase(p);
              setRemaining(PHASE_DURATIONS[p]);
              setRunning(false);
            }}
            style={{
              ...s.phaseTab,
              ...(p === phase ? { background: accentColor + '22', color: accentColor } : {}),
            }}
          >
            {PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Timer circle */}
      <div style={s.timerArea}>
        <div style={s.circleWrap}>
          <svg width="240" height="240" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r={circleR} fill="none"
              stroke="var(--color-border-subtle)" strokeWidth="6" />
            <circle cx="120" cy="120" r={circleR} fill="none"
              stroke={accentColor} strokeWidth="6"
              strokeDasharray={`${strokeDash} ${circleC}`}
              strokeLinecap="round"
              transform="rotate(-90 120 120)"
              style={{ transition: 'stroke-dasharray 0.18s cubic-bezier(0.4,0,0.2,1)' }} />
          </svg>
          <div style={s.timerText}>
            <div style={{ fontSize: 48, fontWeight: 200, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtTime(remaining)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 500, marginTop: 4 }}>
              {PHASE_LABELS[phase]}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <button onClick={reset} style={s.secondaryBtn} title="Reset">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
          </svg>
        </button>
        <button
          onClick={toggle}
          style={{ ...s.primaryBtn, background: accentColor }}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={skip} style={s.secondaryBtn} title="Skip">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>
      </div>

      {/* Session counter */}
      <div style={s.sessionInfo}>
        <div style={s.sessionDots}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < (completedSessions % 4) ? accentColor : 'var(--color-border)',
              transition: 'background 0.18s cubic-bezier(0.4,0,0.2,1)',
            }} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {completedSessions} session{completedSessions !== 1 ? 's' : ''} completed
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
  },
  phaseTabs: {
    display: 'flex', gap: 4, padding: '16px 20px', flexShrink: 0,
  },
  phaseTab: {
    padding: '6px 14px', borderRadius: 6, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  timerArea: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 20px',
  },
  circleWrap: { position: 'relative', width: 240, height: 240 },
  timerText: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '0 20px 20px', flexShrink: 0,
  },
  primaryBtn: {
    width: 120, height: 48, borderRadius: 24, border: 'none',
    color: 'var(--color-text-inverse, #fff)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  secondaryBtn: {
    width: 44, height: 44, borderRadius: '50%', border: 'none',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  sessionInfo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    padding: '0 20px 24px', flexShrink: 0,
  },
  sessionDots: { display: 'flex', gap: 8 },
};

PomodoroTimer.displayName = 'PomodoroTimer';
export default memo(PomodoroTimer);
