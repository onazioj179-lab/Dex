/**
 * DEX Platform - Timer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Multiple named concurrent countdown timers with presets and quick-restart.
 * Shared timer state survives app switches and reload (remaining derived from
 * wall-clock anchors in the timer store, not a React interval).
 */
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { useTimerStore, timerRemaining, type TimerEntry } from '../../store/timerStore';

interface TimerPreset {
  label: string;
  seconds: number;
}

// Quick-add chips for a new timer.
const PRESETS: TimerPreset[] = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '25m', seconds: 1500 },
];

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TimerCard: React.FC<{ timer: TimerEntry }> = ({ timer }) => {
  const start = useTimerStore(s => s.startTimer);
  const pause = useTimerStore(s => s.pauseTimer);
  const reset = useTimerStore(s => s.resetTimer);
  const restart = useTimerStore(s => s.restartTimer);
  const rename = useTimerStore(s => s.renameTimer);
  const remove = useTimerStore(s => s.removeTimer);

  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(timer.label);

  // Local re-render ticker; the actual remaining is derived from the store's
  // wall-clock anchors, so this only needs to nudge the UI.
  const [, force] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!timer.running) return;
    const tick = () => { force(n => n + 1); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [timer.running]);

  const remainingMs = timerRemaining(timer);
  const remaining = Math.ceil(remainingMs / 1000);
  const progress = timer.durationMs > 0 ? ((timer.durationMs - remainingMs) / timer.durationMs) * 100 : 0;
  const isComplete = timer.completed;

  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, progress) / 100) * circumference;

  const commitLabel = () => {
    rename(timer.id, draftLabel);
    setEditing(false);
  };

  return (
    <div className="dex-liquid-glass" style={s.card}>
      <div style={s.cardHeader}>
        {editing ? (
          <input
            autoFocus
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setDraftLabel(timer.label); setEditing(false); } }}
            style={s.labelInput}
          />
        ) : (
          <button style={s.labelBtn} onClick={() => { setDraftLabel(timer.label); setEditing(true); }} title="Rename" aria-label="Rename timer">
            {timer.label}
          </button>
        )}
        <button style={s.removeBtn} onClick={() => remove(timer.id)} title="Remove timer" aria-label="Remove timer">
          <DexIcon name="close" size={14} />
        </button>
      </div>

      <div style={s.circleContainer}>
        <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="6" />
          <circle
            cx="100" cy="100" r={radius} fill="none"
            stroke={isComplete ? 'var(--color-success, #30D158)' : 'var(--color-accent)'}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.18s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div style={s.timeDisplay}>
          <span style={{ ...s.time, color: isComplete ? 'var(--color-success, #30D158)' : 'var(--color-text-primary)' }}>
            {fmtTime(remaining)}
          </span>
          {isComplete && <span style={s.completeText}>Done!</span>}
        </div>
      </div>

      <div style={s.cardControls}>
        {isComplete ? (
          <button style={s.primaryBtn} onClick={() => restart(timer.id)}>
            <DexIcon name="refresh" size={18} /> Restart
          </button>
        ) : !timer.running ? (
          <button style={s.primaryBtn} onClick={() => start(timer.id)} disabled={remaining === 0}>
            <DexIcon name="play" size={18} /> Start
          </button>
        ) : (
          <button style={{ ...s.primaryBtn, background: 'var(--color-warning, #FF9500)' }} onClick={() => pause(timer.id)}>
            <DexIcon name="pause" size={18} /> Pause
          </button>
        )}
        <button style={s.secondaryBtn} onClick={() => reset(timer.id)} title="Reset" aria-label="Reset timer">
          <DexIcon name="refresh" size={16} />
        </button>
      </div>
    </div>
  );
};

