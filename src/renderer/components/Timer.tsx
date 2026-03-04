/**
 * DEX Timer & Countdown Components
 * Timers, countdowns, and time-based utilities
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlayIcon, PauseIcon, SkipForwardIcon } from '../utils/icons';

// ==================== TYPES ====================

interface TimerProps {
  initialTime?: number; // in seconds
  autoStart?: boolean;
  onComplete?: () => void;
  onTick?: (time: number) => void;
  format?: 'hh:mm:ss' | 'mm:ss' | 'ss' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  showControls?: boolean;
  showMilliseconds?: boolean;
}

interface CountdownProps {
  targetDate: Date;
  onComplete?: () => void;
  format?: 'full' | 'compact' | 'minimal';
  showLabels?: boolean;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
}

interface StopwatchProps {
  autoStart?: boolean;
  onLap?: (time: number, lapTimes: number[]) => void;
  showLaps?: boolean;
  maxLaps?: number;
  size?: 'sm' | 'md' | 'lg';
}

interface PomodoroProps {
  workDuration?: number; // in minutes
  shortBreakDuration?: number;
  longBreakDuration?: number;
  sessionsBeforeLongBreak?: number;
  autoStartBreaks?: boolean;
  autoStartWork?: boolean;
  onSessionComplete?: (type: 'work' | 'shortBreak' | 'longBreak') => void;
  onAllSessionsComplete?: () => void;
}

// ==================== TIMER ====================

export const Timer: React.FC<TimerProps> = ({
  initialTime = 0,
  autoStart = false,
  onComplete,
  onTick,
  format = 'auto',
  size = 'md',
  showControls = true,
  showMilliseconds = false,
}) => {
  const [time, setTime] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isCountdown] = useState(initialTime > 0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sizeConfig = {
    sm: { fontSize: 24, controlSize: 28 },
    md: { fontSize: 40, controlSize: 36 },
    lg: { fontSize: 64, controlSize: 48 },
  };

  const config = sizeConfig[size];

  const formatTime = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    switch (format) {
      case 'hh:mm:ss':
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
      case 'mm:ss':
        return `${pad(mins)}:${pad(secs)}`;
      case 'ss':
        return pad(secs);
      case 'auto':
      default:
        if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
        return `${pad(mins)}:${pad(secs)}`;
    }
  }, [format]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(prev => {
          const newTime = isCountdown ? prev - 1 : prev + 1;
          onTick?.(newTime);

          if (isCountdown && newTime <= 0) {
            setIsRunning(false);
            onComplete?.();
            return 0;
          }

          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isCountdown, onComplete, onTick]);

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setTime(initialTime);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    },
    time: {
      fontFamily: 'monospace',
      fontSize: config.fontSize,
      fontWeight: 700,
      color: 'var(--color-text)',
      letterSpacing: 2,
    },
    controls: {
      display: 'flex',
      gap: 8,
    },
    button: {
      width: config.controlSize,
      height: config.controlSize,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: config.controlSize * 0.4,
      color: 'var(--color-text)',
      transition: 'background 0.15s',
    },
    primaryButton: {
      background: 'var(--color-accent)',
      border: 'none',
      color: '#fff',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.time}>{formatTime(time)}</div>
      {showControls && (
        <div style={styles.controls}>
          {isRunning ? (
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handlePause}
              title="Pause"
            >
              <PauseIcon size={14} />
            </button>
          ) : (
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={handleStart}
              title="Start"
            >
              <PlayIcon size={14} />
            </button>
          )}
          <button style={styles.button} onClick={handleReset} title="Reset">
            ↺
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== COUNTDOWN ====================

export const Countdown: React.FC<CountdownProps> = ({
  targetDate,
  onComplete,
  format = 'full',
  showLabels = true,
  showDays = true,
  showHours = true,
  showMinutes = true,
  showSeconds = true,
}) => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
  const [isComplete, setIsComplete] = useState(false);

  function calculateTimeLeft() {
    const difference = targetDate.getTime() - new Date().getTime();

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / (1000 * 60)) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);

      if (Object.values(newTimeLeft).every(v => v === 0) && !isComplete) {
        setIsComplete(true);
        onComplete?.();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete, isComplete]);

  const units = [
    { key: 'days', value: timeLeft.days, label: 'Days', show: showDays },
    { key: 'hours', value: timeLeft.hours, label: 'Hours', show: showHours },
    { key: 'minutes', value: timeLeft.minutes, label: 'Minutes', show: showMinutes },
    { key: 'seconds', value: timeLeft.seconds, label: 'Seconds', show: showSeconds },
  ].filter(u => u.show);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: format === 'compact' ? 8 : 16,
      justifyContent: 'center',
    },
    unit: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    },
    value: {
      fontSize: format === 'minimal' ? 24 : format === 'compact' ? 32 : 48,
      fontWeight: 700,
      fontFamily: 'monospace',
      color: 'var(--color-text)',
      background: format !== 'minimal' ? 'var(--color-bg-secondary)' : 'transparent',
      padding: format !== 'minimal' ? '12px 16px' : 0,
      borderRadius: 8,
      minWidth: format !== 'minimal' ? 80 : 'auto',
      textAlign: 'center',
    },
    label: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    separator: {
      fontSize: format === 'minimal' ? 24 : format === 'compact' ? 32 : 48,
      fontWeight: 700,
      color: 'var(--color-text-muted)',
      alignSelf: 'flex-start',
      marginTop: format !== 'minimal' ? 12 : 0,
    },
  };

  if (format === 'minimal') {
    const parts = [];
    if (showDays && timeLeft.days > 0) parts.push(`${timeLeft.days}d`);
    if (showHours) parts.push(`${timeLeft.hours}h`);
    if (showMinutes) parts.push(`${timeLeft.minutes}m`);
    if (showSeconds) parts.push(`${timeLeft.seconds}s`);

    return <span style={styles.value}>{parts.join(' ')}</span>;
  }

  return (
    <div style={styles.container}>
      {units.map((unit, index) => (
        <React.Fragment key={unit.key}>
          <div style={styles.unit}>
            <div style={styles.value}>
              {unit.value.toString().padStart(2, '0')}
            </div>
            {showLabels && <span style={styles.label}>{unit.label}</span>}
          </div>
          {index < units.length - 1 && format === 'full' && (
            <span style={styles.separator}>:</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ==================== STOPWATCH ====================

export const Stopwatch: React.FC<StopwatchProps> = ({
  autoStart = false,
  onLap,
  showLaps = true,
  maxLaps = 100,
  size = 'md',
}) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [laps, setLaps] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sizeConfig = {
    sm: { fontSize: 28, controlSize: 32 },
    md: { fontSize: 48, controlSize: 40 },
    lg: { fontSize: 72, controlSize: 52 },
  };

  const config = sizeConfig[size];

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(prev => prev + 10);
      }, 10);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleStart = () => setIsRunning(true);
  const handleStop = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setTime(0);
    setLaps([]);
  };
  const handleLap = () => {
    if (laps.length < maxLaps) {
      const newLaps = [...laps, time];
      setLaps(newLaps);
      onLap?.(time, newLaps);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
    },
    time: {
      fontFamily: 'monospace',
      fontSize: config.fontSize,
      fontWeight: 700,
      color: 'var(--color-text)',
      letterSpacing: 2,
    },
    controls: {
      display: 'flex',
      gap: 12,
    },
    button: {
      width: config.controlSize,
      height: config.controlSize,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: config.controlSize * 0.35,
      color: 'var(--color-text)',
      transition: 'background 0.15s, transform 0.1s',
    },
    primaryButton: {
      background: 'var(--color-accent)',
      border: 'none',
      color: '#fff',
    },
    dangerButton: {
      background: '#ef4444',
      border: 'none',
      color: '#fff',
    },
    laps: {
      width: '100%',
      maxWidth: 300,
      maxHeight: 200,
      overflowY: 'auto',
    },
    lap: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid var(--color-border)',
      fontSize: 14,
    },
    lapNumber: {
      color: 'var(--color-text-muted)',
    },
    lapTime: {
      fontFamily: 'monospace',
      color: 'var(--color-text)',
    },
    lapDiff: {
      fontFamily: 'monospace',
      color: 'var(--color-text-secondary)',
      fontSize: 12,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.time}>{formatTime(time)}</div>

      <div style={styles.controls}>
        {isRunning ? (
          <button style={{ ...styles.button, ...styles.dangerButton }} onClick={handleStop}>
            <PauseIcon />
          </button>
        ) : (
          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleStart}>
            <PlayIcon />
          </button>
        )}
        <button style={styles.button} onClick={handleLap} disabled={!isRunning}>
          flag
        </button>
        <button style={styles.button} onClick={handleReset}>
          ↺
        </button>
      </div>

      {showLaps && laps.length > 0 && (
        <div style={styles.laps}>
          {laps.map((lapTime, index) => {
            const prevLap = index > 0 ? laps[index - 1] : 0;
            const diff = lapTime - prevLap;

            return (
              <div key={index} style={styles.lap}>
                <span style={styles.lapNumber}>Lap {index + 1}</span>
                <span style={styles.lapDiff}>+{formatTime(diff)}</span>
                <span style={styles.lapTime}>{formatTime(lapTime)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================== POMODORO ====================

type PomodoroSession = 'work' | 'shortBreak' | 'longBreak';

export const Pomodoro: React.FC<PomodoroProps> = ({
  workDuration = 25,
  shortBreakDuration = 5,
  longBreakDuration = 15,
  sessionsBeforeLongBreak = 4,
  autoStartBreaks = false,
  autoStartWork = false,
  onSessionComplete,
  onAllSessionsComplete,
}) => {
  const [sessionType, setSessionType] = useState<PomodoroSession>('work');
  const [timeLeft, setTimeLeft] = useState(workDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getDuration = (type: PomodoroSession): number => {
    switch (type) {
      case 'work': return workDuration * 60;
      case 'shortBreak': return shortBreakDuration * 60;
      case 'longBreak': return longBreakDuration * 60;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      onSessionComplete?.(sessionType);

      if (sessionType === 'work') {
        const newCompleted = completedSessions + 1;
        setCompletedSessions(newCompleted);

        if (newCompleted >= sessionsBeforeLongBreak) {
          setSessionType('longBreak');
          setTimeLeft(longBreakDuration * 60);
          setCompletedSessions(0);
          if (autoStartBreaks) setIsRunning(true);
        } else {
          setSessionType('shortBreak');
          setTimeLeft(shortBreakDuration * 60);
          if (autoStartBreaks) setIsRunning(true);
        }
      } else {
        setSessionType('work');
        setTimeLeft(workDuration * 60);
        if (autoStartWork) setIsRunning(true);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft, sessionType, completedSessions, autoStartBreaks, autoStartWork]);

  const handleSkip = () => {
    setIsRunning(false);
    if (sessionType === 'work') {
      setSessionType('shortBreak');
      setTimeLeft(shortBreakDuration * 60);
    } else {
      setSessionType('work');
      setTimeLeft(workDuration * 60);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(getDuration(sessionType));
  };

  const sessionColors: Record<PomodoroSession, string> = {
    work: '#ef4444',
    shortBreak: '#10b981',
    longBreak: '#3b82f6',
  };

  const sessionLabels: Record<PomodoroSession, string> = {
    work: 'Focus Time',
    shortBreak: 'Short Break',
    longBreak: 'Long Break',
  };

  const progress = 1 - timeLeft / getDuration(sessionType);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      padding: 24,
    },
    header: {
      textAlign: 'center',
    },
    sessionLabel: {
      fontSize: 14,
      fontWeight: 600,
      color: sessionColors[sessionType],
      textTransform: 'uppercase',
      letterSpacing: '1px',
      margin: 0,
      marginBottom: 8,
    },
    sessionIndicators: {
      display: 'flex',
      gap: 8,
      justifyContent: 'center',
    },
    indicator: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
    },
    indicatorActive: {
      background: sessionColors.work,
    },
    timerCircle: {
      position: 'relative',
      width: 200,
      height: 200,
    },
    circleBackground: {
      fill: 'none',
      stroke: 'var(--color-bg-tertiary)',
      strokeWidth: 8,
    },
    circleProgress: {
      fill: 'none',
      stroke: sessionColors[sessionType],
      strokeWidth: 8,
      strokeLinecap: 'round',
      transform: 'rotate(-90deg)',
      transformOrigin: '100px 100px',
      transition: 'stroke-dashoffset 0.5s',
    },
    time: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: 48,
      fontWeight: 700,
      fontFamily: 'monospace',
      color: 'var(--color-text)',
    },
    controls: {
      display: 'flex',
      gap: 12,
    },
    button: {
      width: 48,
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 18,
      color: 'var(--color-text)',
    },
    primaryButton: {
      width: 64,
      height: 64,
      background: sessionColors[sessionType],
      border: 'none',
      color: '#fff',
      fontSize: 24,
    },
  };

  const circumference = 2 * Math.PI * 90;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={styles.sessionLabel}>{sessionLabels[sessionType]}</p>
        <div style={styles.sessionIndicators}>
          {Array.from({ length: sessionsBeforeLongBreak }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.indicator,
                ...(i < completedSessions ? styles.indicatorActive : {}),
              }}
            />
          ))}
        </div>
      </div>

      <div style={styles.timerCircle}>
        <svg width="200" height="200">
          <circle
            cx="100"
            cy="100"
            r="90"
            style={styles.circleBackground}
          />
          <circle
            cx="100"
            cy="100"
            r="90"
            style={{
              ...styles.circleProgress,
              strokeDasharray: circumference,
              strokeDashoffset: dashOffset,
            }}
          />
        </svg>
        <div style={styles.time}>{formatTime(timeLeft)}</div>
      </div>

      <div style={styles.controls}>
        <button style={styles.button} onClick={handleReset} title="Reset">
          ↺
        </button>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => setIsRunning(!isRunning)}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button style={styles.button} onClick={handleSkip} title="Skip">
          <SkipForwardIcon />
        </button>
      </div>
    </div>
  );
};

export default Timer;
