/**
 * DEX Platform - Pomodoro Timer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Focus timer with configurable work/break cycles, long-break cadence, a
 * persisted session log + daily focus total, auto-start and skip-break.
 * Shared timer state survives app switches and reload (remaining derived from
 * wall-clock anchors in the timer store, not a React interval).
 */
import React, { useState, useRef, useEffect, memo } from 'react';
import {
  useTimerStore, pomodoroRemaining,
  type PomoPhase,
} from '../../store/timerStore';

const PHASE_LABELS: Record<PomoPhase, string> = {
  work: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

const PHASE_COLORS: Record<PomoPhase, string> = {
  work: 'var(--color-error)',
  shortBreak: 'var(--color-accent)',
  longBreak: 'var(--color-info, #64D2FF)',
};

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtClock(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

const PomodoroTimer: React.FC = () => {
  const pomodoro = useTimerStore(s => s.pomodoro);
  const config = useTimerStore(s => s.pomodoroConfig);
  const log = useTimerStore(s => s.pomodoroLog);
  const startPomodoro = useTimerStore(s => s.startPomodoro);
  const pausePomodoro = useTimerStore(s => s.pausePomodoro);
  const resetPomodoro = useTimerStore(s => s.resetPomodoro);
  const setPhase = useTimerStore(s => s.setPomodoroPhase);
  const advance = useTimerStore(s => s.advancePomodoro);
  const setConfig = useTimerStore(s => s.setPomodoroConfig);
  const tick = useTimerStore(s => s.tickPomodoro);

  const { phase, running, completedSessions } = pomodoro;
  const [showSettings, setShowSettings] = useState(false);

  // Re-render ticker + completion reconciliation. The store derives remaining
  // from wall-clock anchors and fires the toast on completion, so this works
  // even if the phase elapsed while the app was unmounted.
  const [, force] = useState(0);
  const intervalRef = useRef<number>(0);
  useEffect(() => {
    tick();
    intervalRef.current = window.setInterval(() => { tick(); force(n => n + 1); }, 500);
    return () => clearInterval(intervalRef.current);
  }, [tick]);

  const remainingSecs = Math.ceil(pomodoroRemaining(pomodoro, config) / 1000);
  const totalSecs = (phase === 'work' ? config.workMin : phase === 'shortBreak' ? config.shortBreakMin : config.longBreakMin) * 60;
  const progress = totalSecs > 0 ? 1 - remainingSecs / totalSecs : 0;
  const accentColor = PHASE_COLORS[phase];
  const idle = !running && remainingSecs === totalSecs;
  const ringGradId = `pomo-ring-${phase}`;

  const circleR = 110;
  const circleC = 2 * Math.PI * circleR;
  const strokeDash = circleC * Math.min(1, Math.max(0, progress));

  return (
    <div style={s.container}>
      <style>{POMO_CSS}</style>
      {/* Phase selector */}
      <div style={s.phaseTabs}>
        {(['work', 'shortBreak', 'longBreak'] as PomoPhase[]).map(p => (
          <button
            key={p}
            className="pomo-tab"
            onClick={() => setPhase(p)}
            aria-pressed={p === phase}
            style={{ ...s.phaseTab, ...(p === phase ? { background: PHASE_COLORS[p] + '22', color: PHASE_COLORS[p], boxShadow: `inset 0 0 0 1px ${PHASE_COLORS[p]}44` } : {}) }}
          >
            {PHASE_LABELS[p]}
          </button>
        ))}
        <button onClick={() => setShowSettings(v => !v)} className="pomo-tab" style={{ ...s.phaseTab, marginLeft: 'auto', ...(showSettings ? { background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' } : {}) }} title="Settings" aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {showSettings ? (
        <div className="dex-liquid-glass-strong" style={s.settings}>
          <SettingRow label="Focus (min)" value={config.workMin} min={1} max={180} onChange={v => setConfig({ workMin: v })} />
          <SettingRow label="Short break (min)" value={config.shortBreakMin} min={1} max={60} onChange={v => setConfig({ shortBreakMin: v })} />
          <SettingRow label="Long break (min)" value={config.longBreakMin} min={1} max={120} onChange={v => setConfig({ longBreakMin: v })} />
          <SettingRow label="Long break every" value={config.longBreakEvery} min={1} max={12} onChange={v => setConfig({ longBreakEvery: v })} />
          <label style={s.toggleRow}>
            <span style={s.settingLabel}>Auto-start next phase</span>
            <input type="checkbox" checked={config.autoStartNext} onChange={e => setConfig({ autoStartNext: e.target.checked })} />
          </label>
          <button style={s.doneBtn} onClick={() => setShowSettings(false)}>Done</button>
        </div>
      ) : (
        <>
          {/* Timer circle */}
          <div style={s.timerArea}>
            <div style={s.circleWrap}>
              <svg width="264" height="264" viewBox="0 0 264 264">
                <defs>
                  <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={accentColor} stopOpacity="0.65" />
                    <stop offset="100%" stopColor={accentColor} stopOpacity="1" />
                  </linearGradient>
                </defs>
                <circle cx="132" cy="132" r={circleR} fill="none" stroke="var(--color-border-subtle)" strokeWidth="10" />
                <circle cx="132" cy="132" r={circleR} fill="none" stroke={`url(#${ringGradId})`} strokeWidth="10"
                  strokeDasharray={`${strokeDash} ${circleC}`} strokeLinecap="round"
                  transform="rotate(-90 132 132)"
                  style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }} />
              </svg>
              <div style={s.timerText}>
                <div style={{ fontSize: 56, fontWeight: 200, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: 'var(--color-text-primary)' }}>
                  {fmtTime(remainingSecs)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, boxShadow: running ? `0 0 4px ${accentColor}` : 'none', transition: 'box-shadow 0.3s ease' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {idle ? 'Ready' : running ? PHASE_LABELS[phase] : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={s.controls}>
            <button onClick={resetPomodoro} className="pomo-icon-btn" style={s.secondaryBtn} title="Reset" aria-label="Reset">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
              </svg>
            </button>
            <button onClick={() => (running ? pausePomodoro() : startPomodoro())} className="pomo-primary-btn" style={{ ...s.primaryBtn, background: accentColor }}>
              {running ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
              )}
              <span>{running ? 'Pause' : idle ? 'Start' : 'Resume'}</span>
            </button>
            <button onClick={() => advance({ silent: true })} className="pomo-icon-btn" style={s.secondaryBtn} title={phase === 'work' ? 'Skip' : 'Skip break'} aria-label={phase === 'work' ? 'Skip' : 'Skip break'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
          </div>

          {/* Session counter */}
          <div style={s.sessionInfo}>
            <div style={s.sessionDots}>
              {Array.from({ length: Math.max(1, config.longBreakEvery) }).map((_, i) => {
                const doneInCycle = completedSessions % Math.max(1, config.longBreakEvery);
                const filled = i < doneInCycle;
                const isNext = i === doneInCycle && phase === 'work';
                return (
                  <div key={i} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: filled ? accentColor : 'var(--color-border)',
                    transform: filled ? 'scale(1.05)' : 'scale(1)',
                    boxShadow: isNext ? `0 0 0 3px ${accentColor}33` : 'none',
                    transition: 'background 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s ease, transform 0.3s ease',
                  }} />
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {log.sessions} session{log.sessions !== 1 ? 's' : ''} &middot; {log.focusMin} min focused today
            </div>
          </div>

          {/* Session log */}
          {log.entries.length > 0 && (
            <div style={s.logSection}>
              <span className="dex-label-caps" style={s.logHeading}>Today</span>
              <div style={s.logList}>
                {log.entries.slice(0, 8).map((e, i) => (
                  <div key={i} style={s.logRow}>
                    <span style={{ color: PHASE_COLORS[e.phase], fontWeight: 600, fontSize: 12 }}>{PHASE_LABELS[e.phase]}</span>
                    <span style={s.logMeta}>{e.minutes}m</span>
                    <span style={s.logMeta}>{fmtClock(e.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SettingRow: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void }> = ({ label, value, min, max, onChange }) => (
  <div style={s.settingRow}>
    <span style={s.settingLabel}>{label}</span>
    <div style={s.stepper}>
      <button style={s.stepBtn} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Decrease ${label}`}>&minus;</button>
      <input
        type="number" min={min} max={max} value={value} aria-label={label}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        style={s.stepInput}
      />
      <button style={s.stepBtn} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Increase ${label}`}>+</button>
    </div>
  </div>
);

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto',
  },
  phaseTabs: {
    display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--space-4) var(--space-5)',
    flexShrink: 0, width: '100%', maxWidth: 420,
  },
  phaseTab: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 14px', borderRadius: 10, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  timerArea: {
    flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-4) var(--space-5)',
  },
  circleWrap: { position: 'relative', width: 264, height: 264, transition: 'filter 0.3s ease' },
  timerText: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
    padding: '0 var(--space-5) var(--space-5)', flexShrink: 0,
  },
  primaryBtn: {
    minWidth: 140, height: 52, borderRadius: 24, border: 'none',
    color: 'var(--color-text-inverse, #fff)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.2s ease, filter 0.15s ease', fontFamily: 'var(--font-family)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 22px',
  },
  secondaryBtn: {
    width: 44, height: 44, borderRadius: '50%', border: 'none',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  sessionInfo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    padding: '0 var(--space-5) var(--space-5)', flexShrink: 0,
  },
  sessionDots: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 220 },
  logSection: {
    width: '100%', maxWidth: 420, padding: '0 var(--space-5) var(--space-6)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  logHeading: { color: 'var(--color-text-tertiary)' },
  logList: { display: 'flex', flexDirection: 'column', gap: 2 },
  logRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px var(--space-3)', borderRadius: 10, background: 'var(--color-bg-surface)',
  },
  logMeta: { fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' },
  settings: {
    width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column',
    gap: 'var(--space-3)', padding: 'var(--space-5)', margin: 'var(--space-3) 0',
  },
  settingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' },
  settingLabel: { fontSize: 14, color: 'var(--color-text-primary)' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
  stepper: { display: 'flex', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
    fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-family)',
  },
  stepInput: {
    width: 52, height: 32, textAlign: 'center', fontSize: 15, fontWeight: 600,
    background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
    borderRadius: 10, color: 'var(--color-text-primary)', outline: 'none',
  },
  doneBtn: {
    marginTop: 'var(--space-2)', padding: '10px', background: 'var(--color-accent-fill)',
    color: 'var(--color-text-inverse, #fff)', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
};

const POMO_CSS = `
.pomo-tab:hover { background: var(--color-bg-surface); color: var(--color-text-primary); }
.pomo-icon-btn:hover { background: var(--color-bg-elevated); color: var(--color-text-primary); }
.pomo-icon-btn:active { transform: scale(0.95); }
.pomo-primary-btn:hover { filter: brightness(1.06); }
.pomo-primary-btn:active { transform: scale(0.97); }
`;

PomodoroTimer.displayName = 'PomodoroTimer';
export default memo(PomodoroTimer);
