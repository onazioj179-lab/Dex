/**
 * ===========================================================================
 * DEX -- OS-Grade Application Framework
 * ===========================================================================
 * 
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @version    3.6.0
 * 
 * DEX now operates as a TRUE APPLICATION HOST SYSTEM:
 * - Native-grade sub-apps with real lifecycle
 * - System-governed states (foreground, background, suspended, terminated)
 * - Real data pipelines only - no mocks, no placeholders
 * - Fault isolation - one app crash cannot crash DEX
 * - Performance discipline with resource budgets
 * - System integrity monitoring
 * ===========================================================================
 */

import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import packageJson from '../../package.json';
import { useAuthStore } from './store/useAuthStore';
import { useWallpaperStore } from './store/wallpaperStore';
import { AppErrorBoundary } from './services/ErrorBoundary';
import ToastProvider from './components/Toast';
import { ModalProvider } from './shell/ModalHost';
import {
  BatchActionBar,
  FeedbackPanel,
  GlobalSearchOverlay,
  ScratchpadOverlay,
  TaskQueueStrip,
  UnifiedSystemsProvider,
} from './components/UnifiedSystems';
import { initializeTier } from './services/TierManager';
import { startAdaptivePerfMonitor } from './services/AdaptivePerfMonitor';
import { startIdlePauseCoordinator } from './utils/idlePause';
import { initComfort } from './improvements500/comfortPrefs';
import { applyAccentFamily } from './utils/accentFamily';
import { startPermissionAutoDisable, stopPermissionAutoDisable } from './store/permissionStore';
import { 
  initAppSubsystemIPC 
} from './store/appSubsystem';
import { ClipboardHistory, useClipboardHistory } from './components/ClipboardHistory';
import { useThemeScheduleStore } from './store/featureSuiteStore';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { OnboardingWizard, useOnboardingCheck } from './components/Onboarding';
import { SystemFeatures } from './components/SystemFeatures';
import { UpdateNotificationDropdown } from './components/UpdateNotificationDropdown';
import { PictureInPicture, usePiPState, closePiP } from './components/PictureInPicture';
import { MiniPlayer } from './components/MiniPlayer';
import MiniPulse from './components/MiniPulse';
import { MiniShell, useCompactMode, useCompactModeShortcut } from './shell/MiniShell';
import { useShellPreferences } from './store/shellPreferencesStore';
import { loadManifest as loadWindowManifest, flush as flushWindowManifest } from './shell/WindowManifest';

// Progressive loading (item 153): Shell + nav immediate, overlays deferred
const AppManager = lazy(() => import('./components/AppManager').then(m => ({ default: m.AppManager })));
const DiagnosticsPanel = lazy(() => import('./components/DiagnosticsPanel'));
const LockScreen = lazy(() => import('./components/LockScreen').then(m => ({ default: m.LockScreen })));
const KeyboardShortcuts = lazy(() => import('./components/KeyboardShortcuts'));
const WorkspacePresetsPanel = lazy(() => import('./components/WorkspacePresetsPanel'));

// Services - OS-Grade System Layer
import {
  usePerformanceMonitor,
  useIntegrityMonitor,
  useSessionService,
  useSystemEvents,
} from './services';
import { initXenonListener } from './store/xenonStore';
import { sharedTick } from './services/SharedTick';

// Motion system -- spring physics, reduce-motion, scrollbar styles
import { initMotionController } from './utils/MotionController';

// UI Polish -- panel animations, slider hover, focus-visible
import { GLOBAL_POLISH_CSS } from './utils/uiPolish';

// UI Polish System -- dropdowns, menus, overlays, button responsiveness, black screen prevention
import { initUIPolishSystem } from './services/UIPolishSystem';

// Screen Guard System -- comprehensive black screen prevention
import { initScreenGuardSystems } from './services/ScreenGuardSystem';

// Shortcut conflict detection
import { initializeBuiltinShortcuts } from './utils/shortcutConflictDetector';

// ===========================================================================
// THEME INITIALIZATION
// ===========================================================================

