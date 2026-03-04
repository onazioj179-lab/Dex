/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX — OS-Grade Application Framework
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @version    2.0.0
 * 
 * DEX now operates as a TRUE APPLICATION HOST SYSTEM:
 * - Native-grade sub-apps with real lifecycle
 * - System-governed states (foreground, background, suspended, terminated)
 * - Real data pipelines only - no mocks, no placeholders
 * - Fault isolation - one app crash cannot crash DEX
 * - Performance discipline with resource budgets
 * - System integrity monitoring
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useCallback, useState } from 'react';
import packageJson from '../../package.json';
import { AppManager } from './components/AppManager';
import { OnboardingWizard, useOnboardingCheck } from './components/Onboarding';
import { SystemFeatures, useSessionAutoSave } from './components/SystemFeatures';
import { CommandPalette, useCommandPalette } from './components/CommandPalette';
import { ClipboardHistory, useClipboardHistory } from './components/ClipboardHistory';
import { LockScreen } from './components/LockScreen';
import { useAuthStore } from './store/useAuthStore';
import { AppErrorBoundary } from './services/ErrorBoundary';
import { 
  initAppSubsystemIPC 
} from './store/appSubsystem';

// Services - OS-Grade System Layer
import {
  usePerformanceMonitor,
  useIntegrityMonitor,
  useSessionService,
  useSystemEvents,
} from './services';

// ═══════════════════════════════════════════════════════════════════════════
// THEME INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const initializeTheme = () => {
  try {
    const savedDarkMode = localStorage.getItem('darkMode');
    const savedSettings = localStorage.getItem('dex-settings');
    
    let isDark = true; // Default to dark mode
    
    if (savedDarkMode !== null) {
      isDark = savedDarkMode === 'true';
    } else if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      isDark = settings.darkMode ?? true;
    }
    
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
    }
    
    // Apply saved accent color
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.accentColor) {
        document.documentElement.style.setProperty('--color-accent', settings.accentColor);
        document.documentElement.style.setProperty('--accent-color', settings.accentColor);
      }
    }
  } catch (e) {
    // Default to dark mode on error
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
  }
};

// Initialize theme immediately
initializeTheme();

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const App: React.FC = () => {
  // Check if user needs onboarding
  const { needsOnboarding, markOnboardingComplete } = useOnboardingCheck();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Command Palette (Ctrl+K)
  const commandPalette = useCommandPalette();
  
  // Clipboard History (Ctrl+Shift+V)
  const clipboardHistory = useClipboardHistory();

  // Enable session auto-save
  useSessionAutoSave();

  // Initialize authentication system
  const authInitialize = useAuthStore(s => s.initialize);
  useEffect(() => {
    authInitialize();
  }, [authInitialize]);

  // Show onboarding on first launch
  useEffect(() => {
    if (needsOnboarding) {
      // Small delay to ensure app is fully loaded
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [needsOnboarding]);

  const handleOnboardingComplete = useCallback(() => {
    markOnboardingComplete();
    setShowOnboarding(false);
  }, [markOnboardingComplete]);

  const handleOnboardingSkip = useCallback(() => {
    markOnboardingComplete();
    setShowOnboarding(false);
  }, [markOnboardingComplete]);

  // Initialize IPC bridge and system services on mount
  // Sanitize inline hardcoded colors so theme switching doesn't leave white-on-white or black-on-black
  useEffect(() => {
    const sanitizeInlineColors = () => {
      try {
        const rootStyles = getComputedStyle(document.documentElement);
        const primary = (rootStyles.getPropertyValue('--color-text-primary') || 'var(--color-text-primary)').trim();
        // Find elements with inline style color set to literal white/black and replace with CSS variable
        document.querySelectorAll('[style]').forEach(el => {
          try {
            const html = el as HTMLElement;
            const s = html.style;
            if (!s) return;
            const c = (s.color || '').toString().trim().toLowerCase();
            if (!c) return;
            // Normalize common hardcoded values
            const normalized = c.replace(/\s+/g, '');
            if (normalized === 'rgb(255,255,255)' || normalized === '#fff' || normalized === '#ffffff' || normalized === 'white' || normalized === 'rgb(0,0,0)' || normalized === '#000' || normalized === '#000000' || normalized === 'black') {
              s.color = primary;
            }
          } catch (e) {
            // ignore per-element failures
          }
        });
      } catch (e) {
        // do nothing on error
      }
    };

    // Run once on mount
    sanitizeInlineColors();

    // Observe theme changes on <html data-theme="..."> and re-sanitize
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes' && (m as MutationRecord).attributeName === 'data-theme') {
          sanitizeInlineColors();
          break;
        }
      }
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    // Re-apply theme on mount (in case it wasn't applied)
    initializeTheme();
    
    // Initialize legacy app subsystem
    initAppSubsystemIPC();
    
    // Start user session
    useSessionService.getState().startSession();
    
    // Start performance monitoring
    usePerformanceMonitor.getState().startMonitoring();
    
    // Start integrity monitoring
    useIntegrityMonitor.getState().startMonitoring();
    
    // Emit startup event
    useSystemEvents.getState().emit({
      type: 'service_status',
      data: { message: 'DEX System initialized', version: packageJson.version },
      severity: 'info',
    });

    // Cleanup on unmount
    return () => {
      usePerformanceMonitor.getState().stopMonitoring();
      useIntegrityMonitor.getState().stopMonitoring();
      useSessionService.getState().endSession();
    };
  }, []);

  // Handle app launch events
  const handleAppLaunch = useCallback((_appId: string) => {
    // App launch tracked via SystemEvents
  }, []);

  return (
    <AppErrorBoundary instanceId="root" appId="dex-root" appName="DEX" appColor="var(--color-accent, #0a84ff)">
    <div style={rootStyles.container}>
      <style>{globalStyles}</style>
      
      {/* Lock Screen - blocks all interaction when locked */}
      <LockScreen />

      {/* System Features (Quick Launcher, Notifications, etc.) */}
      <SystemFeatures />
      
      {/* Command Palette - Ctrl+K */}
      <CommandPalette 
        isOpen={commandPalette.isOpen} 
        onClose={commandPalette.close} 
      />
      
      {/* Clipboard History - Ctrl+Shift+V */}
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
      
      {/* Onboarding Wizard for first-time users */}
      {showOnboarding && (
        <OnboardingWizard 
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
      
      <AppManager 
        onAppLaunch={handleAppLaunch}
      />
    </div>
    </AppErrorBoundary>
  );
};

const rootStyles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: 'var(--color-bg-base)',
    fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif)',
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

export default App;
