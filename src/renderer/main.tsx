/**
 * ===========================================================================
 * DEX -- Renderer Entry Point
 * ===========================================================================
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './styles/design-system.css';
import './styles/design-tokens.css'; // canonical token layer — load last (authoritative)
import './styles/print.css';

// Electron->Tauri migration (GOAL-6A): install the window.dex / window.electron
// compatibility layer FIRST — before any service reads window.dex — so the
// renderer's IPC calls route to the native dex_ipc dispatcher under the Tauri
// shell. This is a no-op under Electron (where the real preload provides them).
import { installTauriCompat } from './services/platform/tauriCompat';
installTauriCompat();

// Multi-window: if this renderer was opened as a detached single-app OS window
// (`?detached=<appId>`, created by the native multiwindow:detach handler), put
// the shell into single-app mode and auto-open that app. No-op in the main
// window. Runs before React mounts so the chrome-hiding CSS applies pre-paint.
import { initDetachedWindow } from './services/detachedWindow';
initDetachedWindow();

// RC4: CSS Containment -- inject before first paint
import { injectContainmentCSS } from './utils/CSSContainment';
injectContainmentCSS();

// Memory pressure bridge: forward main-process pressure events to dexBus +
// degrade animations + pause FrameGovernor on critical pressure.
import './utils/MemoryPressureBridge';

// Compositor health: watch FrameGovernor for sustained over-budget frames
// and advertise pressure via data-compositor-pressure.
import { initCompositorHealth } from './utils/CompositorHealth';
initCompositorHealth();

// Font sharpness: set DPI attribute once at startup for CSS rules
(() => {
  const dpr = window.devicePixelRatio || 1;
  let dpi: string;
  if (dpr >= 1.9) dpi = '2';
  else if (dpr >= 1.4) dpi = '1.5';
  else if (dpr >= 1.15) dpi = '1.25';
  else dpi = '1';
  document.documentElement.setAttribute('data-dpi', dpi);
})();

// Touch mode auto-detect -- flip data-touch-mode="on" the first time we see
// a touch or pen pointer event. User can pin via Settings -> Input
// (localStorage key: dex-touch-mode = 'on' | 'off' | 'auto').
(() => {
  try {
    const pinned = localStorage.getItem('dex-touch-mode');
    if (pinned === 'on') {
      document.documentElement.setAttribute('data-touch-mode', 'on');
      return;
    }
    if (pinned === 'off') return;
    const onFirstTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        document.documentElement.setAttribute('data-touch-mode', 'on');
        window.removeEventListener('pointerdown', onFirstTouch, true);
      }
    };
    window.addEventListener('pointerdown', onFirstTouch, true);
  } catch { /* localStorage may be unavailable */ }
})();

// User text-size + density preferences -- apply before first paint
(() => {
  try {
    const raw = localStorage.getItem('dex-font-scale');
    const v = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(v) && v >= 0.8 && v <= 1.4) {
      document.documentElement.style.setProperty('--font-scale', String(v));
    }
  } catch { /* ignore */ }
  try {
    // Apply the saved UI density before first paint to avoid a reflow once
    // comfortPrefs.initComfort() runs at React mount. Canonical store is
    // 'dex:comfort'; the value maps straight to the data-density attribute that
    // the consolidated density tokens in design-system.css consume.
    const raw = localStorage.getItem('dex:comfort');
    const density = raw ? (JSON.parse(raw).density as string) : undefined;
    if (density === 'compact' || density === 'comfortable') {
      document.documentElement.setAttribute('data-density', density);
    }
  } catch { /* ignore */ }
})();

// Theme: respect user choice or follow OS prefers-color-scheme live
import { initTheme } from './utils/theme';
initTheme();

import { initIdleContinuity } from './services/IdleContinuity';
initIdleContinuity();

