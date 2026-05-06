// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Screen Guard System
// Comprehensive black screen prevention and recovery
// =============================================================================

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface HealthMetrics {
  lastRepaint: number;
  consecutiveBlankFrames: number;
  lastVisibilityChange: number;
  recoveryAttempts: number;
}

type RecoveryStrategy = 'opacity' | 'reflow' | 'containment' | 'force' | 'reload';

// ---------------------------------------------------------------------------
// SCREEN GUARD
// Prevents and recovers from black/blank screen issues
// ---------------------------------------------------------------------------

class ScreenGuardSystem {
  private metrics: HealthMetrics = {
    lastRepaint: Date.now(),
    consecutiveBlankFrames: 0,
    lastVisibilityChange: Date.now(),
    recoveryAttempts: 0,
  };
  
  private isMonitoring = false;
  private rafId: number = 0;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryInProgress = false;
  private listeners: Set<(event: string) => void> = new Set();

  /**
   * Initialize the screen guard system
   */
  initialize(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // 1. Visibility change handler (tab switch, sleep/wake)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // 2. Window focus handler
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('blur', this.handleWindowBlur);

    // 3. Page show/hide (bfcache)
    window.addEventListener('pageshow', this.handlePageShow);

    // 4. Electron IPC events (sleep/wake/resume)
    this.attachIPCListeners();

    // 5. Start continuous health monitoring
    this.startHealthMonitoring();

    // 6. Start frame monitoring
    this.startFrameMonitoring();

    console.log('[ScreenGuard] System initialized');
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange = (): void => {
    this.metrics.lastVisibilityChange = Date.now();

    if (!document.hidden) {
      // Coming back to visible
      this.scheduleRepaint('visibility-change');
    }
  };

  /**
   * Handle window focus
   */
  private handleWindowFocus = (): void => {
    this.scheduleRepaint('window-focus');
  };

  /**
   * Handle window blur
   */
  private handleWindowBlur = (): void => {
    // Reset blank frame counter on blur (expected behavior)
    this.metrics.consecutiveBlankFrames = 0;
  };

  /**
   * Handle page show (bfcache restoration)
   */
  private handlePageShow = (e: PageTransitionEvent): void => {
    if (e.persisted) {
      // Page was restored from bfcache
      this.scheduleRepaint('bfcache-restore');
    }
  };

  /**
   * Attach Electron IPC listeners
   */
  private attachIPCListeners(): void {
    const ipc = (window as any).electron?.ipcRenderer;
    if (!ipc) return;

    const events = ['dex:resume', 'dex:wake', 'dex:unlock'];
    for (const event of events) {
      ipc.on?.(event, () => this.scheduleRepaint(event));
    }
  }

  /**
   * Start continuous health monitoring
   * Pauses when tab is hidden to save CPU
   */
  private startHealthMonitoring(): void {
    // Check every 10 seconds, but only when visible
    this.healthCheckInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.performHealthCheck();
      }
    }, 10000);

    // Also check on animation frame for more immediate detection
    // (handled by startFrameMonitoring)
  }

  /**
   * Start frame monitoring
   */
  private startFrameMonitoring(): void {
    let lastFrameTime = performance.now();
    let frameCount = 0;

    const monitor = (timestamp: number): void => {
      if (!this.isMonitoring) return;

      const delta = timestamp - lastFrameTime;
      lastFrameTime = timestamp;
      frameCount++;

      // Check for long gaps (> 500ms indicates potential issue)
      if (delta > 500 && document.visibilityState === 'visible') {
        this.metrics.consecutiveBlankFrames++;
        
        if (this.metrics.consecutiveBlankFrames >= 3) {
          console.warn('[ScreenGuard] Detected potential blank screen');
          this.attemptRecovery();
        }
      } else {
        this.metrics.consecutiveBlankFrames = 0;
      }

      this.metrics.lastRepaint = timestamp;
      this.rafId = requestAnimationFrame(monitor);
    };

    this.rafId = requestAnimationFrame(monitor);
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    if (document.visibilityState !== 'visible') return;

    // Check if root element has content
    const root = document.getElementById('root');
    if (root) {
      const hasVisibleContent = root.children.length > 0 && 
        root.getBoundingClientRect().height > 0;

      if (!hasVisibleContent) {
        console.warn('[ScreenGuard] Root appears empty');
        this.attemptRecovery();
      }
    }

    // Check for white/black body
    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor;
    
    // Very simplistic check - in production, this would be more sophisticated
    if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
      // Transparent body might indicate rendering issue
      this.scheduleRepaint('transparent-body');
    }
  }

  /**
   * Schedule a repaint
   */
  private scheduleRepaint(reason: string): void {
    if (this.recoveryInProgress) return;

    console.log(`[ScreenGuard] Scheduling repaint: ${reason}`);
    
    requestAnimationFrame(() => {
      this.forceRepaint('opacity');
    });
  }

  /**
   * Attempt recovery with escalating strategies
   */
  private attemptRecovery(): void {
    if (this.recoveryInProgress) return;
    this.recoveryInProgress = true;
    this.metrics.recoveryAttempts++;

    const strategies: RecoveryStrategy[] = ['opacity', 'reflow', 'containment', 'force'];
    
    const tryStrategy = (index: number): void => {
      if (index >= strategies.length) {
        console.error('[ScreenGuard] All recovery strategies exhausted');
        this.recoveryInProgress = false;
        this.notifyListeners('recovery-failed');
        return;
      }

      const strategy = strategies[index];
      console.log(`[ScreenGuard] Attempting recovery: ${strategy}`);
      
      this.forceRepaint(strategy);

      // Check if recovery worked after a short delay
      setTimeout(() => {
        const root = document.getElementById('root');
        const recovered = root && root.children.length > 0 && 
          root.getBoundingClientRect().height > 0;

        if (recovered) {
          console.log(`[ScreenGuard] Recovery successful: ${strategy}`);
          this.recoveryInProgress = false;
          this.metrics.consecutiveBlankFrames = 0;
          this.notifyListeners('recovery-success');
        } else {
          // Try next strategy
          tryStrategy(index + 1);
        }
      }, 100);
    };

    tryStrategy(0);
  }

  /**
   * Force a repaint using the specified strategy
   */
  forceRepaint(strategy: RecoveryStrategy = 'opacity'): void {
    switch (strategy) {
      case 'opacity':
        // Quick opacity flicker
        document.body.style.opacity = '0.9999';
        requestAnimationFrame(() => {
          document.body.style.opacity = '1';
        });
        break;

      case 'reflow':
        // Force layout reflow
        void document.body.offsetHeight;
        document.body.style.display = 'none';
        void document.body.offsetHeight;
        document.body.style.display = '';
        break;

      case 'containment':
        // Reset CSS containment
        const root = document.getElementById('root');
        if (root) {
          const originalContain = root.style.contain;
          root.style.contain = 'none';
          requestAnimationFrame(() => {
            root.style.contain = originalContain || 'layout style';
          });
        }
        break;

      case 'force':
        // Nuclear option - multiple techniques
        document.body.style.display = 'none';
        void document.body.offsetHeight;
        document.body.style.display = '';
        
        document.body.style.opacity = '0.99';
        requestAnimationFrame(() => {
          document.body.style.opacity = '1';
          
          // Also reset transforms
          const allElements = document.querySelectorAll('[style*="transform"]');
          allElements.forEach(el => {
            const htmlEl = el as HTMLElement;
            const transform = htmlEl.style.transform;
            htmlEl.style.transform = 'translateZ(0)';
            requestAnimationFrame(() => {
              htmlEl.style.transform = transform;
            });
          });
        });
        break;

      case 'reload':
        // Last resort - reload the page
        window.location.reload();
        break;
    }
  }

  /**
   * Subscribe to screen guard events
   */
  subscribe(callback: (event: string) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(event: string): void {
    this.listeners.forEach(fn => fn(event));
  }

  /**
   * Get health metrics
   */
  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.isMonitoring = false;
    
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('pageshow', this.handlePageShow);
  }
}

