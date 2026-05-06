// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Fluid Operations System
// GPU-accelerated drag, resize, and animation operations for smooth UX
// Fixes laggy drag/resize in creative apps and large windows
// =============================================================================

// ---------------------------------------------------------------------------
// OPERATION STATE
// ---------------------------------------------------------------------------

interface FluidState {
  isDragging: boolean;
  isResizing: boolean;
  operationId: string | null;
  frameId: number;
  lastFrameTime: number;
  targetFps: number;
  frameSkipThreshold: number;
  gpuAccelerated: boolean;
}

const state: FluidState = {
  isDragging: false,
  isResizing: false,
  operationId: null,
  frameId: 0,
  lastFrameTime: 0,
  targetFps: 120,
  frameSkipThreshold: 6, // Skip if more than 6ms behind
  gpuAccelerated: true,
};

// ---------------------------------------------------------------------------
// GPU COMPOSITING HINTS
// ---------------------------------------------------------------------------

const GPU_STYLE_DRAG = {
  willChange: 'transform',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden' as const,
  perspective: '1000px',
} as const;

const GPU_STYLE_RESIZE = {
  willChange: 'width, height, transform',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden' as const,
  contain: 'strict',
} as const;

// ---------------------------------------------------------------------------
// FLUID DRAG CONTROLLER
// ---------------------------------------------------------------------------

export interface DragController {
  start: (element: HTMLElement, startX: number, startY: number) => void;
  move: (currentX: number, currentY: number) => void;
  end: () => { x: number; y: number };
  cancel: () => void;
  isActive: () => boolean;
}

export function createFluidDrag(options: {
  onStart?: () => void;
  onMove?: (x: number, y: number) => void;
  onEnd?: (finalX: number, finalY: number) => void;
  throttleMs?: number;
  momentum?: boolean;
}): DragController {
  const { onStart, onMove, onEnd, throttleMs = 0, momentum = false } = options;

  let element: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId = 0;
  let lastMoveTime = 0;
  let velocityX = 0;
  let velocityY = 0;
  let lastX = 0;
  let lastY = 0;

  const applyGpuHints = (el: HTMLElement) => {
    el.style.willChange = GPU_STYLE_DRAG.willChange;
    el.style.backfaceVisibility = GPU_STYLE_DRAG.backfaceVisibility;
    el.style.transform = ''; // Will be set during drag
    // Disable pointer events on children to prevent interference
    el.style.pointerEvents = 'auto';
    // Force GPU layer creation
    el.offsetHeight; // Trigger reflow
  };

  const removeGpuHints = (el: HTMLElement) => {
    el.style.willChange = '';
    el.style.backfaceVisibility = '';
    el.style.transform = '';
  };

  const updateFrame = () => {
    if (!element || !state.isDragging) return;

    const now = performance.now();
    const deltaTime = now - state.lastFrameTime;

    // Adaptive frame skipping for performance
    if (deltaTime < state.frameSkipThreshold) {
      rafId = requestAnimationFrame(updateFrame);
      return;
    }

    state.lastFrameTime = now;

    const dx = currentX - startX;
    const dy = currentY - startY;

    // Use GPU-accelerated transform instead of left/top
    element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    // Track velocity for momentum
    if (momentum) {
      const timeDelta = now - lastMoveTime;
      if (timeDelta > 0 && timeDelta < 100) {
        velocityX = (currentX - lastX) / timeDelta;
        velocityY = (currentY - lastY) / timeDelta;
      }
      lastX = currentX;
      lastY = currentY;
      lastMoveTime = now;
    }

    onMove?.(startLeft + dx, startTop + dy);

    rafId = requestAnimationFrame(updateFrame);
  };

  return {
    start(el, sx, sy) {
      element = el;
      startX = sx;
      startY = sy;
      currentX = sx;
      currentY = sy;
      lastX = sx;
      lastY = sy;
      velocityX = 0;
      velocityY = 0;
      lastMoveTime = performance.now();

      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      state.isDragging = true;
      state.operationId = `drag-${Date.now()}`;
      state.lastFrameTime = performance.now();

      applyGpuHints(el);
      onStart?.();
      rafId = requestAnimationFrame(updateFrame);
    },

    move(cx, cy) {
      // Throttle if specified
      if (throttleMs > 0) {
        const now = performance.now();
        if (now - lastMoveTime < throttleMs) return;
      }
      currentX = cx;
      currentY = cy;
    },

    end() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      state.isDragging = false;
      state.operationId = null;

      const finalX = startLeft + (currentX - startX);
      const finalY = startTop + (currentY - startY);

      if (element) {
        removeGpuHints(element);
        element = null;
      }

      onEnd?.(finalX, finalY);
      return { x: finalX, y: finalY };
    },

    cancel() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      state.isDragging = false;
      state.operationId = null;

      if (element) {
        element.style.transform = '';
        removeGpuHints(element);
        element = null;
      }
    },

    isActive() {
      return state.isDragging;
    },
  };
}