// Reduced-motion: mirror OS preference + user override into a data-attribute
// so any component (or CSS rule) can read the *effective* setting in one place.
(() => {
  try {
    const root = document.documentElement;
    const apply = () => {
      const userPref = localStorage.getItem('dex-reduced-motion'); // 'on' | 'off' | null (auto)
      const sysReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const effective = userPref === 'on' ? true : userPref === 'off' ? false : sysReduce;
      root.setAttribute('data-reduced-motion', effective ? 'on' : 'off');
    };
    apply();
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', apply);
    window.addEventListener('storage', e => { if (e.key === 'dex-reduced-motion') apply(); });
    window.addEventListener('dex-reduced-motion-changed', apply);
  } catch { /* ignore */ }
})();

// RC8: Heap Monitor -- start memory pressure tracking
import { startHeapMonitor } from './utils/HeapMonitor';
startHeapMonitor();

// Performance tier detection + animation budgets -- MUST run before first paint
import { initPerformanceSystems } from './utils/performanceIndex';
const _cleanupPerf = initPerformanceSystems();

// Track K1: hardware-class system tier detection (low/mid/high). Adapts blur,
// animation duration, and shadow magnitudes via CSS variables. Detection runs
// once and caches; subsequent reads are synchronous via getSystemTier().
import { detectSystemTier } from './services/SystemTier';
void detectSystemTier();

// Track D: forward renderer console.warn/console.error to electron-log so real
// production failures are persisted to disk even with devtools closed.
import { installConsoleBridge } from './utils/consoleBridge';
installConsoleBridge();

// Track K6: proactive cache flush + worker throttle on idle transitions.
import { startIdleResourceBalancer } from './services/IdleResourceBalancer';
startIdleResourceBalancer();

// Wave 1: register UKI AutoPilot ActionBus handlers as soon as renderer boots
import { registerUkiActionHandlers } from './services/UkiActionHandlers';
registerUkiActionHandlers();

// Phase 6: install global precision-slider behavior (wheel = step, shift = fine)
import { installPrecisionSliders } from './utils/precisionSliders';
installPrecisionSliders();

// Phase 6: install gaming-mode fullscreen listeners (Escape / OS exit teardown)
import { installGamingListeners } from './utils/gamingMode';
installGamingListeners();

// Window focus tracking -- pause animations & hide decorative elements when DEX is background
(() => {
  const root = document.documentElement;
  window.addEventListener('focus', () => root.setAttribute('data-window-focus', 'focused'));
  window.addEventListener('blur', () => root.setAttribute('data-window-focus', 'blurred'));
  root.setAttribute('data-window-focus', document.hasFocus() ? 'focused' : 'blurred');
})();

// RC12: Health Responder -- answer main process pings
import { initHealthResponder } from './utils/HealthResponder';
initHealthResponder();

// W1: Proactive renderer→main heartbeat (freeze detection)
import { startRendererHeartbeat } from './utils/RendererHeartbeat';
startRendererHeartbeat();

// W1: Renderer-side memory sentinel (heap pressure callbacks)
import { memorySentinel, type MemoryPressureEvent } from './utils/MemorySentinel';
import { rendererLogger } from './utils/rendererLogger';
memorySentinel.on('high', (e: MemoryPressureEvent) =>
  rendererLogger.warn('memory.pressure.high', { heapUsedMB: e.heapUsedMB, utilization: e.utilization }),
);
memorySentinel.on('critical', (e: MemoryPressureEvent) => {
  rendererLogger.error('memory.pressure.critical', { heapUsedMB: e.heapUsedMB, utilization: e.utilization });
  const bridge = (window as any).dex || (window as any).electron || (window as any).dexAPI;
  bridge?.invoke?.('render-error:report', { kind: 'memory-pressure', heapUsedMB: e.heapUsedMB, utilization: e.utilization }).catch(() => {});
});
memorySentinel.start();

