// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Platform - Onboarding & Beginner Mode
 * 6-screen first-launch experience + in-app tips system
 * Minimal, professional design matching DEX true-black aesthetic
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================
interface AppTip {
  id: string;
  title: string;
  content: string;
}

interface OnboardingPreferences {
  analyticsEnabled: boolean;
  crashReportsEnabled: boolean;
  autoUpdatesEnabled: boolean;
}

type OnboardingScreen = 'welcome' | 'hardware' | 'privacy' | 'tour' | 'sampleData' | 'ready';

// ==================== APP TIPS (minimal) ====================
export const APP_TIPS: Record<string, AppTip[]> = {
  vinx: [
    { id: 'import', title: 'Import', content: 'Drag files to timeline' },
    { id: 'shortcuts', title: 'Keys', content: 'Space=Play, C=Cut' },
  ],
  imosion: [
    { id: 'tracks', title: 'Tracks', content: 'Click + to add' },
    { id: 'record', title: 'Record', content: 'Arm track, click R' },
  ],
  prism: [
    { id: 'layers', title: 'Layers', content: 'Stack edits non-destructively' },
  ],
  flux: [
    { id: 'animate', title: 'Animate', content: 'Add behaviors to layers' },
  ],
  forge: [
    { id: 'queue', title: 'Queue', content: 'Drop files to encode' },
  ],
};

// ==================== KEYBOARD SHORTCUTS ====================
export const KEYBOARD_SHORTCUTS: Record<string, { key: string; action: string }[]> = {
  global: [
    { key: 'Z', action: 'Undo' },
    { key: 'S', action: 'Save' },
    { key: 'Esc', action: 'Cancel' },
    { key: '?', action: 'Shortcuts' },
  ],
  vinx: [
    { key: 'Space', action: 'Play/Pause' },
    { key: 'JKL', action: 'Shuttle' },
    { key: 'C', action: 'Cut' },
    { key: 'I/O', action: 'In/Out' },
  ],
  imosion: [
    { key: 'Space', action: 'Play/Pause' },
    { key: 'R', action: 'Record' },
    { key: 'M', action: 'Metronome' },
  ],
  prism: [
    { key: 'V', action: 'Move' },
    { key: 'B', action: 'Brush' },
    { key: '[]', action: 'Size' },
  ],
  flux: [
    { key: 'Space', action: 'Preview' },
    { key: 'T', action: 'Text' },
  ],
  forge: [
    { key: '', action: 'Start' },
    { key: 'Del', action: 'Remove' },
  ],
  dexcode: [
    { key: 'Ctrl+Enter', action: 'Run Code' },
    { key: 'Ctrl+F', action: 'Find' },
    { key: 'Ctrl+H', action: 'Replace' },
    { key: 'Ctrl+S', action: 'Export' },
  ],
  axl: [
    { key: 'V', action: 'Select' },
    { key: 'G', action: 'Move' },
    { key: 'R', action: 'Rotate' },
    { key: 'S', action: 'Scale' },
    { key: 'M', action: 'Measure' },
  ],
};

// ==================== SHARED STYLES ====================
const CARD_STYLE: React.CSSProperties = {
  background: '#0A0A0A',
  border: '1px solid var(--color-bg-hover)',
  borderRadius: 12,
  padding: '16px 20px',
};

const ACCENT_BTN: React.CSSProperties = {
  background: 'var(--color-accent, #4A9EFF)',
  border: 'none',
  borderRadius: 10,
  padding: '10px 28px',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const GHOST_BTN: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '10px 28px',
  color: 'var(--color-text-secondary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};

// ==================== STEP INDICATOR ====================
const StepIndicator: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          width: i === current ? 24 : 8,
          height: 8,
          borderRadius: 4,
          background: i === current
            ? 'var(--color-accent, #4A9EFF)'
            : i < current ? 'rgba(74, 158, 255, 0.4)' : 'var(--color-border)',
          transition: 'all 0.3s ease',
        }}
      />
    ))}
  </div>
);

// ==================== SCREEN: WELCOME ====================
const WelcomeScreen: React.FC<{ onNext: () => void; onSkip: () => void }> = ({ onNext, onSkip }) => (
  <div style={{ textAlign: 'center', padding: '48px 0' }}>
    <div style={{
      width: 80, height: 80, borderRadius: 22, margin: '0 auto 28px',
      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 32px rgba(59, 130, 246, 0.25)',
    }}>
      <span style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>D</span>
    </div>
    <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
      Welcome to DEX
    </h1>
    <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', margin: '0 0 40px', lineHeight: 1.6 }}>
      Your personal control hub for desktop automation.<br />
      Let us set things up for the best experience.
    </p>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
      <button style={ACCENT_BTN} onClick={onNext} aria-label="Get started with setup">Get Started</button>
      <button style={GHOST_BTN} onClick={onSkip} aria-label="Skip setup wizard">Skip Setup</button>
    </div>
  </div>
);

