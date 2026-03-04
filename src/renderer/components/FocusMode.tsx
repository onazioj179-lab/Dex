/**
 * DEX Focus Mode
 * Distraction-free mode with timer and ambient sounds
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ==================== TYPES ====================

interface FocusSession {
  id: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  completed: boolean;
}

interface FocusModeProps {
  isActive?: boolean;
  onToggle?: (active: boolean) => void;
}

interface AmbientSound {
  id: string;
  name: string;
  icon: React.ReactNode;
}

// ==================== ICONS ====================

const Icons = {
  focus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>,
  play: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  stop: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  skip: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  rain: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M8 19v2m0-8v2m8 4v2m0-8v2m-4 2v2m0-8v2"/></svg>,
  waves: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12c1.5-1 3-2 6-2s4.5 1 6 2 3 2 6 2 4.5-1 6-2"/><path d="M2 6c1.5-1 3-2 6-2s4.5 1 6 2 3 2 6 2 4.5-1 6-2"/><path d="M2 18c1.5-1 3-2 6-2s4.5 1 6 2 3 2 6 2 4.5-1 6-2"/></svg>,
  forest: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 18H7l5-14 5 14z"/><path d="M12 10V4"/><path d="M4 18h16"/></svg>,
  fire: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  coffee: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>,
  silent: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6v12M6 12h12"/></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ==================== AMBIENT SOUNDS ====================

const AMBIENT_SOUNDS: AmbientSound[] = [
  { id: 'silent', name: 'Silent', icon: Icons.silent },
  { id: 'rain', name: 'Rain', icon: Icons.rain },
  { id: 'waves', name: 'Ocean', icon: Icons.waves },
  { id: 'forest', name: 'Forest', icon: Icons.forest },
  { id: 'fire', name: 'Fireplace', icon: Icons.fire },
  { id: 'coffee', name: 'Café', icon: Icons.coffee },
];

// ==================== STORAGE ====================

const STORAGE_KEY = 'dex-focus-mode';

interface FocusSettings {
  focusDuration: number; // minutes
  breakDuration: number; // minutes
  autoStartBreaks: boolean;
  selectedSound: string;
  volume: number;
  sessions: FocusSession[];
}

const DEFAULT_SETTINGS: FocusSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: true,
  selectedSound: 'silent',
  volume: 50,
  sessions: [],
};

const loadSettings = (): FocusSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const saveSettings = (settings: FocusSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
};

// ==================== MAIN COMPONENT ====================

export const FocusMode: React.FC<FocusModeProps> = ({ isActive: externalActive, onToggle }) => {
  const [settings, setSettings] = useState<FocusSettings>(loadSettings);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(settings.focusDuration * 60);
  const [showSettings, setShowSettings] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external state
  useEffect(() => {
    if (externalActive !== undefined) {
      setIsActive(externalActive);
    }
  }, [externalActive]);

  // Timer logic
  useEffect(() => {
    if (isActive && !isPaused && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isPaused, timeRemaining]);

  // Handle timer completion
  useEffect(() => {
    if (timeRemaining === 0 && isActive) {
      // Play notification sound
      playNotification();

      if (isBreak) {
        // Break finished, start new focus session
        if (settings.autoStartBreaks) {
          setIsBreak(false);
          setTimeRemaining(settings.focusDuration * 60);
        } else {
          stopSession();
        }
      } else {
        // Focus finished, record session and start break
        recordSession(true);
        if (settings.autoStartBreaks) {
          setIsBreak(true);
          setTimeRemaining(settings.breakDuration * 60);
        } else {
          stopSession();
        }
      }
    }
  }, [timeRemaining, isActive, isBreak, settings]);

  const playNotification = () => {
    // Play a simple beep sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      setTimeout(() => oscillator.stop(), 200);
    } catch {}
  };

  const recordSession = (completed: boolean) => {
    const session: FocusSession = {
      id: `session-${Date.now()}`,
      startTime: Date.now() - (settings.focusDuration * 60 * 1000),
      endTime: Date.now(),
      duration: settings.focusDuration * 60,
      completed,
    };

    const newSettings = {
      ...settings,
      sessions: [...settings.sessions.slice(-99), session], // Keep last 100 sessions
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const startSession = useCallback(() => {
    setIsActive(true);
    setIsPaused(false);
    setIsBreak(false);
    setTimeRemaining(settings.focusDuration * 60);
    setShowOverlay(true);
    onToggle?.(true);
  }, [settings.focusDuration, onToggle]);

  const pauseSession = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const stopSession = useCallback(() => {
    if (isActive && !isBreak && timeRemaining < settings.focusDuration * 60) {
      recordSession(false);
    }
    setIsActive(false);
    setIsPaused(false);
    setIsBreak(false);
    setTimeRemaining(settings.focusDuration * 60);
    setShowOverlay(false);
    onToggle?.(false);
  }, [isActive, isBreak, timeRemaining, settings.focusDuration, onToggle]);

  const skipToBreak = useCallback(() => {
    recordSession(true);
    setIsBreak(true);
    setTimeRemaining(settings.breakDuration * 60);
  }, [settings.breakDuration]);

  const updateSetting = useCallback(<K extends keyof FocusSettings>(key: K, value: FocusSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    
    if (key === 'focusDuration' && !isActive) {
      setTimeRemaining((value as number) * 60);
    }
  }, [settings, isActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = isBreak
    ? (1 - timeRemaining / (settings.breakDuration * 60)) * 100
    : (1 - timeRemaining / (settings.focusDuration * 60)) * 100;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: '12px',
      padding: '20px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '20px',
    },
    headerIcon: {
      color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
    },
    title: {
      flex: 1,
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    status: {
      fontSize: '11px',
      fontWeight: 500,
      padding: '4px 8px',
      borderRadius: '4px',
      background: isBreak ? '#34c75920' : 'var(--color-accent-glass)',
      color: isBreak ? '#34c759' : 'var(--color-accent)',
    },
    settingsBtn: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    timer: {
      textAlign: 'center',
      marginBottom: '20px',
    },
    timerDisplay: {
      fontSize: '48px',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      color: isBreak ? '#34c759' : 'var(--color-text-primary)',
      letterSpacing: '-2px',
    },
    timerLabel: {
      fontSize: '12px',
      color: 'var(--color-text-muted)',
      marginTop: '4px',
    },
    progressBar: {
      height: '4px',
      background: 'var(--color-bg-glass)',
      borderRadius: '2px',
      overflow: 'hidden',
      marginBottom: '20px',
    },
    progressFill: {
      height: '100%',
      background: isBreak ? '#34c759' : 'var(--color-accent)',
      borderRadius: '2px',
      transition: 'width 0.3s linear',
    },
    controls: {
      display: 'flex',
      justifyContent: 'center',
      gap: '12px',
      marginBottom: '20px',
    },
    controlBtn: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '48px',
      height: '48px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      color: '#fff',
      transition: 'transform 0.15s, background 0.15s',
    },
    controlBtnSecondary: {
      width: '40px',
      height: '40px',
      background: 'var(--color-bg-glass)',
      color: 'var(--color-text-muted)',
    },
    sounds: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '8px',
    },
    soundBtn: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      padding: '12px 8px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      transition: 'background 0.15s, color 0.15s',
    },
    soundBtnActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    soundLabel: {
      fontSize: '10px',
      fontWeight: 500,
    },
    settingsPanel: {
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: '1px solid var(--color-border)',
    },
    settingRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px',
    },
    settingLabel: {
      fontSize: '13px',
      color: 'var(--color-text-secondary)',
    },
    settingInput: {
      width: '64px',
      padding: '6px 8px',
      background: 'var(--color-bg-glass)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      textAlign: 'center',
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: '1px solid var(--color-border)',
    },
    stat: {
      textAlign: 'center',
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 700,
      color: 'var(--color-text-primary)',
    },
    statLabel: {
      fontSize: '11px',
      color: 'var(--color-text-muted)',
    },
  };

  const todaySessions = settings.sessions.filter(s => {
    const today = new Date();
    const sessionDate = new Date(s.startTime);
    return sessionDate.toDateString() === today.toDateString();
  });

  const completedToday = todaySessions.filter(s => s.completed).length;
  const totalMinutesToday = todaySessions.reduce((sum, s) => sum + Math.round(s.duration / 60), 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>{Icons.focus}</span>
        <span style={styles.title}>Focus Mode</span>
        {isActive && (
          <span style={styles.status}>
            {isBreak ? 'Break' : isPaused ? 'Paused' : 'Focusing'}
          </span>
        )}
        <button 
          style={styles.settingsBtn}
          onClick={() => setShowSettings(!showSettings)}
        >
          {Icons.settings}
        </button>
      </div>

      <div style={styles.timer}>
        <div style={styles.timerDisplay}>{formatTime(timeRemaining)}</div>
        <div style={styles.timerLabel}>
          {isBreak ? 'Break Time' : isActive ? 'Stay Focused' : 'Ready to Focus?'}
        </div>
      </div>

      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
      </div>

      <div style={styles.controls}>
        {!isActive ? (
          <button style={styles.controlBtn} onClick={startSession}>
            {Icons.play}
          </button>
        ) : (
          <>
            <button 
              style={{ ...styles.controlBtn, ...styles.controlBtnSecondary }}
              onClick={stopSession}
            >
              {Icons.stop}
            </button>
            <button style={styles.controlBtn} onClick={pauseSession}>
              {isPaused ? Icons.play : Icons.pause}
            </button>
            {!isBreak && (
              <button 
                style={{ ...styles.controlBtn, ...styles.controlBtnSecondary }}
                onClick={skipToBreak}
              >
                {Icons.skip}
              </button>
            )}
          </>
        )}
      </div>

      <div style={styles.sounds}>
        {AMBIENT_SOUNDS.map(sound => (
          <button
            key={sound.id}
            style={{
              ...styles.soundBtn,
              ...(settings.selectedSound === sound.id ? styles.soundBtnActive : {}),
            }}
            onClick={() => updateSetting('selectedSound', sound.id)}
          >
            {sound.icon}
            <span style={styles.soundLabel}>{sound.name}</span>
          </button>
        ))}
      </div>

      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Focus Duration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                value={settings.focusDuration}
                onChange={e => updateSetting('focusDuration', parseInt(e.target.value) || 25)}
                min={1}
                max={120}
                style={styles.settingInput}
              />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>min</span>
            </div>
          </div>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Break Duration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                value={settings.breakDuration}
                onChange={e => updateSetting('breakDuration', parseInt(e.target.value) || 5)}
                min={1}
                max={30}
                style={styles.settingInput}
              />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>min</span>
            </div>
          </div>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Auto-start breaks</span>
            <input
              type="checkbox"
              checked={settings.autoStartBreaks}
              onChange={e => updateSetting('autoStartBreaks', e.target.checked)}
            />
          </div>
        </div>
      )}

      <div style={styles.stats}>
        <div style={styles.stat}>
          <div style={styles.statValue}>{completedToday}</div>
          <div style={styles.statLabel}>Sessions Today</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>{totalMinutesToday}</div>
          <div style={styles.statLabel}>Minutes Focused</div>
        </div>
      </div>
    </div>
  );
};

// ==================== FOCUS MODE OVERLAY ====================

interface FocusModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FocusModeOverlay: React.FC<FocusModeOverlayProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const overlayStyles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      backdropFilter: 'blur(20px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    container: {
      width: '100%',
      maxWidth: '400px',
      padding: '24px',
    },
    closeBtn: {
      position: 'absolute',
      top: '24px',
      right: '24px',
      width: '40px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.1)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      color: '#fff',
    },
  };

  return (
    <div style={overlayStyles.overlay}>
      <button style={overlayStyles.closeBtn} onClick={onClose}>
        {Icons.close}
      </button>
      <div style={overlayStyles.container}>
        <FocusMode onToggle={(active) => !active && onClose()} />
      </div>
    </div>
  );
};

// ==================== HOOK ====================

export const useFocusMode = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    isActive,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
    setActive: setIsActive,
  };
};

export default FocusMode;