// ---------------------------------------------------------------------------
// FLUID RESIZE CONTROLLER
// ---------------------------------------------------------------------------

export interface ResizeController {
  start: (element: HTMLElement, startX: number, startY: number, direction: string) => void;
  move: (currentX: number, currentY: number) => void;
  end: () => { width: number; height: number; x: number; y: number };
  cancel: () => void;
  isActive: () => boolean;
}

export function createFluidResize(options: {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onStart?: () => void;
  onMove?: (width: number, height: number, x: number, y: number) => void;
  onEnd?: (width: number, height: number, x: number, y: number) => void;
  aspectRatio?: number | null;
}): ResizeController {
  const {
    minWidth = 200,
    minHeight = 150,
    maxWidth = Infinity,
    maxHeight = Infinity,
    onStart,
    onMove,
    onEnd,
    aspectRatio = null,
  } = options;

  let element: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let startLeft = 0;
  let startTop = 0;
  let direction = '';
  let currentW = 0;
  let currentH = 0;
  let currentLeft = 0;
  let currentTop = 0;
  let rafId = 0;
  let pendingUpdate = false;

  const applyGpuHints = (el: HTMLElement) => {
    el.style.willChange = GPU_STYLE_RESIZE.willChange;
    el.style.contain = GPU_STYLE_RESIZE.contain;
    el.style.backfaceVisibility = GPU_STYLE_RESIZE.backfaceVisibility;
  };

  const removeGpuHints = (el: HTMLElement) => {
    el.style.willChange = '';
    el.style.contain = '';
    el.style.backfaceVisibility = '';
  };

  const updateFrame = () => {
    if (!element || !state.isResizing || !pendingUpdate) {
      if (state.isResizing) {
        rafId = requestAnimationFrame(updateFrame);
      }
      return;
    }

    pendingUpdate = false;

    // Apply dimensions directly to element for immediate feedback
    element.style.width = `${currentW}px`;
    element.style.height = `${currentH}px`;
    element.style.left = `${currentLeft}px`;
    element.style.top = `${currentTop}px`;

    onMove?.(currentW, currentH, currentLeft, currentTop);

    rafId = requestAnimationFrame(updateFrame);
  };

  return {
    start(el, sx, sy, dir) {
      element = el;
      startX = sx;
      startY = sy;
      direction = dir;

      const rect = el.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      startLeft = rect.left;
      startTop = rect.top;
      currentW = startW;
      currentH = startH;
      currentLeft = startLeft;
      currentTop = startTop;

      state.isResizing = true;
      state.operationId = `resize-${Date.now()}`;
      pendingUpdate = false;

      applyGpuHints(el);
      onStart?.();
      rafId = requestAnimationFrame(updateFrame);
    },

    move(cx, cy) {
      const dx = cx - startX;
      const dy = cy - startY;

      let newW = startW;
      let newH = startH;
      let newX = startLeft;
      let newY = startTop;

      // Calculate new dimensions based on direction
      if (direction.includes('e')) newW = startW + dx;
      if (direction.includes('w')) {
        newW = startW - dx;
        newX = startLeft + dx;
      }
      if (direction.includes('s')) newH = startH + dy;
      if (direction.includes('n')) {
        newH = startH - dy;
        newY = startTop + dy;
      }

      // Apply constraints
      newW = Math.max(minWidth, Math.min(maxWidth, newW));
      newH = Math.max(minHeight, Math.min(maxHeight, newH));

      // Fix position if constrained on west/north edge
      if (direction.includes('w') && newW === minWidth) {
        newX = startLeft + startW - minWidth;
      }
      if (direction.includes('n') && newH === minHeight) {
        newY = startTop + startH - minHeight;
      }

      // Apply aspect ratio if specified
      if (aspectRatio !== null) {
        if (direction.includes('e') || direction.includes('w')) {
          newH = newW / aspectRatio;
        } else {
          newW = newH * aspectRatio;
        }
        newW = Math.max(minWidth, Math.min(maxWidth, newW));
        newH = Math.max(minHeight, Math.min(maxHeight, newH));
      }

      currentW = Math.round(newW);
      currentH = Math.round(newH);
      currentLeft = Math.round(newX);
      currentTop = Math.round(newY);
      pendingUpdate = true;
    },

    end() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      state.isResizing = false;
      state.operationId = null;

      if (element) {
        removeGpuHints(element);
        element = null;
      }

      onEnd?.(currentW, currentH, currentLeft, currentTop);
      return { width: currentW, height: currentH, x: currentLeft, y: currentTop };
    },

    cancel() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      state.isResizing = false;
      state.operationId = null;

      if (element) {
        element.style.width = `${startW}px`;
        element.style.height = `${startH}px`;
        element.style.left = `${startLeft}px`;
        element.style.top = `${startTop}px`;
        removeGpuHints(element);
        element = null;
      }
    },

    isActive() {
      return state.isResizing;
    },
  };
}