const initializeTheme = () => {
  // Respect saved preference, default to dark
  const savedDarkMode = localStorage.getItem('darkMode');
  const isDark = savedDarkMode === null ? true : savedDarkMode !== 'false';
  const theme = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('dark-mode', isDark);
  document.body.classList.toggle('light-mode', !isDark);
  document.documentElement.classList.toggle('dark-mode', isDark);
  document.documentElement.classList.toggle('light-mode', !isDark);
  try {
    const savedSettings = localStorage.getItem('dex-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      // Only apply a REAL color literal. A stored sentinel like
      // 'var(--color-accent)' (a prior "auto/default" marker) would set
      // --color-accent to reference itself -> circular -> the property
      // resolves to empty app-wide, so every var(--color-accent) fell back to
      // its hardcoded dark-blue and accent never themed to light mode.
      if (settings.accentColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$|^rgb/i.test(String(settings.accentColor).trim())) {
        applyAccentFamily(String(settings.accentColor).trim());
      }
    }
  } catch (_) {
    // accent color load failed -- defaults are fine
  }
};

// Theme is initialized in the main useEffect to avoid double calls
// initializeTheme() removed from module scope (was duplicate)

// Item 78: Sync system accent color from OS (async, non-blocking)
(async () => {
  try {
    const hasUserAccent = localStorage.getItem('dex-accent-color');
    if (hasUserAccent) return; // User has manually set accent -- respect it
    const api = (window as any).electronAPI;
    const osColor = await api?.theme?.getSystemAccentColor?.();
    if (osColor && /^#[0-9a-f]{6}$/i.test(osColor)) {
      applyAccentFamily(osColor);
    }
  } catch {
    // OS accent detection unavailable
  }
})();

// Item 139: DNS prefetch for common resources loaded during session
if (typeof document !== 'undefined') {
  const prefetchOrigins = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  for (const origin of prefetchOrigins) {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = origin;
    document.head.appendChild(link);
  }
}

// Startup budget enforcement (item 152): track first paint + interactive milestones
const STARTUP_MARK = performance.now();

// Detect device perf tier immediately at module load so first paint respects it
// 5-tier system: lowest | low | mid | high | ultra — managed by TierManager
(() => {
  const tier = initializeTier();
  // Apply user comfort/accessibility prefs (reduce-motion / contrast / text
  // scale) early so first paint already respects them. No-op until opted in.
  try { initComfort(); } catch { /* non-fatal */ }
  // Start adaptive perf monitor (silently downgrades tier on sustained jank or thermal heat)
  try { startAdaptivePerfMonitor(); } catch { /* non-fatal */ }
  // Apple-style idle pause coordinator: when the window is hidden, blurred,
  // or the user has been inactive for a while, broadcast 'dex:idle-pause' so
  // background app work (polling, animations, playback timers) can suspend.
  // UI stays mounted and visible -- only in-app work pauses.
  try { startIdlePauseCoordinator(); } catch { /* non-fatal */ }
  const screenH = Math.min(window.screen.height, window.screen.width);
  // Also store screen class for responsive layouts
  if (screenH <= 480) document.documentElement.setAttribute('data-screen-class', 'small');
  else if (screenH <= 768) document.documentElement.setAttribute('data-screen-class', 'medium');
  console.debug(`[DEX] Device tier: ${tier}`);
})();

// Permission auto-disable timer is started in App component useEffect with cleanup
if (typeof PerformanceObserver !== 'undefined') {
  try {
    const paintObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.startTime);
        if (entry.name === 'first-contentful-paint') {
          console.debug(`[DEX] First Contentful Paint: ${ms}ms${ms > 2000 ? ' [!] OVER BUDGET (2s)' : ''}`);
        }
      }
      paintObs.disconnect();
    });
    paintObs.observe({ type: 'paint', buffered: true });
  } catch {
    // PerformanceObserver not supported
  }
}

// ===========================================================================
// FIRST-LAUNCH DATA SEEDING
// ===========================================================================
// First-launch data initialisation (no demo content — fresh start for users)
// ===========================================================================

