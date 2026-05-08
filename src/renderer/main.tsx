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
import './styles/print.css';

// RC4: CSS Containment -- inject before first paint
import { injectContainmentCSS } from './utils/CSSContainment';
injectContainmentCSS();

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
    const compact = localStorage.getItem('dex-density-compact') === 'true';
    document.documentElement.style.setProperty('--density-scale', compact ? '0.85' : '1');
  } catch { /* ignore */ }
})();

// RC8: Heap Monitor -- start memory pressure tracking
import { startHeapMonitor } from './utils/HeapMonitor';
startHeapMonitor();

// Performance tier detection + animation budgets -- MUST run before first paint
import { initPerformanceSystems } from './utils/performanceIndex';
const _cleanupPerf = initPerformanceSystems();

// Wave 1: register UKI AutoPilot ActionBus handlers as soon as renderer boots
import { registerUkiActionHandlers } from './services/UkiActionHandlers';
registerUkiActionHandlers();

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
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13,
          }}>
            Recovering...
          </div>
        );
      }

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0a0f', color: '#e5e5ea', fontFamily: 'Inter, system-ui, sans-serif', gap: 16,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>DEX encountered a critical error</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: 'var(--color-accent)', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', marginTop: 8,
              boxShadow: '0 4px 16px rgba(10,132,255,0.35)',
            }}
          >Reload DEX</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