// ---------------------------------------------------------------------------
// IMMEDIATE CLOSE SYSTEM FOR MENUS/DROPDOWNS
// ---------------------------------------------------------------------------

const activeMenus = new Set<string>();
const menuCloseCallbacks = new Map<string, () => void>();

export function registerMenu(id: string, closeCallback: () => void): void {
  activeMenus.add(id);
  menuCloseCallbacks.set(id, closeCallback);
}

export function unregisterMenu(id: string): void {
  activeMenus.delete(id);
  menuCloseCallbacks.delete(id);
}

export function closeAllMenusImmediately(except?: string): void {
  menuCloseCallbacks.forEach((callback, id) => {
    if (id !== except) {
      callback();
    }
  });
}

export function closeMenuImmediately(id: string): void {
  const callback = menuCloseCallbacks.get(id);
  if (callback) {
    callback();
    unregisterMenu(id);
  }
}

// Global click handler for immediate menu close
let globalClickHandlerInstalled = false;

export function installGlobalMenuCloseHandler(): void {
  if (globalClickHandlerInstalled) return;
  globalClickHandlerInstalled = true;

  document.addEventListener('pointerdown', (e) => {
    // Close all menus unless clicking within a menu
    const target = e.target as HTMLElement;
    const isMenuClick = target.closest('[data-menu]') !== null;
    if (!isMenuClick) {
      closeAllMenusImmediately();
    }
  }, { capture: true, passive: true });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllMenusImmediately();
    }
  }, { capture: true });
}

// ---------------------------------------------------------------------------
// OPERATION GUARDS - Pause heavy operations during drag/resize
// ---------------------------------------------------------------------------

export function isOperationActive(): boolean {
  return state.isDragging || state.isResizing;
}

export function getOperationId(): string | null {
  return state.operationId;
}

// Defer heavy operations during drag/resize
const deferredOperations: (() => void)[] = [];

export function deferDuringOperation(fn: () => void): void {
  if (isOperationActive()) {
    deferredOperations.push(fn);
  } else {
    fn();
  }
}

export function flushDeferredOperations(): void {
  const ops = deferredOperations.splice(0);
  ops.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.warn('[FluidOps] Deferred operation failed:', e);
    }
  });
}

// Automatically flush when operations end
const originalEnd = state.isDragging;
Object.defineProperty(state, 'isDragging', {
  get() { return originalEnd; },
  set(val) {
    const wasActive = state.isDragging || state.isResizing;
    (state as any)._isDragging = val;
    const isActive = val || state.isResizing;
    if (wasActive && !isActive) {
      requestIdleCallback(() => flushDeferredOperations(), { timeout: 100 });
    }
  },
});

// ---------------------------------------------------------------------------
// FLUID COMPONENT RESIZE (for apps with panels)
// ---------------------------------------------------------------------------

export interface FluidPanelConfig {
  direction: 'horizontal' | 'vertical';
  minSize: number;
  maxSize: number;
  defaultSize: number;
  onResize?: (size: number) => void;
}

