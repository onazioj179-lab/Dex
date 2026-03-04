/**
 * DEX First-Launch Hint
 * One-line contextual hint shown on first visit to each app.
 * Dismisses permanently (localStorage) after first action or explicit close.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ==================== HINT MESSAGES ====================
const HINTS: Record<string, string> = {
  videoeditor: 'Import media to start editing. Press ? for all shortcuts.',
  imosion: 'Add a track and start recording. Press ? for shortcuts.',
  prism: 'Open an image or create a canvas. Press ? for help.',
  flux: 'Add a layer to begin compositing. Press ? for help.',
  forge: 'Drop files to start encoding. Press Enter to begin.',
  rewind: 'Search your screen history or browse the timeline.',
  files: 'Browse folders in the sidebar. Double-click to open.',
  browser: 'Type a URL and press Enter to navigate.',
  notes: 'Click + to create a note. Ctrl+B for bold.',
  tasks: 'Type and press Enter to add a task.',
  audio: 'Import or select a track to start playing.',
  video: 'Select a video from the library to play.',
  gallery: 'Import images or browse your collection.',
  transfers: 'Drag files to share or enable Link Share.',
  dashboard: 'View running apps and system info.',
  workflows: 'Create automated workflows with triggers and actions.',
  calculator: 'Type numbers and operators to calculate.',
  calendar: 'Click a date to view or add events.',
  passwordgenerator: 'Set options and click Generate.',
  settings: 'Adjust theme, accent colour, and preferences.',
  power: 'Shut down, restart, or sleep DEX.',
  home: 'Click any app to launch it. Ctrl+K for command palette.',
};

// ==================== STORAGE KEY ====================
function storageKey(appId: string): string {
  return `dex-hint-dismissed-${appId}`;
}

function isHintDismissed(appId: string): boolean {
  try {
    return localStorage.getItem(storageKey(appId)) === '1';
  } catch {
    return true;
  }
}

function dismissHint(appId: string): void {
  try {
    localStorage.setItem(storageKey(appId), '1');
  } catch {}
}

// ==================== COMPONENT ====================
interface FirstLaunchHintProps {
  appId: string;
}

const FirstLaunchHint: React.FC<FirstLaunchHintProps> = ({ appId }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isHintDismissed(appId) && HINTS[appId]) {
      setVisible(true);
    }
  }, [appId]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    dismissHint(appId);
  }, [appId]);

  // Auto-dismiss on any user interaction after a brief delay
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const onInteract = () => {
        handleDismiss();
        window.removeEventListener('click', onInteract);
        window.removeEventListener('keydown', onInteract);
      };
      window.addEventListener('click', onInteract, { once: true });
      window.addEventListener('keydown', onInteract, { once: true });
      return () => {
        window.removeEventListener('click', onInteract);
        window.removeEventListener('keydown', onInteract);
      };
    }, 500);
    return () => clearTimeout(timer);
  }, [visible, handleDismiss]);

  if (!visible || !HINTS[appId]) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 16px',
      background: 'var(--color-bg-elevated, rgba(28,28,30,0.95))',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      animation: 'hintFadeIn 0.3s ease-out',
    }}>
      <style>{`
        @keyframes hintFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);  }
        }
      `}</style>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #007aff)" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #a1a1aa)', whiteSpace: 'nowrap' }}>
        {HINTS[appId]}
      </span>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-tertiary, #52525b)',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// ==================== HOOK ====================
export function useFirstLaunchHint(appId: string) {
  const [shown, setShown] = useState(() => !isHintDismissed(appId) && !!HINTS[appId]);

  const dismiss = useCallback(() => {
    setShown(false);
    dismissHint(appId);
  }, [appId]);

  return { shown, dismiss };
}

export default FirstLaunchHint;
