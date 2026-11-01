// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Platform - Onboarding & Beginner Mode
 * Minimal first-launch experience: welcome -> required policy acceptance.
 * Users learn the product by using it; no feature tours or explanation screens.
 * Minimal, professional design matching DEX true-black aesthetic
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { POLICY_CONTACT_EMAIL, POLICY_METADATA, type PolicySlug } from '../../shared/policies';
import { acceptCurrentPolicies, hasAcceptedCurrentPolicies, setOptionalAnalyticsEnabled } from '../utils/policyConsent';
import { platform } from '../utils';
import { Z_HELP_OVERLAY_BASE } from '../../shared/zIndex';
import { useInstalledAppsStore } from '../store/installedAppsStore';
import { APP_DEFINITIONS } from '../store/runningApps';
import { Button, IconButton } from '../ui';

const PolicyViewer = React.lazy(() => import('./PolicyViewer'));

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

type OnboardingScreen = 'welcome' | 'terms';

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
    { key: `${platform.isMac ? '⌘' : 'Ctrl'}+Enter`, action: 'Run Code' },
    { key: `${platform.isMac ? '⌘' : 'Ctrl'}+F`, action: 'Find' },
    { key: `${platform.isMac ? '⌘' : 'Ctrl'}+H`, action: 'Replace' },
    { key: `${platform.isMac ? '⌘' : 'Ctrl'}+S`, action: 'Export' },
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
// Primary CTAs get a touch more horizontal presence than the Button default.
const CTA_PADDING: React.CSSProperties = { padding: '0 28px' };

// ==================== STEP INDICATOR ====================
const StepIndicator: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 'var(--space-8)' }}>
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
          transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    ))}
  </div>
);

// ==================== SCREEN: WELCOME ====================
const WelcomeScreen: React.FC<{ onNext: () => void; onSkip: () => void }> = ({ onNext, onSkip }) => (
  <div style={{ textAlign: 'center', padding: '48px 0' }}>
    <div style={{
      width: 80, height: 80, borderRadius: 18, margin: '0 auto 28px',
      background: 'linear-gradient(135deg, var(--color-accent, #3b82f6) 0%, var(--color-app-vinx, #8b5cf6) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 32px rgba(59, 130, 246, 0.25)',
    }}>
      <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent-text, #fff)', fontFamily: 'var(--dex-font-ui)', letterSpacing: '-0.02em' }}>D</span>
    </div>
    <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 var(--space-2)', letterSpacing: '-0.02em' }}>
      Welcome to DEX
    </h1>
    <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', margin: '0 0 var(--space-10)', lineHeight: 1.6 }}>
      Your personal control hub for desktop automation.
    </p>
    <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
      <Button variant="primary" size="lg" style={CTA_PADDING} onClick={onNext} aria-label="Get started with setup">Get Started</Button>
      <Button variant="ghost" size="lg" onClick={onSkip} aria-label="Skip setup wizard and review required policies">Skip Setup</Button>
    </div>
  </div>
);