export function createFluidPanel(config: FluidPanelConfig) {
  let size = config.defaultSize;
  let resizing = false;
  let startPos = 0;
  let startSize = 0;
  let rafId = 0;
  let pendingSize = 0;
  let element: HTMLElement | null = null;

  const updateSize = () => {
    if (!resizing || !element) return;
    
    const clampedSize = Math.max(config.minSize, Math.min(config.maxSize, pendingSize));
    if (config.direction === 'horizontal') {
      element.style.width = `${clampedSize}px`;
    } else {
      element.style.height = `${clampedSize}px`;
    }
    size = clampedSize;
    config.onResize?.(clampedSize);
    
    rafId = requestAnimationFrame(updateSize);
  };

  return {
    attach(el: HTMLElement) {
      element = el;
      if (config.direction === 'horizontal') {
        el.style.width = `${size}px`;
      } else {
        el.style.height = `${size}px`;
      }
    },

    startResize(clientPos: number) {
      resizing = true;
      startPos = clientPos;
      startSize = size;
      if (element) {
        element.style.willChange = config.direction === 'horizontal' ? 'width' : 'height';
        element.style.transition = 'none';
      }
      rafId = requestAnimationFrame(updateSize);
    },

    updateResize(clientPos: number) {
      const delta = clientPos - startPos;
      pendingSize = startSize + delta;
    },

    endResize() {
      resizing = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (element) {
        element.style.willChange = '';
        element.style.transition = '';
      }
      return size;
    },

    getSize() {
      return size;
    },

    setSize(newSize: number) {
      size = Math.max(config.minSize, Math.min(config.maxSize, newSize));
      if (element) {
        if (config.direction === 'horizontal') {
          element.style.width = `${size}px`;
        } else {
          element.style.height = `${size}px`;
        }
      }
      return size;
    },
  };
}

// ---------------------------------------------------------------------------
// VISIBILITY RECOVERY (Fix black screen after sleep/lid close)
// ---------------------------------------------------------------------------

let visibilityRecoveryInstalled = false;

export function installVisibilityRecovery(): void {
  if (visibilityRecoveryInstalled) return;
  visibilityRecoveryInstalled = true;

  // Force repaint on visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      forceRepaint();
    }
  });

  // Handle window focus
  window.addEventListener('focus', () => {
    forceRepaint();
  });

  // Handle resize (can fix stuck layouts)
  window.addEventListener('resize', () => {
    forceRepaint();
  });
}

export function forceRepaint(): void {
  // Multiple techniques to force repaint
  requestAnimationFrame(() => {
    // Technique 1: Opacity toggle
    document.body.style.opacity = '0.9999';
    requestAnimationFrame(() => {
      document.body.style.opacity = '1';
    });

    // Technique 2: Force layout recalculation
    void document.body.offsetHeight;

    // Technique 3: Trigger compositing update
    const root = document.documentElement;
    root.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => {
      root.style.transform = '';
    });
  });
}

// ---------------------------------------------------------------------------
// BUTTON RESPONSIVENESS - Instant visual feedback
// ---------------------------------------------------------------------------

export function makeButtonResponsive(element: HTMLElement): () => void {
  const handlePointerDown = () => {
    element.style.transform = 'scale(0.96)';
    element.style.transition = 'transform 0.05s ease-out';
  };

  const handlePointerUp = () => {
    element.style.transform = 'scale(1)';
    element.style.transition = 'transform 0.1s ease-out';
  };

  const handlePointerLeave = () => {
    element.style.transform = 'scale(1)';
  };

  element.addEventListener('pointerdown', handlePointerDown);
  element.addEventListener('pointerup', handlePointerUp);
  element.addEventListener('pointerleave', handlePointerLeave);

  return () => {
    element.removeEventListener('pointerdown', handlePointerDown);
    element.removeEventListener('pointerup', handlePointerUp);
    element.removeEventListener('pointerleave', handlePointerLeave);
  };
}

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------

export function initFluidOperations(): void {
  installGlobalMenuCloseHandler();
  installVisibilityRecovery();
}

// Auto-init on import
if (typeof window !== 'undefined') {
  initFluidOperations();
}

export default {
  createFluidDrag,
  createFluidResize,
  createFluidPanel,
  closeAllMenusImmediately,
  closeMenuImmediately,
  registerMenu,
  unregisterMenu,
  isOperationActive,
  deferDuringOperation,
  forceRepaint,
  makeButtonResponsive,
};