const Timer: React.FC = () => {
  const timers = useTimerStore(s => s.timers);
  const addTimer = useTimerStore(s => s.addTimer);
  const tickTimers = useTimerStore(s => s.tickTimers);

  // Drive completion reconciliation centrally — fires toasts and freezes any
  // timer that crossed zero, including ones that elapsed while unmounted.
  useEffect(() => {
    tickTimers();
    const id = window.setInterval(tickTimers, 500);
    return () => clearInterval(id);
  }, [tickTimers]);

  const [customMin, setCustomMin] = useState(5);
  const [customSec, setCustomSec] = useState(0);
  const [newLabel, setNewLabel] = useState('');

  const addCustom = useCallback(() => {
    const secs = customMin * 60 + customSec;
    if (secs <= 0) return;
    addTimer(secs * 1000, newLabel.trim() || undefined);
    setNewLabel('');
  }, [customMin, customSec, newLabel, addTimer]);

  return (
    <div style={s.container} className="dex-timer">
      <style>{`
        .dex-timer button { transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease, border-color 0.12s ease; }
        .dex-timer button:not(:disabled):hover { filter: brightness(1.07); }
        .dex-timer button:not(:disabled):active { transform: scale(0.96); }
        .dex-timer input[style] { transition: border-color 0.12s ease; }
        .dex-timer input:focus { border-color: var(--color-accent) !important; }
      `}</style>
      {/* New-timer composer */}
      <div style={s.composer}>
        <div style={s.composerRow}>
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            style={s.textInput}
            onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
          />
          <div style={s.inputGroup}>
            <input type="number" min={0} max={99} value={customMin} aria-label="Minutes"
              onChange={e => setCustomMin(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
              style={s.numInput} />
            <span style={s.inputLabel}>min</span>
          </div>
          <span style={s.inputColon}>:</span>
          <div style={s.inputGroup}>
            <input type="number" min={0} max={59} value={customSec} aria-label="Seconds"
              onChange={e => setCustomSec(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
              style={s.numInput} />
            <span style={s.inputLabel}>sec</span>
          </div>
          <button style={s.addBtn} onClick={addCustom}>Add</button>
        </div>
        <div style={s.presetsRow}>
          <span className="dex-label-caps" style={{ alignSelf: 'center', marginRight: 4 }}>Quick</span>
          {PRESETS.map(p => (
            <button key={p.label} style={s.presetChip} onClick={() => addTimer(p.seconds * 1000, newLabel.trim() || undefined)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active timers */}
      {timers.length === 0 ? (
        <div style={s.empty}>
          <DexIcon name="clock" size={40} />
          <span style={s.emptyText}>No timers yet</span>
          <span style={s.emptyHint}>Add a quick timer above. Running timers keep counting even if you switch apps or reload.</span>
        </div>
      ) : (
        <div style={s.grid}>
          {timers.map(t => <TimerCard key={t.id} timer={t} />)}
        </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto', padding: 'var(--space-5)', gap: 'var(--space-5)',
  },
  composer: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)',
  },
  composerRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' },
  textInput: {
    flex: 1, minWidth: 120, padding: '10px var(--space-3)', fontSize: 14,
    background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
    borderRadius: 10, color: 'var(--color-text-primary)', outline: 'none',
    fontFamily: 'var(--font-family)',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  numInput: {
    width: 56, padding: '8px var(--space-2)', fontSize: 20, fontWeight: 600,
    textAlign: 'center', background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)', borderRadius: 10,
    color: 'var(--color-text-primary)', outline: 'none',
  },
  inputLabel: { fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 },
  inputColon: { fontSize: 20, color: 'var(--color-text-tertiary)', marginBottom: 14 },
  addBtn: {
    padding: '10px var(--space-5)', background: 'var(--color-accent)',
    color: 'var(--color-text-inverse, #fff)', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  presetsRow: { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' },
  presetChip: {
    padding: '6px var(--space-4)', background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)', border: '1px solid var(--color-border)',
    borderRadius: 9999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'var(--font-family)',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 'var(--space-4)', alignContent: 'start',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)', borderRadius: 14,
  },
  cardHeader: { display: 'flex', alignItems: 'center', width: '100%', gap: 'var(--space-2)' },
  labelBtn: {
    flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
    color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600,
    cursor: 'text', padding: 4, fontFamily: 'var(--font-family)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  labelInput: {
    flex: 1, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-accent)',
    borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 600,
    padding: '4px var(--space-2)', outline: 'none', fontFamily: 'var(--font-family)',
  },
  removeBtn: {
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)',
    cursor: 'pointer', borderRadius: 10, flexShrink: 0,
  },
  circleContainer: { position: 'relative', width: 200, height: 200 },
  timeDisplay: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  },
  time: { fontSize: 34, fontWeight: 300, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' },
  completeText: { display: 'block', fontSize: 12, color: 'var(--color-success, #30D158)', fontWeight: 600, marginTop: 2 },
  cardControls: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center', width: '100%' },
  primaryBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px var(--space-4)', background: 'var(--color-accent)',
    color: 'var(--color-text-inverse, #fff)', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 10, cursor: 'pointer', flexShrink: 0,
  },
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 'var(--space-3)', color: 'var(--color-text-tertiary)',
    textAlign: 'center', padding: 'var(--space-6)',
  },
  emptyText: { fontSize: 16, fontWeight: 600, color: 'var(--color-text-secondary)' },
  emptyHint: { fontSize: 13, maxWidth: 320, lineHeight: 1.5 },
};

export default memo(Timer);