// ==================== SCREEN: HARDWARE DETECTION ====================
const HardwareScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [hwInfo, setHwInfo] = useState<{
    cores: number; memory: string; gpu: string; display: string;
  } | null>(null);

  useEffect(() => {
    const cores = navigator.hardwareConcurrency || 4;
    const memoryGB = (navigator as any).deviceMemory || 'Unknown';
    const dpr = window.devicePixelRatio || 1;
    const display = `${window.screen.width}x${window.screen.height} @${dpr}x`;

    setHwInfo({
      cores,
      memory: typeof memoryGB === 'number' ? `${memoryGB} GB` : `${memoryGB}`,
      gpu: 'Detected',
      display,
    });
  }, []);

  const profileLabel = useMemo(() => {
    if (!hwInfo) return 'Balanced';
    if (hwInfo.cores >= 8) return 'High Performance';
    if (hwInfo.cores >= 4) return 'Balanced';
    return 'Efficiency';
  }, [hwInfo]);

  return (
    <div style={{ padding: '32px 0' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
        System Check
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 28px', textAlign: 'center' }}>
        DEX adapts to your hardware automatically.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'CPU Cores', value: hwInfo ? `${hwInfo.cores} cores` : '...' },
          { label: 'Memory', value: hwInfo?.memory || '...' },
          { label: 'Display', value: hwInfo?.display || '...' },
          { label: 'GPU', value: hwInfo?.gpu || '...' },
        ].map(item => (
          <div key={item.label} style={CARD_STYLE}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...CARD_STYLE, textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Selected Profile</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-accent, #4A9EFF)' }}>{profileLabel}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>You can change this in Settings &gt; Performance</div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button style={ACCENT_BTN} onClick={onNext}>Continue</button>
      </div>
    </div>
  );
};

// ==================== SCREEN: PRIVACY ====================
const PrivacyScreen: React.FC<{
  prefs: OnboardingPreferences;
  onUpdate: (prefs: OnboardingPreferences) => void;
  onNext: () => void;
}> = ({ prefs, onUpdate, onNext }) => {
  const Toggle: React.FC<{ label: string; desc: string; value: boolean; onToggle: () => void }> = ({ label, desc, value, onToggle }) => (
    <div style={{ ...CARD_STYLE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{desc}</div>
      </div>
      <button
        onClick={onToggle}
        style={{
          width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: value ? 'var(--color-accent, #4A9EFF)' : 'var(--color-border)',
          position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 9,
          background: '#fff',
          position: 'absolute', top: 3,
          left: value ? 21 : 3,
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );

  return (
    <div style={{ padding: '32px 0' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
        Privacy
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 28px', textAlign: 'center' }}>
        DEX runs entirely on your machine. You control what data leaves.
      </p>

      <Toggle
        label="Usage Analytics"
        desc="Anonymous app usage to improve DEX"
        value={prefs.analyticsEnabled}
        onToggle={() => onUpdate({ ...prefs, analyticsEnabled: !prefs.analyticsEnabled })}
      />
      <Toggle
        label="Crash Reports"
        desc="Send crash data locally -- never to external servers"
        value={prefs.crashReportsEnabled}
        onToggle={() => onUpdate({ ...prefs, crashReportsEnabled: !prefs.crashReportsEnabled })}
      />
      <Toggle
        label="Auto Updates"
        desc="Check for updates in the background"
        value={prefs.autoUpdatesEnabled}
        onToggle={() => onUpdate({ ...prefs, autoUpdatesEnabled: !prefs.autoUpdatesEnabled })}
      />

      <div style={{
        background: 'rgba(74, 158, 255, 0.06)',
        border: '1px solid rgba(74, 158, 255, 0.12)',
        borderRadius: 10, padding: '12px 16px', marginTop: 16, marginBottom: 28,
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, marginBottom: 4 }}>Your data stays yours</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          All processing happens locally. No telemetry is sent to remote servers.
          Crash reports are stored on your machine only.
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button style={ACCENT_BTN} onClick={onNext}>Continue</button>
      </div>
    </div>
  );
};

// ==================== SCREEN: FEATURE TOUR ====================
const TourScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const features = [
    { title: 'Home', desc: 'System overview, clock, and quick actions', icon: 'H' },
    { title: 'Files', desc: 'Browse, search, and organize your files', icon: 'F' },
    { title: 'Workflows', desc: 'Automate repetitive tasks across apps', icon: 'W' },
    { title: 'Transfers', desc: 'Send files between devices on your network', icon: 'T' },
    { title: 'Apps', desc: 'Vinx, Imosion, Prism, Flux, Forge, and more', icon: 'A' },
    { title: 'Settings', desc: 'Customize everything to your preference', icon: 'S' },
  ];

  return (
    <div style={{ padding: '32px 0' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
        What DEX Can Do
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 28px', textAlign: 'center' }}>
        A quick look at your new control hub.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
        {features.map(f => (
          <div key={f.title} style={{ ...CARD_STYLE, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'rgba(74, 158, 255, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--color-accent, #4A9EFF)',
            }}>
              {f.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button style={ACCENT_BTN} onClick={onNext}>Continue</button>
      </div>
    </div>
  );
};

// ==================== SCREEN: SAMPLE DATA ====================
const SampleDataScreen: React.FC<{
  onNext: (loadSample: boolean) => void;
}> = ({ onNext }) => (
  <div style={{ padding: '32px 0', textAlign: 'center' }}>
    <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
      Sample Content
    </h2>
    <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 28px', lineHeight: 1.6 }}>
      Load sample workflows and notes to explore<br />
      how DEX works, or start fresh.
    </p>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28, textAlign: 'left' }}>
      <button
        onClick={() => onNext(true)}
        style={{
          ...CARD_STYLE, border: '1px solid rgba(74, 158, 255, 0.2)',
          cursor: 'pointer', textAlign: 'left',
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 8 }}>+</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Load Samples</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
          Pre-built workflows, sample notes, and demo automations to explore.
        </div>
      </button>
      <button
        onClick={() => onNext(false)}
        style={{
          ...CARD_STYLE, cursor: 'pointer', textAlign: 'left',
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 8 }}>-</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Start Empty</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
          Clean slate. Build your workspace from scratch.
        </div>
      </button>
    </div>
  </div>
);

// ==================== SCREEN: READY ====================
const ReadyScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => (
  <div style={{ textAlign: 'center', padding: '48px 0' }}>
    <div style={{
      width: 64, height: 64, borderRadius: 32, margin: '0 auto 24px',
      background: 'rgba(61, 166, 106, 0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3DA66A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
    <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
      All Set
    </h2>
    <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 12px', lineHeight: 1.6 }}>
      DEX is ready. Press <kbd style={{
        background: 'var(--color-border)', padding: '2px 6px', borderRadius: 4,
        fontSize: 11, fontFamily: 'inherit',
      }}>?</kbd> anytime for keyboard shortcuts.
    </p>
    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 36px' }}>
      Tip: Use Ctrl+K to open the Command Palette.
    </p>
    <button style={ACCENT_BTN} onClick={onComplete}>Launch DEX</button>
  </div>
);

// ==================== FULL ONBOARDING WIZARD (6 SCREENS) ====================
export const OnboardingWizard: React.FC<{
  onComplete: () => void;
  onSkip?: () => void;
}> = ({ onComplete, onSkip }) => {
  const screens: OnboardingScreen[] = ['welcome', 'hardware', 'privacy', 'tour', 'sampleData', 'ready'];
  const [screenIndex, setScreenIndex] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [loadSample, setLoadSample] = useState(false);
  const [prefs, setPrefs] = useState<OnboardingPreferences>({
    analyticsEnabled: false,
    crashReportsEnabled: true,
    autoUpdatesEnabled: true,
  });

  const current = screens[screenIndex];
  const [slideDir, setSlideDir] = useState<'next' | 'back'>('next');

  const goNext = useCallback(() => {
    if (screenIndex < screens.length - 1) {
      setSlideDir('next');
      setScreenIndex(i => i + 1);
    }
  }, [screenIndex, screens.length]);

  const goBack = useCallback(() => {
    if (screenIndex > 0) {
      setSlideDir('back');
      setScreenIndex(i => i - 1);
    }
  }, [screenIndex]);

  const handleComplete = useCallback(() => {
    // Save preferences + sample data choice
    try {
      localStorage.setItem('dex-onboarding-prefs', JSON.stringify({ ...prefs, loadSample }));
    } catch {
      // storage unavailable
    }
    setExiting(true);
    setTimeout(onComplete, 300);
  }, [prefs, loadSample, onComplete]);

  const handleSkip = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      if (onSkip) onSkip();
      else onComplete();
    }, 300);
  }, [onComplete, onSkip]);

  // Item 198: Keyboard navigation for onboarding
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && current !== 'ready') { handleSkip(); }
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && current !== 'ready') { goNext(); }
      else if (e.key === 'Enter' && current === 'ready') { handleComplete(); }
      else if (e.key === 'ArrowLeft') { goBack(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, goNext, goBack, handleSkip]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#000000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 0.3s ease',
    }}>
      <style>{`
        @keyframes onboardFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes onboardSlideNext {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes onboardSlideBack {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        width: '100%', maxWidth: 520, padding: '0 32px',
        animation: 'onboardFadeIn 0.4s ease',
      }}>
        <StepIndicator current={screenIndex} total={screens.length} />

        <div key={screenIndex} style={{
          animation: `${slideDir === 'next' ? 'onboardSlideNext' : 'onboardSlideBack'} 0.25s ease`,
        }}>

        {screenIndex > 0 && current !== 'ready' && (
          <div style={{ marginBottom: 8 }}>
            <button
              style={{
                ...GHOST_BTN,
                padding: '6px 16px',
                fontSize: 12,
              }}
              onClick={goBack}
            >
              Back
            </button>
          </div>
        )}

        {current === 'welcome' && <WelcomeScreen onNext={goNext} onSkip={handleSkip} />}
        {current === 'hardware' && <HardwareScreen onNext={goNext} />}
        {current === 'privacy' && <PrivacyScreen prefs={prefs} onUpdate={setPrefs} onNext={goNext} />}
        {current === 'tour' && <TourScreen onNext={goNext} />}
        {current === 'sampleData' && <SampleDataScreen onNext={(wantSamples) => { setLoadSample(wantSamples); goNext(); }} />}
        {current === 'ready' && <ReadyScreen onComplete={handleComplete} />}
        </div>
      </div>
    </div>
  );
};

// ==================== SHORTCUTS PANEL ====================
export const KeyboardShortcutsPanel: React.FC<{
  appId: string;
  onClose: () => void;
}> = ({ appId, onClose }) => {
  const global = KEYBOARD_SHORTCUTS.global;
  const appShortcuts = KEYBOARD_SHORTCUTS[appId] || [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 320,
          background: 'var(--color-bg-elevated, #111111)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-bg-hover)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Shortcuts</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', padding: 4,
            color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: '10px 18px 18px', maxHeight: 400, overflow: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            General
          </div>
          {global.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.action}</span>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: 4, color: '#d4d4d8', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
            </div>
          ))}
          {appShortcuts.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 14, marginBottom: 8 }}>
                {appId.charAt(0).toUpperCase() + appId.slice(1)}
              </div>
              {appShortcuts.map(s => (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.action}</span>
                  <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: 4, color: '#d4d4d8', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== BEGINNER TIP ====================
export const BeginnerTip: React.FC<{
  tip: AppTip;
  onDismiss: () => void;
}> = ({ tip, onDismiss }) => (
  <div style={{
    background: 'var(--color-bg-elevated, #111111)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 10,
    padding: '10px 12px',
    maxWidth: 200,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{tip.title}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{tip.content}</div>
      </div>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  </div>
);

// ==================== EMPTY STATE ====================
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center' }}>
    {icon && <div style={{ marginBottom: 16, opacity: 0.3, color: 'var(--color-text-tertiary)' }}>{icon}</div>}
    {title && <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{title}</div>}
    {description && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', maxWidth: 240 }}>{description}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);

// ==================== HOOKS ====================
export const useBeginnerMode = (appId: string) => {
  const [isBeginnerMode, setIsBeginnerMode] = useState(() => {
    try { return localStorage.getItem(`dex-${appId}-beginner`) === 'true'; } catch { return false; }
  });
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`dex-${appId}-tips`) || '[]')); } catch { return new Set(); }
  });
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);

  const tips = (APP_TIPS[appId] || []).filter(t => !dismissed.has(t.id));
  const currentTip = tips[0] || null;

  useEffect(() => {
    try { localStorage.setItem(`dex-${appId}-beginner`, String(isBeginnerMode)); } catch (e) { console.warn('[DEX]', e); }
  }, [appId, isBeginnerMode]);

  useEffect(() => {
    try { localStorage.setItem(`dex-${appId}-tips`, JSON.stringify([...dismissed])); } catch (e) { console.warn('[DEX]', e); }
  }, [appId, dismissed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcutsPanel(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dismissTip = useCallback((id: string) => setDismissed(s => new Set([...s, id])), []);
  const getNextTip = useCallback(() => {
    if (currentTip) {
      setDismissed(s => new Set([...s, currentTip.id]));
    }
  }, [currentTip]);

  return { isBeginnerMode, showShortcutsPanel, setShowShortcutsPanel, currentTip, dismissTip, getNextTip };
};

export const useOnboardingCheck = () => {
  const [needsOnboarding, setNeedsOnboarding] = useState(() => {
    try { return !localStorage.getItem('dex-welcomed'); } catch { return true; }
  });
  const markOnboardingComplete = useCallback(() => {
    try { localStorage.setItem('dex-welcomed', '1'); setNeedsOnboarding(false); } catch (e) { console.warn('[DEX]', e); }
  }, []);
  return { needsOnboarding, markOnboardingComplete };
};

export default OnboardingWizard;