// W1: Global error + unhandled-rejection handlers. Surface to logger and main
// without ever throwing. The RootErrorBoundary below catches React render
// errors; these listeners catch everything outside React's render path
// (event handlers, async effects, microtasks).
(() => {
  const reportToMain = (kind: 'error' | 'unhandledrejection', payload: Record<string, unknown>) => {
    try {
      const dex = (window as any).dex || (window as any).electron || (window as any).dexAPI;
      if (dex?.invoke) {
        dex.invoke('render-error:report', { kind, ...payload, t: Date.now() })
          .catch(() => { /* main may be down; logger has it */ });
      }
    } catch { /* IPC unavailable; logger still recorded it */ }
  };

  window.addEventListener('error', (ev: ErrorEvent) => {
    const err = ev.error instanceof Error ? ev.error : new Error(ev.message || 'unknown error');
    // eslint-disable-next-line no-console
    console.warn('[DEX] window.onerror:', err.message);
    reportToMain('error', {
      message: err.message,
      stack: err.stack,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    });
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    // eslint-disable-next-line no-console
    console.warn('[DEX] unhandledrejection:', message);
    reportToMain('unhandledrejection', { message, stack });
  });
})();


// DTP: Transfer notification service for inner apps
import { initTransferNotifications } from './services/TransferNotifications';
initTransferNotifications();

// UKI: Voice assistant renderer bridge
import { initUkiRendererBridge } from './services/ukiBridge';
initUkiRendererBridge();

// THERMAL: Adaptive performance monitor (rAF jank + main thermal signals)
import { startThermalAdaptiveMonitor } from './services/ThermalAdaptiveMonitor';
startThermalAdaptiveMonitor();

// Cleanup on window close — stop SharedTick, performance systems
import { sharedTick } from './services/SharedTick';
window.addEventListener('beforeunload', () => {
  sharedTick.destroy();
  if (typeof _cleanupPerf === 'function') _cleanupPerf();
});

// Top-level error boundary to prevent unrecoverable white screen
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error; recoveryAttempts: number }
> {
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private firstErrorAt = 0;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, recoveryAttempts: 0 };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[DEX] Fatal render error:', error);

    // Report to main process via IPC
    try {
      const dex = (window as any).dex;
      if (dex?.invoke) {
        dex.invoke('render-error:report', {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: Date.now(),
        }).catch((e: unknown) => { console.warn('[DEX]', e); });
      }
    } catch { /* IPC may not be available */ }

    if (this.firstErrorAt === 0) this.firstErrorAt = Date.now();

    // Auto-recovery: attempt up to 3 times within 10 seconds
    const withinWindow = Date.now() - this.firstErrorAt < 10_000;
    if (this.state.recoveryAttempts < 3 && withinWindow) {
      this.recoveryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: undefined,
          recoveryAttempts: prev.recoveryAttempts + 1,
        }));
      }, 1000);
    }
  }
  componentWillUnmount() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }
  render() {
    if (this.state.hasError) {
      const canAutoRecover = this.state.recoveryAttempts < 3 &&
        (Date.now() - this.firstErrorAt < 10_000);

      if (canAutoRecover) {
        // Show brief recovering state
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', background: '#0a0a0f', color: '#71717a',
            fontFamily: 'var(--dex-font-ui)', fontSize: 13,
          }}>
            Recovering...
          </div>
        );
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0a0f', color: '#e5e5ea', fontFamily: 'var(--dex-font-ui)', gap: 'var(--space-4)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12,
            background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>DEX needs to restart</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 400, textAlign: 'center' }}>
            Something went wrong and DEX has to reload. Your data is safe — reloading will restore your workspace.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', marginTop: 'var(--space-2)',
              boxShadow: '0 4px 16px rgba(10,132,255,0.35)',
            }}
          >Reload DEX</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root')!;

// Reuse a single React root across module re-evaluations. Vite HMR (and any
// accidental double-import) can re-run this module; calling createRoot() twice
// on the same node warns and can detach the tree. Caching the root on the
// window keeps exactly one root for the node -- a single createRoot in
// production, and a clean re-render (not a re-mount) on hot updates.
const rootHost = window as unknown as { __dexReactRoot?: ReturnType<typeof ReactDOM.createRoot> };
const root = rootHost.__dexReactRoot ?? (rootHost.__dexReactRoot = ReactDOM.createRoot(container));

root.render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
