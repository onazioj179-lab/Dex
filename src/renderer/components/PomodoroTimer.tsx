/**
 * DEX Pomodoro Timer
 * Full Pomodoro Technique implementation with breaks, stats, and ambient sounds
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type TimerPhase = 'work' | 'short-break' | 'long-break' | 'idle';

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  pomosBeforeLong: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  soundEnabled: boolean;
}

export interface PomodoroSession {
  id: string;
  label: string;
  completedPomos: number;
  totalMinutes: number;
  startedAt: number;
  endedAt: number | null;
}

export interface PomodoroState {
  settings: PomodoroSettings;
  sessions: PomodoroSession[];
  totalPomos: number;
  currentStreak: number;
  bestStreak: number;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomosBeforeLong: 4,
  autoStartBreaks: true,
  autoStartWork: false,
  soundEnabled: true,
};

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-pomodoro';

function loadState(): PomodoroState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { settings: DEFAULT_SETTINGS, sessions: [], totalPomos: 0, currentStreak: 0, bestStreak: 0 };
}

function saveState(state: PomodoroState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PomodoroTimer: React.FC<{ onClose?: () => void }> = memo(({ onClose }) => {
  const [pomState, setPomState] = useState<PomodoroState>(loadState);
  const [phase, setPhase] = useState<TimerPhase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [pomosInCycle, setPomosInCycle] = useState(0);
  const [sessionLabel, setSessionLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<number>(0);

  const settings = pomState.settings;

  const persist = useCallback((s: PomodoroState) => { setPomState(s); saveState(s); }, []);

  // Timer logic
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Phase complete
          handlePhaseComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const handlePhaseComplete = useCallback(() => {
    setIsRunning(false);

    // Notification sound (simple beep via Web Audio)
    if (settings.soundEnabled) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.stop(ctx.currentTime + 0.5);
      } catch {}
    }

    if (phase === 'work') {
      const newPomos = pomosInCycle + 1;
      setPomosInCycle(newPomos);
      const newTotal = pomState.totalPomos + 1;
      const newStreak = pomState.currentStreak + 1;
      persist({
        ...pomState,
        totalPomos: newTotal,
        currentStreak: newStreak,
        bestStreak: Math.max(pomState.bestStreak, newStreak),
      });

      // Decide next phase
      if (newPomos >= settings.pomosBeforeLong) {
        setPhase('long-break');
        setSecondsLeft(settings.longBreakMinutes * 60);
        setPomosInCycle(0);
      } else {
        setPhase('short-break');
        setSecondsLeft(settings.shortBreakMinutes * 60);
      }
      if (settings.autoStartBreaks) setIsRunning(true);
    } else {
      // Break complete
      setPhase('work');
      setSecondsLeft(settings.workMinutes * 60);
      if (settings.autoStartWork) setIsRunning(true);
    }
  }, [phase, pomosInCycle, settings, pomState, persist]);

  const startWork = useCallback(() => {
    setPhase('work');
    setSecondsLeft(settings.workMinutes * 60);
    setIsRunning(true);
    sessionStartRef.current = Date.now();
  }, [settings]);

  const pause = useCallback(() => setIsRunning(false), []);
  const resume = useCallback(() => setIsRunning(true), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setPhase('idle');
    setSecondsLeft(0);
    setPomosInCycle(0);
    // Save session
    if (sessionStartRef.current) {
      const session: PomodoroSession = {
        id: `pom-${Date.now()}`,
        label: sessionLabel || 'Focus Session',
        completedPomos: pomosInCycle,
        totalMinutes: Math.round((Date.now() - sessionStartRef.current) / 60000),
        startedAt: sessionStartRef.current,
        endedAt: Date.now(),
      };
      persist({
        ...pomState,
        sessions: [session, ...pomState.sessions].slice(0, 50),
        currentStreak: 0,
      });
    }
  }, [sessionLabel, pomosInCycle, pomState, persist]);

  const skip = useCallback(() => {
    setIsRunning(false);
    handlePhaseComplete();
  }, [handlePhaseComplete]);

  const updateSetting = useCallback((key: keyof PomodoroSettings, value: any) => {
    persist({ ...pomState, settings: { ...pomState.settings, [key]: value } });
  }, [pomState, persist]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const progressPercent = useMemo(() => {
    if (phase === 'idle') return 0;
    const total = phase === 'work' ? settings.workMinutes * 60
      : phase === 'short-break' ? settings.shortBreakMinutes * 60
      : settings.longBreakMinutes * 60;
    return ((total - secondsLeft) / total) * 100;
  }, [phase, secondsLeft, settings]);

  const phaseColor = phase === 'work' ? '#ef4444' : phase === 'short-break' ? '#10b981' : phase === 'long-break' ? '#3b82f6' : '#666';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Pomodoro</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowSettings(!showSettings)} style={styles.iconBtn} aria-label="Settings">
            {showSettings ? 'X' : 'Gear'}
          </button>
        </div>
      </div>

      {showSettings ? (
        <div style={styles.settingsPanel}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Settings</h3>
          {([
            ['workMinutes', 'Work Duration (min)', 1, 60],
            ['shortBreakMinutes', 'Short Break (min)', 1, 30],
            ['longBreakMinutes', 'Long Break (min)', 1, 60],
            ['pomosBeforeLong', 'Pomos Before Long Break', 2, 10],
          ] as const).map(([key, label, min, max]) => (
            <div key={key} style={styles.settingRow}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
              <input type="number" value={settings[key] as number} min={min} max={max}
                onChange={e => updateSetting(key, parseInt(e.target.value) || min)}
                style={styles.numInput} aria-label={label} />
            </div>
          ))}
          <div style={styles.settingRow}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Auto-start breaks</label>
            <button onClick={() => updateSetting('autoStartBreaks', !settings.autoStartBreaks)}
              style={{ ...styles.toggle, background: settings.autoStartBreaks ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
              {settings.autoStartBreaks ? 'ON' : 'OFF'}
            </button>
          </div>
          <div style={styles.settingRow}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Sound</label>
            <button onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
              style={{ ...styles.toggle, background: settings.soundEnabled ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
              {settings.soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Timer display */}
          <div style={styles.timerSection}>
            {/* Circular progress */}
            <div style={styles.circularTimer}>
              <svg width="200" height="200" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                <circle cx="100" cy="100" r="90" fill="none" stroke={phaseColor} strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (1 - progressPercent / 100)}`}
                  transform="rotate(-90 100 100)" strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
              </svg>
              <div style={styles.timerText}>
                <div style={{ fontSize: 40, fontWeight: 800, fontFeatureSettings: "'tnum'", letterSpacing: '-1px' }}>
                  {phase === 'idle' ? formatTime(settings.workMinutes * 60) : formatTime(secondsLeft)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: phaseColor, marginTop: 2 }}>
                  {phase === 'idle' ? 'Ready' : phase === 'work' ? 'Focus' : phase === 'short-break' ? 'Short Break' : 'Long Break'}
                </div>
              </div>
            </div>

            {/* Pomo dots */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {Array.from({ length: settings.pomosBeforeLong }, (_, i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < pomosInCycle ? '#ef4444' : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>

            {/* Session label */}
            <input type="text" value={sessionLabel} onChange={e => setSessionLabel(e.target.value)}
              placeholder="What are you working on?" style={styles.labelInput} aria-label="Session label" />

            {/* Controls */}
            <div style={styles.controls}>
              {phase === 'idle' ? (
                <button onClick={startWork} style={{ ...styles.primaryBtn, background: '#ef4444' }}>
                  Start Focus
                </button>
              ) : (
                <>
                  {isRunning ? (
                    <button onClick={pause} style={styles.secondaryBtn}>Pause</button>
                  ) : (
                    <button onClick={resume} style={{ ...styles.primaryBtn, background: phaseColor }}>Resume</button>
                  )}
                  <button onClick={skip} style={styles.secondaryBtn}>Skip</button>
                  <button onClick={reset} style={{ ...styles.secondaryBtn, color: '#ef4444' }}>Reset</button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={styles.statsSection}>
            <div style={styles.statCard}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{pomState.totalPomos}</div>
              <div style={styles.statLabel}>Total Pomos</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{pomState.bestStreak}</div>
              <div style={styles.statLabel}>Best Streak</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{pomState.sessions.length}</div>
              <div style={styles.statLabel}>Sessions</div>
            </div>
          </div>

          {/* Recent sessions */}
          {pomState.sessions.length > 0 && (
            <div style={styles.historySection}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Recent Sessions</h3>
              {pomState.sessions.slice(0, 5).map(s => (
                <div key={s.id} style={styles.historyItem}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {s.completedPomos} pomos -- {s.totalMinutes}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

PomodoroTimer.displayName = 'PomodoroTimer';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflow: 'auto', gap: 16, alignItems: 'center' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 400 },
  iconBtn: { padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  timerSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  circularTimer: { position: 'relative', width: 200, height: 200 },
  timerText: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  labelInput: { width: '100%', maxWidth: 280, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', textAlign: 'center', outline: 'none' },
  controls: { display: 'flex', gap: 8 },
  primaryBtn: { padding: '10px 24px', borderRadius: 10, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px' },
  secondaryBtn: { padding: '10px 16px', borderRadius: 10, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  statsSection: { display: 'flex', gap: 10, width: '100%', maxWidth: 400 },
  statCard: { flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  statLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginTop: 2 },
  historySection: { width: '100%', maxWidth: 400 },
  historyItem: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  settingsPanel: { width: '100%', maxWidth: 400, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)' },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' },
  numInput: { width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 13, textAlign: 'center', outline: 'none' },
  toggle: { padding: '3px 10px', borderRadius: 10, border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' },
};

export default PomodoroTimer;
