// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Snappy UX Integration
// Main entry point for all snappy UX utilities
// =============================================================================

import { injectRippleStyles as _injectRippleStyles } from './services/InputPriority';
import { workerPool as _workerPool } from './services/WorkerPool';
import { enableScrollRestoration as _enableScrollRestoration } from './utils/prefetch';

// ---------------------------------------------------------------------------
// Core Services
// ---------------------------------------------------------------------------

export { 
  InputPriorityManager,
  inputPriority,
  createClickFeedback,
  injectRippleStyles,
  createSmoothScrollContainer,
  restoreScrollPosition as inputRestoreScroll,
  createVirtualScroll,
} from './services/InputPriority';

export {
  WorkerPool,
  workerPool,
} from './services/WorkerPool';

// ---------------------------------------------------------------------------
// Creative Apps Snappy
// ---------------------------------------------------------------------------

export {
  cacheCreativeAppState,
  restoreCreativeAppState,
  createSnappyCanvas,
  createCanvasScheduler,
  setupAxlSnappiness,
  loadPrismImage,
  createLayerThumbnailCache,
  createSnappyBrushRenderer,
  createVideoThumbnailGenerator,
  createSnappyTimeline,
  createWaveformCache,
  createSnappyMeter,
  createAudioPreBuffer,
  createKeyframePreviewCache,
  createSnappyLayerDrag,
  createEffectPreview,
} from './services/CreativeAppsSnappy';

// ---------------------------------------------------------------------------
// System Apps Snappy
// ---------------------------------------------------------------------------

export {
  createVirtualFileList,
  createFileThumbnailCache,
  createFilePreviewManager,
  createTabStateCache,
  createLinkPrefetcher,
  createBrowserTransitions,
  createNoteListOptimizer,
  createNoteSearcher,
  createNoteAutosave,
  createSettingsNavigator,
  createPreferencesCache,
  createTerminalOptimizer,
} from './services/SystemAppsSnappy';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export {
  useOptimistic,
  useOptimisticToggle,
  useOptimisticList,
} from './hooks/useOptimistic';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export {
  SkeletonBase,
  SkeletonText,
  SkeletonImage,
  SkeletonAvatar,
  SkeletonIcon,
  SkeletonCard,
  SkeletonListItem,
  SkeletonList,
  SkeletonGrid,
  SkeletonTable,
  SkeletonPage,
  SkeletonFilesGrid,
  SkeletonBrowserTab,
  SkeletonNote,
} from './components/Skeleton';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export {
  AppPrefetchManager,
  appPrefetch,
  prefetch,
  prefetchOnHover,
  startTransition,
  completeTransition,
  saveScrollPosition,
  restoreScrollPosition,
  enableScrollRestoration,
  cacheWindowPosition,
  restoreWindowPosition,
} from './utils/prefetch';

export {
  ProgressiveCache,
  progressiveCache,
  loadWithSWR,
  loadImageProgressively,
  preloadImage,
  getDominantColorPlaceholder,
  generateBlurPlaceholder,
  streamData,
} from './utils/progressive-loader';

export {
  createSpring,
  createSpring2D,
  springTransform,
  animateValue,
  springScrollTo,
  bounce,
  shake,
  pop,
  useSpring,
  useSpring2D,
  SPRING_PRESETS,
} from './utils/spring-animation';

// ---------------------------------------------------------------------------
// Performance Monitoring
// ---------------------------------------------------------------------------

interface PerformanceMetrics {
  inputLatency: number[];
  frameDrops: number;
  longTasks: number;
  memoryUsage: number;
  lastUpdate: number;
}

let metrics: PerformanceMetrics = {
  inputLatency: [],
  frameDrops: 0,
  longTasks: 0,
  memoryUsage: 0,
  lastUpdate: Date.now(),
};

/**
 * Start performance monitoring
 */
export function startPerformanceMonitoring(): void {
  // Monitor long tasks (>50ms)
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            metrics.longTasks++;
          }
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long task API not supported
    }
  }

  // Monitor frame drops
  let lastFrameTime = performance.now();
  const checkFrameRate = () => {
    const now = performance.now();
    const delta = now - lastFrameTime;
    if (delta > 33.33) { // Dropped below 30fps
      metrics.frameDrops++;
    }
    lastFrameTime = now;
    requestAnimationFrame(checkFrameRate);
  };
  requestAnimationFrame(checkFrameRate);

  // Monitor memory usage
  const checkMemory = () => {
    if ((performance as any).memory) {
      metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }
    metrics.lastUpdate = Date.now();
  };
  setInterval(checkMemory, 5000);
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Log average input latency
 */
export function logInputLatency(latencyMs: number): void {
  metrics.inputLatency.push(latencyMs);
  if (metrics.inputLatency.length > 100) {
    metrics.inputLatency.shift();
  }
}

/**
 * Get average input latency
 */
export function getAverageInputLatency(): number {
  if (metrics.inputLatency.length === 0) return 0;
  const sum = metrics.inputLatency.reduce((a, b) => a + b, 0);
  return sum / metrics.inputLatency.length;
}

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

/**
 * Initialize all snappy UX features
 */
export function initSnappyUX(): void {
  // Inject ripple styles
  _injectRippleStyles();
  
  // Enable scroll restoration
  _enableScrollRestoration();
  
  // Start performance monitoring
  startPerformanceMonitoring();
  
  // Initialize worker pool
  _workerPool.init();
  
  console.log('[DEX] Snappy UX initialized');
}

/**
 * Disable animations for reduced motion preference
 */
export function respectReducedMotion(): boolean {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.documentElement.style.setProperty('--dex-animation-duration', '0ms');
    document.documentElement.classList.add('dex-reduced-motion');
  }
  return prefersReducedMotion;
}

// ---------------------------------------------------------------------------
// CSS Variables for Snappy Feel
// ---------------------------------------------------------------------------

export const snappyCSS = `
/* Snappy UX CSS Variables */
:root {
  /* Animation timings */
  --dex-animation-fast: 100ms;
  --dex-animation-normal: 200ms;
  --dex-animation-slow: 300ms;
  
  /* Easing curves */
  --dex-ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
  --dex-ease-in: cubic-bezier(0.4, 0.0, 1, 1);
  --dex-ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  --dex-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  
  /* Shadows for depth */
  --dex-shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
  --dex-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --dex-shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  
  /* Transform hints */
  --dex-will-change: transform, opacity;
}

/* Reduced motion */
.dex-reduced-motion,
.dex-reduced-motion * {
  animation-duration: 0ms !important;
  transition-duration: 0ms !important;
}

/* GPU acceleration hints */
.dex-gpu {
  transform: translateZ(0);
  will-change: var(--dex-will-change);
}

/* Instant hover states */
.dex-instant-hover {
  transition: transform var(--dex-animation-fast) var(--dex-ease-out);
}
.dex-instant-hover:hover {
  transform: scale(1.02);
}
.dex-instant-hover:active {
  transform: scale(0.98);
}

/* Loading states */
.dex-loading {
  pointer-events: none;
  opacity: 0.7;
}

/* Focus visible */
.dex-focus-visible:focus-visible {
  outline: 2px solid var(--accent-color, #007AFF);
  outline-offset: 2px;
}
`;

// Inject CSS on load
if (typeof document !== 'undefined' && !document.getElementById('dex-snappy-css')) {
  const style = document.createElement('style');
  style.id = 'dex-snappy-css';
  style.textContent = snappyCSS;
  document.head.appendChild(style);
}
