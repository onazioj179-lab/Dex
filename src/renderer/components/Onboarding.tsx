/**
 * DEX Platform - Onboarding & Beginner Mode
 * Minimal, professional design matching DEX aesthetic
 */

import React, { useState, useEffect, useCallback } from 'react';

// ==================== TYPES ====================
interface AppTip {
  id: string;
  title: string;
  content: string;
}

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
    { key: '⌘Z', action: 'Undo' },
    { key: '⌘S', action: 'Save' },
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
    { key: '↵', action: 'Start' },
    { key: 'Del', action: 'Remove' },
  ],
};

// ==================== SIMPLE WELCOME TOAST ====================
export const OnboardingWizard: React.FC<{ 
  onComplete: () => void; 
  onSkip?: () => void;
}> = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--color-bg-elevated, rgba(28,28,30,0.95))',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'toastIn 0.3s ease',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s ease',
    }}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div style={{ 
        width: 36, height: 36, borderRadius: 9,
        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>D</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', marginBottom: 2 }}>
          Welcome to DEX
        </div>
        <div style={{ fontSize: 11, color: '#71717a' }}>
          Press <kbd style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1px 5px', 
            borderRadius: 4, 
            fontSize: 10,
            fontFamily: 'inherit',
          }}>?</kbd> for shortcuts
        </div>
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(onComplete, 100); }}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: 8,
          padding: '7px 14px',
          color: '#d4d4d8',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          marginLeft: 8,
        }}
      >
        OK
      </button>
    </div>
  );
};

// ==================== SHORTCUTS PANEL ====================
export const KeyboardShortcutsPanel: React.FC<{
  appId: string;
  onClose: () => void;
}> = ({ appId, onClose }) => {
  const global = KEYBOARD_SHORTCUTS.global;
  const app = KEYBOARD_SHORTCUTS[appId] || [];

  return (
    <div 
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} 
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 320,
          background: 'var(--color-bg-elevated, #1c1c1e)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5' }}>Shortcuts</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', padding: 4,
            color: '#52525b', cursor: 'pointer', display: 'flex',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: '10px 18px 18px', maxHeight: 400, overflow: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            General
          </div>
          {global.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 12, color: '#a1a1aa' }}>{s.action}</span>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: '#d4d4d8', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
            </div>
          ))}
          {app.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 14, marginBottom: 8 }}>
                {appId.charAt(0).toUpperCase() + appId.slice(1)}
              </div>
              {app.map(s => (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>{s.action}</span>
                  <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: '#d4d4d8', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
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
    background: 'var(--color-bg-elevated, #1c1c1e)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: '10px 12px',
    maxWidth: 200,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#f4f4f5', marginBottom: 2 }}>{tip.title}</div>
        <div style={{ fontSize: 10, color: '#71717a', lineHeight: 1.4 }}>{tip.content}</div>
      </div>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
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
    {icon && <div style={{ marginBottom: 16, opacity: 0.3, color: '#71717a' }}>{icon}</div>}
    {title && <div style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa', marginBottom: 4 }}>{title}</div>}
    {description && <div style={{ fontSize: 12, color: '#52525b', maxWidth: 240 }}>{description}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);

// ==================== HOOKS ====================
export const useBeginnerMode = (appId: string) => {
  const [isBeginnerMode, setIsBeginnerMode] = useState(() => {
    try { return localStorage.getItem(`dex-${appId}-beginner`) !== 'false'; } catch { return true; }
  });
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`dex-${appId}-tips`) || '[]')); } catch { return new Set(); }
  });
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);

  const tips = (APP_TIPS[appId] || []).filter(t => !dismissed.has(t.id));
  const currentTip = tips[0] || null;

  useEffect(() => {
    try { localStorage.setItem(`dex-${appId}-beginner`, String(isBeginnerMode)); } catch {}
  }, [appId, isBeginnerMode]);

  useEffect(() => {
    try { localStorage.setItem(`dex-${appId}-tips`, JSON.stringify([...dismissed])); } catch {}
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
    // Dismiss current tip and advance to the next one in the queue
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
    try { localStorage.setItem('dex-welcomed', '1'); setNeedsOnboarding(false); } catch {}
  }, []);
  return { needsOnboarding, markOnboardingComplete };
};

export default OnboardingWizard;