const seedFirstLaunchData = () => {
  if (localStorage.getItem('dex-data-seeded')) return;
  localStorage.setItem('dex-data-seeded', '1');

  // Seed empty collections so pages initialise cleanly
  if (!localStorage.getItem('dex-tasks')) {
    localStorage.setItem('dex-tasks', JSON.stringify([]));
  }
  if (!localStorage.getItem('dex-notes')) {
    localStorage.setItem('dex-notes', JSON.stringify([]));
  }
};

// Run seed on load
seedFirstLaunchData();

// ===========================================================================
// MAIN APP COMPONENT
// ===========================================================================

export const App: React.FC = () => {
  // Command Palette (Ctrl+K)
  const commandPalette = useCommandPalette();
  
  // Clipboard History (Ctrl+Shift+V, or the compact-mode quick action)
  const clipboardHistory = useClipboardHistory();
  const clipboardOpen = clipboardHistory.open;
  useEffect(() => {
    const onOpenClipboard = () => clipboardOpen();
    window.addEventListener('dex-open-clipboard', onOpenClipboard);
    return () => window.removeEventListener('dex-open-clipboard', onOpenClipboard);
  }, [clipboardOpen]);
  
  // Picture-in-Picture video state
  const pipState = usePiPState();

  // First-run onboarding
  const { needsOnboarding, markOnboardingComplete } = useOnboardingCheck();

  // System Diagnostics overlay (Ctrl+Shift+D)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const miniPulseEnabled = useShellPreferences(s => s.miniPulseEnabled);

  // Compact / mini always-on-top mode (Ctrl+Shift+M)
  useCompactModeShortcut();
  const compactMode = useCompactMode(s => s.compact);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setDiagnosticsOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Wallpaper state for global layer
  const wpMode = useWallpaperStore(s => s.mode);
  const wpValue = useWallpaperStore(s => s.value);
  const wpBlur = useWallpaperStore(s => s.blur);
  const wallpaperBg = useMemo((): React.CSSProperties => {
    if (wpMode === 'image') return { backgroundImage: `url("${wpValue}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    if (wpMode === 'gradient') return { backgroundImage: wpValue };
    if (wpMode === 'live') return { background: 'var(--color-bg-base)' };
    return { backgroundColor: wpValue };
  }, [wpMode, wpValue]);

  // Initialize authentication system
  const authInitialize = useAuthStore(s => s.initialize);
  const authLock = useAuthStore(s => s.lock);
  const authIsEnabled = useAuthStore(s => s.isEnabled);
  const authIsLocked = useAuthStore(s => s.isLocked);
  useEffect(() => {
    authInitialize();
  }, [authInitialize]);

  // Permission auto-disable timer - revokes unused permissions after 15 min
  useEffect(() => {
    startPermissionAutoDisable();
    return () => stopPermissionAutoDisable();
  }, []);

  // Auto-lock on inactivity. Disabled by default (0 = Never) so the desktop session
  // stays visually persistent during idle. Only arms when the user has BOTH enabled an
  // auth method AND set a non-zero auto-lock minutes value in Settings.
  useEffect(() => {
    if (!authIsEnabled || authIsLocked) return;
    let raw = 0;
    try {
      const saved = localStorage.getItem('dex-settings');
      if (saved) { raw = JSON.parse(saved).autoLockMinutes ?? 0; }
    } catch { /* defaults */ }
    const minutes = Number(raw);
    if (!minutes || minutes <= 0) return;
    const ms = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { authLock(); }, ms);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [authIsEnabled, authIsLocked, authLock]);

  // Item 140: Unified memory pressure detection — sets memory-pressure attribute
  // for selective CSS to hide decorative elements when heap is very high.
  // Note: we no longer auto-downgrade `data-perf-tier` from this check —
  // doing so caused the UI to silently revert to the "low" stylesheet
  // (no backdrop-filter, no transitions, no shadows = "boxy black") after
  // any prolonged session because heap usage naturally drifts upward.
  // The hardware-detected tier is the source of truth.
  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      try {
        let usedMB = 0;
        if (typeof (performance as any).measureUserAgentSpecificMemory === 'function') {
          const info = await (performance as any).measureUserAgentSpecificMemory();
          usedMB = info.bytes / (1024 * 1024);
        } else if ((performance as any).memory) {
          usedMB = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
        }
        // Memory pressure attribute for CSS hiding of decorative elements
        const pressure = usedMB > 1200 ? 'high' : usedMB > 800 ? 'moderate' : '';
        if (pressure) {
          document.documentElement.setAttribute('data-memory-pressure', pressure);
        } else {
          document.documentElement.removeAttribute('data-memory-pressure');
        }
      } catch { /* not supported */ }
    };

    const startup = setTimeout(() => {
      check();
      sharedTick.subscribe('app-mem-pressure', check, 60_000);
    }, 8000);

    return () => { stopped = true; clearTimeout(startup); sharedTick.unsubscribe('app-mem-pressure'); document.documentElement.removeAttribute('data-memory-pressure'); };
  }, []);

  // Initialize IPC bridge and system services on mount
  // Item 141: Sanitize inline hardcoded colors so theme switching works correctly
  useEffect(() => {
    const HARDCODED_COLORS = new Set([
      'rgb(255,255,255)', '#fff', '#ffffff', 'white',
      'rgb(0,0,0)', '#000', '#000000', 'black',
    ]);

    const sanitizeInlineColors = () => {
      try {
        const rootStyles = getComputedStyle(document.documentElement);
        const primary = (rootStyles.getPropertyValue('--color-text-primary') || 'var(--color-text-primary)').trim();
        // Limit scope to main content area instead of entire document
        const scope = document.getElementById('dex-main-content') || document.body;
        // Only scan top-level children to avoid deep DOM walks
        const els = scope.querySelectorAll(':scope > [style*="color"], :scope > * > [style*="color"]');
        els.forEach(el => {
          try {
            const html = el as HTMLElement;
            const c = (html.style.color || '').trim().toLowerCase().replace(/\s+/g, '');
            if (c && HARDCODED_COLORS.has(c)) {
              html.style.color = primary;
            }
          } catch {
            // ignore per-element failures
          }
        });
      } catch {
        // do nothing on error
      }
    };

    // Only sanitize on theme change, not on mount (CSS vars handle it now)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(sanitizeInlineColors, 500);
          break;
        }
      }
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => { obs.disconnect(); if (debounceTimer) clearTimeout(debounceTimer); };
  }, []);
  // Apply the saved auto-theme schedule on boot, then re-check every minute so
  // scheduled/solar modes flip light<->dark at their configured times. Pull-based
  // (reads theme-schedule:getInfo + resolves locally) — no native timer needed.
  useEffect(() => {
    useThemeScheduleStore.getState().loadInfo();
    const id = setInterval(() => useThemeScheduleStore.getState().applyNow(), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Re-apply theme on mount (in case it wasn't applied)
    initializeTheme();

    // Suppress the browser/OS native context menu globally so the user never
    // sees the translucent native menu on right-click. Custom React menus
    // (which call e.preventDefault() in their own handlers and open via
    // onContextMenu before this listener fires) still work normally.
    const suppressNativeContext = (e: MouseEvent) => { e.preventDefault(); };
    document.addEventListener('contextmenu', suppressNativeContext);

    // === CRITICAL PATH (must run immediately) ===
    // Initialize motion system (spring physics, reduce-motion, scrollbar styles)
    initMotionController();
    
    // Initialize UI polish system (dropdowns, menus, button responsiveness, black screen prevention)
    initUIPolishSystem();
    
    // Initialize comprehensive screen guard (prevents black screen after sleep/wake)
    initScreenGuardSystems();
    
    // Initialize legacy app subsystem
    initAppSubsystemIPC();

    // Initialize Xenon push-model listener (replaces renderer polling for system metrics)
    const cleanupXenon = initXenonListener();
    
    // Start user session
    useSessionService.getState().startSession();

    // Restore previous session's window manifest (best-effort, ignored if missing)
    try {
      const restored = loadWindowManifest();
      if (restored) {
        useSystemEvents.getState().emit({
          type: 'service_status',
          data: { message: `Window manifest restored (${restored.windows.length} windows)`, ts: restored.capturedAt },
          severity: 'info',
        });
      }
    } catch {
      // non-fatal
    }

    // Flush window manifest synchronously before the renderer is torn down.
    const onBeforeUnload = () => {
      try { flushWindowManifest(); } catch { /* non-fatal */ }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // === DEFERRED: non-critical init via requestIdleCallback (item 144) ===
    const idleInit = () => {
      // Initialize shortcut conflict detection
      initializeBuiltinShortcuts();
      
      // Start performance monitoring
      usePerformanceMonitor.getState().startMonitoring();
      
      // Start integrity monitoring
      useIntegrityMonitor.getState().startMonitoring();
      
      // Item 142: Detect device capabilities — REMOVED (module-level IIFE already sets
      // data-perf-tier with full WebGL/GPU/screen checks; this deferred version
      // was overwriting ultra-low → low and high → mid incorrectly)

      // Item 143: Report startup completion time
      const startupDuration = Math.round(performance.now() - STARTUP_MARK);
      console.debug(`[DEX] Startup complete: ${startupDuration}ms`);

      // Emit startup event
      useSystemEvents.getState().emit({
        type: 'service_status',
        data: { message: 'DEX System initialized', version: packageJson.version, startupMs: startupDuration },
        severity: 'info',
      });
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(idleInit, { timeout: 3000 });
    } else {
      setTimeout(idleInit, 200);
    }

    // Cleanup on unmount
    return () => {
      document.removeEventListener('contextmenu', suppressNativeContext);
      window.removeEventListener('beforeunload', onBeforeUnload);
      try { flushWindowManifest(); } catch { /* non-fatal */ }
      cleanupXenon();
      usePerformanceMonitor.getState().stopMonitoring();
      useIntegrityMonitor.getState().stopMonitoring();
      useSessionService.getState().endSession();
    };
  }, []);

  return (
    <AppErrorBoundary instanceId="root" appId="dex-root" appName="DEX" appColor="var(--color-accent, #0a84ff)">
    <ToastProvider>
    <UnifiedSystemsProvider>
    <ModalProvider>
    <div style={rootStyles.container}>
      <style>{globalStyles}{GLOBAL_POLISH_CSS}{titlebarStyles}</style>
      
      {/* Window drag region for frameless window (Windows) */}
      <div className="dex-window-titlebar" aria-hidden="true" />
      
      {/* Skip to content link for keyboard/screen reader users */}
      <a className="skip-to-content" href="#dex-main-content">
        Skip to content
      </a>
      
      {/* First-run onboarding wizard */}
      {needsOnboarding && (
        <Suspense fallback={null}>
          <OnboardingWizard onComplete={markOnboardingComplete} onSkip={markOnboardingComplete} />
        </Suspense>
      )}

      {/* Lock Screen - blocks all interaction when locked */}
      <AppErrorBoundary instanceId="lockscreen" appId="lockscreen" appName="Lock Screen" appColor="#ff453a">
      <Suspense fallback={null}>
        <LockScreen />
      </Suspense>
      </AppErrorBoundary>

      {/* System Features (Quick Launcher, Notifications, etc.) */}
      <AppErrorBoundary instanceId="sysfeatures" appId="sysfeatures" appName="System Features" appColor="#30d158">
      <Suspense fallback={null}>
        <SystemFeatures />
      </Suspense>
      </AppErrorBoundary>

      {/* v4.0.0: Update notification + Pro 30-day downgrade dropdown (always available) */}
      <AppErrorBoundary instanceId="update-dropdown" appId="update-dropdown" appName="Update Notification" appColor="#0a84ff">
        <UpdateNotificationDropdown />
      </AppErrorBoundary>
      
      {/* Unified Systems Overlays — deferred (item 153) */}
      <AppErrorBoundary instanceId="unified-overlays" appId="unified-overlays" appName="Unified Systems" appColor="#5e5ce6">
      <Suspense fallback={null}>
        <GlobalSearchOverlay />
        <ScratchpadOverlay />
        <FeedbackPanel />
        <TaskQueueStrip />
        <BatchActionBar />
        <KeyboardShortcuts />
        <WorkspacePresetsPanel />
      </Suspense>
      </AppErrorBoundary>
      
      {/* Command Palette - Ctrl+K */}
      <AppErrorBoundary instanceId="cmdpalette" appId="cmdpalette" appName="Command Palette" appColor="#ff9f0a">
      <Suspense fallback={null}>
        <CommandPalette 
          isOpen={commandPalette.isOpen} 
          onClose={commandPalette.close} 
        />
      </Suspense>
      </AppErrorBoundary>
      
      {/* Clipboard History - Ctrl+Shift+V */}
      <AppErrorBoundary instanceId="clipboard" appId="clipboard" appName="Clipboard History" appColor="#64d2ff">
      <Suspense fallback={null}>
        <ClipboardHistory
          isOpen={clipboardHistory.isOpen}
          onClose={clipboardHistory.close}
          onSelect={(content: string) => {
            // Paste selected clipboard content into active element
          const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
          if (el && ('value' in el)) {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, start) + content + el.value.slice(end);
            el.selectionStart = el.selectionEnd = start + content.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }}
      />
      </Suspense>
      </AppErrorBoundary>

      {/* Picture-in-Picture Video Player */}
      {pipState && (
        <PictureInPicture
          src={pipState.src}
          poster={pipState.poster}
          title={pipState.title}
          onClose={closePiP}
        />
      )}

      {/* Global music remote — persists playback control across the whole app */}
      <MiniPlayer />

      {/* System Diagnostics overlay (Ctrl+Shift+D) */}
      {diagnosticsOpen && (
        <Suspense fallback={null}>
          <DiagnosticsPanel open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
        </Suspense>
      )}

      {/* Mini Pulse -- always-on-top system monitor pill (opt-in via shell prefs) */}
      {miniPulseEnabled && (
        <MiniPulse
          hidden={diagnosticsOpen}
          onExpand={() => setDiagnosticsOpen(true)}
        />
      )}

      {/* Compact / mini always-on-top mode — overlays the shell while the apps
          keep running underneath, so expanding returns to the exact state. */}
      {compactMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999 }}>
          <MiniShell />
        </div>
      )}

      {/* Global wallpaper layer -- sits behind everything, reacts to wallpaper store */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: -2,
        ...wallpaperBg,
        filter: wpBlur > 0 ? `blur(${wpBlur}px)` : undefined,
        transform: wpBlur > 0 ? 'scale(1.05)' : undefined,
        transition: 'background 0.5s ease, filter 0.4s ease',
        willChange: wpBlur > 0 ? 'transform, filter' : 'auto',
      }} />

      <div id="dex-main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <Suspense fallback={(
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(12,12,14,0.36), rgba(12,12,14,0.18))',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
            letterSpacing: '0.01em',
          }}>
            Restoring home...
          </div>
        )}>
          <AppManager />
        </Suspense>
      </div>
    </div>
    </ModalProvider>
    </UnifiedSystemsProvider>
    </ToastProvider>
    </AppErrorBoundary>
  );
};

const rootStyles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'transparent',
    fontFamily: 'var(--dex-font-ui)',
    transition: 'background-color 0.3s ease, color 0.3s ease',
  },
};

// Global styles - minimal, design-system.css handles the rest
const globalStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  /* Theme transition for smooth light/dark switching */
  html, body, #root {
    transition: 
      background-color var(--duration-theme, 0.3s) var(--ease-default, ease),
      color var(--duration-theme, 0.3s) var(--ease-default, ease);
  }
`;

// Titlebar drag region for frameless Windows
// NOTE: pointer-events: none so it doesn't block window controls
// The -webkit-app-region: drag still works for window dragging
const titlebarStyles = `
  .dex-window-titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    -webkit-app-region: drag;
    z-index: 50;
    pointer-events: none;
  }
`;

export default App;