// ==================== SCREEN: REQUIRED POLICIES ====================
const PolicyAcceptanceScreen: React.FC<{
  onAccept: () => void;
}> = ({ onAccept }) => {
  const [accepted, setAccepted] = useState(false);
  const [viewerSlug, setViewerSlug] = useState<PolicySlug | null>(null);
  const requiredPolicies = useMemo(() => POLICY_METADATA.filter(p => p.requiredForUse), []);
  const optionalPolicies = useMemo(() => POLICY_METADATA.filter(p => !p.requiredForUse), []);

  return (
    <div style={{ padding: 'var(--space-5) 0' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', margin: '0 0 6px', textAlign: 'center' }}>
        Terms & Privacy
      </h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 var(--space-5)', textAlign: 'center', lineHeight: 1.55 }}>
        Review and accept the required policies to continue.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {requiredPolicies.map(policy => (
          <div
            key={policy.slug}
            style={{
              background: 'var(--color-bg-secondary, #0A0A0A)',
              border: '1px solid var(--color-bg-hover)',
              borderRadius: 6,
              padding: 'var(--space-3) 14px',
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  {policy.title}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: 'var(--color-accent-subtle, rgba(74,158,255,0.12))', color: 'var(--color-accent, #4A9EFF)',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Required
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {policy.summary}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setViewerSlug(policy.slug)}
              style={{ flexShrink: 0 }}
            >
              Read
            </Button>
          </div>
        ))}
      </div>

      {optionalPolicies.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 'var(--space-4)',
          padding: '0 2px',
        }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', alignSelf: 'center', marginRight: 4 }}>
            Also available:
          </span>
          {optionalPolicies.map(policy => (
            <Button
              key={policy.slug}
              variant="ghost"
              size="sm"
              onClick={() => setViewerSlug(policy.slug)}
            >
              {policy.title}
            </Button>
          ))}
        </div>
      )}

      <label style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 'var(--space-4)',
        padding: 'var(--space-3) 14px', borderRadius: 6,
        background: accepted ? 'var(--color-accent-soft, rgba(74,158,255,0.06))' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${accepted ? 'rgba(74,158,255,0.25)' : 'var(--color-bg-hover)'}`,
        cursor: 'pointer',
        transition: 'background 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--color-accent, #4A9EFF)' }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
          I have read and accept the <strong style={{ color: 'var(--color-text-primary)' }}>Terms of Use</strong> and <strong style={{ color: 'var(--color-text-primary)' }}>Privacy Policy</strong>, including required diagnostics, optional analytics, and the data use for product improvement and model and system training described in those policies. DEX is free for everyone — no ads, no paid tiers, and your private files and secrets are never collected.
        </span>
      </label>

      <div style={{ textAlign: 'center', marginBottom: 'var(--space-3)' }}>
        <Button
          variant="primary"
          size="lg"
          style={CTA_PADDING}
          disabled={!accepted}
          onClick={onAccept}
        >
          Accept and Continue
        </Button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
        Contact {POLICY_CONTACT_EMAIL}
      </div>

      {viewerSlug && (
        <React.Suspense fallback={null}>
          <PolicyViewer initialPolicy={viewerSlug} onClose={() => setViewerSlug(null)} />
        </React.Suspense>
      )}
    </div>
  );
};

// ==================== ONBOARDING WIZARD (2 SCREENS) ====================
export const OnboardingWizard: React.FC<{
  onComplete: () => void;
  onSkip?: () => void;
}> = ({ onComplete }) => {
  const screens: OnboardingScreen[] = ['welcome', 'terms'];
  const [screenIndex, setScreenIndex] = useState(0);
  const [exiting, setExiting] = useState(false);
  // Sensible defaults are applied silently. The dedicated privacy/preferences
  // screen was removed to keep onboarding minimal; these can be changed later
  // in Settings. Optional analytics stays off until the user opts in.
  const prefs: OnboardingPreferences = {
    analyticsEnabled: false,
    crashReportsEnabled: true,
    autoUpdatesEnabled: true,
  };

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

  // Persist default preferences and close the wizard. Onboarding completes the
  // moment required policies are accepted -- users learn the product by using it.
  const finishOnboarding = useCallback(() => {
    try {
      localStorage.setItem('dex-onboarding-prefs', JSON.stringify({ ...prefs, loadSample: false }));
      setOptionalAnalyticsEnabled(prefs.analyticsEnabled);
    } catch {
      // storage unavailable
    }
    // New setups start with the essentials (core + recommended apps); optional
    // apps are one click away in the Store. Only first-run onboarding reaches
    // here, so existing users' app lists are never changed.
    useInstalledAppsStore.getState().applyEssentials(Object.keys(APP_DEFINITIONS));
    // Wire crash reporting and auto-update toggles to their respective controllers
    try {
      const electron = (window as unknown as { electron?: { diagnostics?: { setPreferences?: (p: object) => Promise<unknown> }; updates?: { setPreferences?: (p: object) => Promise<unknown> } } }).electron;
      electron?.diagnostics?.setPreferences?.({ crashReportingEnabled: prefs.crashReportsEnabled });
      electron?.updates?.setPreferences?.({ autoCheck: prefs.autoUpdatesEnabled });
    } catch { /* IPC may not be available in renderer-only mode */ }
    setExiting(true);
    setTimeout(onComplete, 300);
  }, [onComplete, prefs.analyticsEnabled, prefs.autoUpdatesEnabled, prefs.crashReportsEnabled]);

  const handleAcceptPolicies = useCallback(() => {
    acceptCurrentPolicies();
    finishOnboarding();
  }, [finishOnboarding]);

  // Required policies cannot be skipped; "Skip Setup" jumps straight to them.
  const handleSkip = useCallback(() => {
    setSlideDir('next');
    setScreenIndex(screens.indexOf('terms'));
  }, [screens]);

  const handleQuit = useCallback(() => {
    try {
      const electron = (window as unknown as { electron?: { invoke?: (ch: string, ...args: unknown[]) => Promise<unknown> } }).electron;
      if (electron?.invoke) {
        electron.invoke('app:quit').catch(() => { /* main will close us */ });
      }
    } catch {
      // best-effort; if IPC unavailable we just stop the wizard
      setExiting(true);
    }
  }, []);

  // Keyboard navigation for onboarding. The policy screen has its own gated
  // accept button, so Enter/ArrowRight only advance from the welcome screen.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && current !== 'terms') { handleSkip(); }
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && current !== 'terms') { goNext(); }
      else if (e.key === 'ArrowLeft') { goBack(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, goNext, goBack, handleSkip]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: Z_HELP_OVERLAY_BASE,
      background: 'var(--color-bg-base, #000000)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: exiting ? 0 : 1,
      transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
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
        width: '100%', maxWidth: 'min(600px, calc(100vw - 48px))', padding: '0 var(--space-8)',
        animation: 'onboardFadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <StepIndicator current={screenIndex} total={screens.length} />

        <div key={screenIndex} style={{
          animation: `${slideDir === 'next' ? 'onboardSlideNext' : 'onboardSlideBack'} 200ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}>

        {screenIndex > 0 && (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={goBack}>
              Back
            </Button>
          </div>
        )}

        {current === 'welcome' && <WelcomeScreen onNext={goNext} onSkip={handleSkip} />}
        {current === 'terms' && <PolicyAcceptanceScreen onAccept={handleAcceptPolicies} />}
        </div>

        {/* Persistent quit footer -- always visible during setup */}
        <div style={{
          marginTop: 28, paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: 'var(--color-text-tertiary, #888)',
        }}>
          <span>Setup can be re-run from Settings any time.</span>
          <button
            type="button"
            onClick={handleQuit}
            aria-label="Quit DEX setup"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent',
              color: 'var(--color-text-secondary, #bbb)',
              border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
              borderRadius: 4,
              height: 'var(--dex-control-h-sm, 28px)',
              padding: '0 var(--space-3)',
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = 'var(--color-error-muted, rgba(255, 80, 80, 0.10))';
              el.style.color = 'var(--color-error, #ff8080)';
              el.style.borderColor = 'rgba(255, 80, 80, 0.30)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = 'transparent';
              el.style.color = 'var(--color-text-secondary, #bbb)';
              el.style.borderColor = 'var(--color-border, rgba(255,255,255,0.12))';
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Quit Setup
          </button>
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
          width: 'min(320px, calc(100vw - 48px))',
          background: 'var(--color-bg-elevated, #111111)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: 'var(--pg-shadow-popover)',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-bg-hover)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Shortcuts</span>
          <IconButton
            ariaLabel="Close shortcuts"
            variant="ghost"
            size="sm"
            onClick={onClose}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            )}
          />
        </div>
        <div style={{ padding: '10px 18px 18px', maxHeight: 400, overflow: 'auto' }}>
          <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>
            General
          </div>
          {global.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.action}</span>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-secondary, #d4d4d8)', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
            </div>
          ))}
          {appShortcuts.length > 0 && (
            <>
              <div className="dex-label-caps" style={{ marginTop: 14, marginBottom: 'var(--space-2)' }}>
                {appId.charAt(0).toUpperCase() + appId.slice(1)}
              </div>
              {appShortcuts.map(s => (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.action}</span>
                  <kbd style={{ fontSize: 10, padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: 4, color: 'var(--color-text-secondary, #d4d4d8)', fontFamily: 'SF Mono, monospace' }}>{s.key}</kbd>
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
    borderRadius: 6,
    padding: '10px var(--space-3)',
    maxWidth: 200,
    boxShadow: 'var(--pg-shadow-tooltip)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{tip.title}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{tip.content}</div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss tip" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
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
    {icon && <div style={{ marginBottom: 'var(--space-4)', opacity: 0.3, color: 'var(--color-text-tertiary)' }}>{icon}</div>}
    {title && <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{title}</div>}
    {description && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', maxWidth: 240 }}>{description}</div>}
    {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
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
    try { return !localStorage.getItem('dex-welcomed') || !hasAcceptedCurrentPolicies(); } catch { return true; }
  });
  const markOnboardingComplete = useCallback(() => {
    try {
      if (!hasAcceptedCurrentPolicies()) acceptCurrentPolicies();
      localStorage.setItem('dex-welcomed', '1');
      setNeedsOnboarding(false);
    } catch (e) { console.warn('[DEX]', e); }
  }, []);
  return { needsOnboarding, markOnboardingComplete };
};

export default OnboardingWizard;