// ---------------------------------------------------------------------------
// BUTTON RESPONSIVENESS SYSTEM
// Instant visual feedback for all interactive elements
// ---------------------------------------------------------------------------

class ButtonResponsivenessSystem {
  private observer: MutationObserver | null = null;
  private processedElements = new WeakSet<Element>();

  /**
   * Initialize the button responsiveness system
   */
  initialize(): void {
    // Inject global styles
    this.injectStyles();

    // Process existing buttons
    this.processExistingButtons();

    // Watch for new buttons
    this.startObserving();

    console.log('[ButtonResponsiveness] System initialized');
  }

  /**
   * Inject CSS for instant button feedback
   */
  private injectStyles(): void {
    const styleId = 'dex-button-responsiveness';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Instant button feedback - no delay */
      button, 
      [role="button"], 
      .dex-btn,
      .dex-clickable,
      [data-clickable="true"] {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
        cursor: pointer;
        transition: transform 80ms cubic-bezier(0.2, 0, 0.2, 1), 
                    opacity 80ms ease-out,
                    background-color 100ms ease-out,
                    box-shadow 100ms ease-out;
      }

      /* Active state - instant press feedback */
      button:active:not(:disabled):not([aria-disabled="true"]),
      [role="button"]:active:not([aria-disabled="true"]),
      .dex-btn:active:not(.disabled),
      .dex-clickable:active,
      [data-clickable="true"]:active {
        transform: scale(0.97) !important;
        opacity: 0.9;
      }

      /* Hover state */
      button:hover:not(:disabled):not(:active),
      [role="button"]:hover:not([aria-disabled="true"]):not(:active),
      .dex-btn:hover:not(.disabled):not(:active) {
        filter: brightness(1.05);
      }

      /* Focus visible state */
      button:focus-visible,
      [role="button"]:focus-visible,
      .dex-btn:focus-visible {
        outline: 2px solid var(--color-accent, #0a84ff);
        outline-offset: 2px;
      }

      /* Disabled state */
      button:disabled,
      [role="button"][aria-disabled="true"],
      .dex-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* Icon buttons - slightly different scale */
      .dex-icon-btn:active,
      [data-icon-button="true"]:active {
        transform: scale(0.92) !important;
      }

      /* Large buttons - subtle scale */
      .dex-btn-lg:active,
      button.large:active {
        transform: scale(0.98) !important;
      }

      /* Card/tile press feedback */
      .dex-card:active,
      .dex-tile:active,
      [data-pressable="true"]:active {
        transform: scale(0.99);
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
      }

      /* List item press feedback */
      .dex-list-item:active,
      [role="listitem"]:active,
      [role="option"]:active {
        background-color: var(--color-bg-pressed, rgba(0,0,0,0.1)) !important;
      }

      /* Remove delay on touch devices */
      @media (hover: none) {
        button, [role="button"], .dex-btn {
          transition-duration: 50ms;
        }
      }

      /* Reduce motion preference */
      @media (prefers-reduced-motion: reduce) {
        button, [role="button"], .dex-btn {
          transition: none;
        }
        
        button:active, [role="button"]:active, .dex-btn:active {
          transform: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Process existing buttons
   */
  private processExistingButtons(): void {
    const buttons = document.querySelectorAll('button, [role="button"], .dex-btn');
    buttons.forEach(btn => this.enhanceButton(btn));
  }

  /**
   * Enhance a button with additional feedback
   */
  private enhanceButton(element: Element): void {
    if (this.processedElements.has(element)) return;
    this.processedElements.add(element);

    const htmlEl = element as HTMLElement;

    // Add haptic feedback on touch devices
    htmlEl.addEventListener('touchstart', () => {
      if ('vibrate' in navigator) {
        navigator.vibrate(5);
      }
    }, { passive: true });

    // Add audio feedback (optional - can be disabled)
    htmlEl.addEventListener('pointerdown', () => {
      // Could play a subtle click sound here
    }, { passive: true });
  }

  /**
   * Start observing for new buttons
   */
  private startObserving(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.matches('button, [role="button"], .dex-btn')) {
              this.enhanceButton(node);
            }
            // Check children
            node.querySelectorAll('button, [role="button"], .dex-btn').forEach(
              btn => this.enhanceButton(btn)
            );
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.observer?.disconnect();
  }
}

// ---------------------------------------------------------------------------
// APP STARTUP OPTIMIZER
// Prevents blank screen during app startup
// ---------------------------------------------------------------------------

class AppStartupOptimizer {
  private splashElement: HTMLElement | null = null;
  private startTime: number = 0;
  private minSplashTime = 300; // Minimum time to show splash

  /**
   * Show a loading splash during startup
   */
  showSplash(): void {
    this.startTime = Date.now();

    // Create splash element
    this.splashElement = document.createElement('div');
    this.splashElement.id = 'dex-startup-splash';
    this.splashElement.innerHTML = `
      <style>
        #dex-startup-splash {
          position: fixed;
          inset: 0;
          z-index: var(--z-screen-guard, 20000);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-base, #1a1a1c);
          transition: opacity 200ms ease-out;
        }
        #dex-startup-splash.hiding {
          opacity: 0;
          pointer-events: none;
        }
        .dex-splash-logo {
          width: 80px;
          height: 80px;
          border-radius: 20px;
          background: linear-gradient(135deg, #0a84ff, #5856d6);
          animation: dex-splash-pulse 1.5s ease-in-out infinite;
        }
        .dex-splash-text {
          margin-top: 24px;
          font-size: 13px;
          color: var(--color-text-muted, #707070);
          opacity: 0;
          animation: dex-splash-fade 0.5s ease-out 0.3s forwards;
        }
        @keyframes dex-splash-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes dex-splash-fade {
          to { opacity: 1; }
        }
      </style>
      <div class="dex-splash-logo"></div>
      <div class="dex-splash-text">Starting DEX...</div>
    `;

    document.body.appendChild(this.splashElement);
  }

  /**
   * Hide the splash screen
   */
  hideSplash(): void {
    if (!this.splashElement) return;

    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.minSplashTime - elapsed);

    setTimeout(() => {
      if (this.splashElement) {
        this.splashElement.classList.add('hiding');
        setTimeout(() => {
          this.splashElement?.remove();
          this.splashElement = null;
        }, 200);
      }
    }, remaining);
  }
}

// ---------------------------------------------------------------------------
// SINGLETON INSTANCES
// ---------------------------------------------------------------------------

export const screenGuard = new ScreenGuardSystem();
export const buttonResponsiveness = new ButtonResponsivenessSystem();
export const startupOptimizer = new AppStartupOptimizer();

// ---------------------------------------------------------------------------
// INITIALIZATION FUNCTION
// ---------------------------------------------------------------------------

let initialized = false;

export function initScreenGuardSystems(): void {
  if (initialized) return;
  initialized = true;

  screenGuard.initialize();
  buttonResponsiveness.initialize();
  
  console.log('[ScreenGuard] All systems initialized');
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
  // Show splash immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initScreenGuardSystems();
    });
  } else {
    initScreenGuardSystems();
  }
}
