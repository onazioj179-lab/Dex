// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - UI Polish System
// Unified system for dropdowns, menus, overlays, and UI responsiveness
// Fixes: Immediate close, z-index management, button responsiveness, black screen
// =============================================================================

// ---------------------------------------------------------------------------
// Z-INDEX LAYER SYSTEM
// Strict layering to prevent overlapping issues
// ---------------------------------------------------------------------------

export const UI_LAYERS = {
  // Base layers (0-99)
  base: 0,
  content: 10,
  
  // Window layers (100-4999)
  floatingWindow: 100,      // Starting z-index, auto-incremented
  floatingWindowMax: 4990,  // Cap before dock
  
  // Shell layers (5000-5999)
  dock: 5000,
  dockMenu: 5100,
  stageManager: 5200,
  
  // Overlay layers (6000-6999)
  dropdown: 6000,
  contextMenu: 6100,
  tooltip: 6200,
  popover: 6300,
  
  // Modal layers (7000-7999)
  modal: 7000,
  modalBackdrop: 6900,
  dialog: 7100,
  
  // System layers (8000-9999)
  notification: 8000,
  toast: 8100,
  spotlight: 8500,
  lockScreen: 9000,
  systemOverlay: 9500,
  
  // Top priority (10000+)
  criticalAlert: 10000,
} as const;

// ---------------------------------------------------------------------------
// GLOBAL OVERLAY MANAGER
// Manages all dropdowns, menus, popovers - ensures immediate close
// ---------------------------------------------------------------------------

type OverlayType = 'dropdown' | 'contextMenu' | 'popover' | 'tooltip' | 'modal';

interface OverlayEntry {
  id: string;
  type: OverlayType;
  close: () => void;
  element?: HTMLElement;
  priority: number;
  timestamp: number;
}

class OverlayManager {
  private overlays: Map<string, OverlayEntry> = new Map();
  private listeners: Set<() => void> = new Set();
  private isGlobalListenerAttached = false;
  
  constructor() {
    this.attachGlobalListener();
  }
  
  private attachGlobalListener() {
    if (this.isGlobalListenerAttached || typeof document === 'undefined') return;
    
    // Use capture phase for immediate response
    document.addEventListener('pointerdown', this.handleGlobalPointerDown, { capture: true, passive: true });
    document.addEventListener('keydown', this.handleGlobalKeyDown, { capture: true });
    
    // Handle window blur (user switches apps)
    window.addEventListener('blur', this.closeAll);
    
    this.isGlobalListenerAttached = true;
  }
  
  private handleGlobalPointerDown = (e: PointerEvent) => {
    // Check if click is outside all overlays
    const target = e.target as Node;
    
    for (const [id, entry] of this.overlays) {
      if (entry.element && !entry.element.contains(target)) {
        // Close overlays that don't contain the click target
        entry.close();
        this.overlays.delete(id);
      }
    }
    
    this.notifyListeners();
  };
  
  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Close the topmost overlay
      const topOverlay = this.getTopOverlay();
      if (topOverlay) {
        e.preventDefault();
        e.stopPropagation();
        topOverlay.close();
        this.overlays.delete(topOverlay.id);
        this.notifyListeners();
      }
    }
  };
  
  private getTopOverlay(): OverlayEntry | null {
    let top: OverlayEntry | null = null;
    for (const entry of this.overlays.values()) {
      if (!top || entry.timestamp > top.timestamp) {
        top = entry;
      }
    }
    return top;
  }
  
  private notifyListeners() {
    this.listeners.forEach(fn => fn());
  }
  
  register(entry: Omit<OverlayEntry, 'timestamp'>): string {
    const id = entry.id || `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.overlays.set(id, { ...entry, id, timestamp: Date.now() });
    this.notifyListeners();
    return id;
  }
  
  unregister(id: string) {
    this.overlays.delete(id);
    this.notifyListeners();
  }
  
  closeAll = () => {
    for (const entry of this.overlays.values()) {
      entry.close();
    }
    this.overlays.clear();
    this.notifyListeners();
  };
  
  closeByType(type: OverlayType) {
    for (const [id, entry] of this.overlays) {
      if (entry.type === type) {
        entry.close();
        this.overlays.delete(id);
      }
    }
    this.notifyListeners();
  }
  
  hasOpenOverlays(): boolean {
    return this.overlays.size > 0;
  }
  
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const overlayManager = new OverlayManager();

// ---------------------------------------------------------------------------
// BUTTON RESPONSIVENESS SYSTEM
// Instant visual feedback, touch-optimized
// ---------------------------------------------------------------------------

export interface ButtonFeedbackOptions {
  scale?: number;
  duration?: number;
  haptic?: boolean;
}

const DEFAULT_BUTTON_FEEDBACK: ButtonFeedbackOptions = {
  scale: 0.97,
  duration: 100,
  haptic: true,
};

export function applyButtonFeedback(
  element: HTMLElement,
  options: ButtonFeedbackOptions = {}
): () => void {
  const { scale, duration, haptic } = { ...DEFAULT_BUTTON_FEEDBACK, ...options };
  
  const onPointerDown = () => {
    element.style.transform = `scale(${scale})`;
    element.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1)`;
    
    // Haptic feedback if available
    if (haptic && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };
  
  const onPointerUp = () => {
    element.style.transform = 'scale(1)';
  };
  
  const onPointerLeave = () => {
    element.style.transform = 'scale(1)';
  };
  
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointerleave', onPointerLeave);
  element.addEventListener('pointercancel', onPointerUp);
  
  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointerleave', onPointerLeave);
    element.removeEventListener('pointercancel', onPointerUp);
  };
}

// CSS-based instant button styles
export const buttonStyles = {
  base: {
    cursor: 'pointer',
    userSelect: 'none' as const,
    touchAction: 'manipulation' as const,
    WebkitTapHighlightColor: 'transparent',
    transition: 'transform 0.1s cubic-bezier(0.2,0,0.2,1), background 0.15s ease, opacity 0.15s ease',
  },
  active: {
    transform: 'scale(0.97)',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  },
};

// ---------------------------------------------------------------------------
// BLACK SCREEN PREVENTION SYSTEM
// Comprehensive fixes for blank/black screen issues
// ---------------------------------------------------------------------------

class ScreenGuard {
  private repaintScheduled = false;
  private lastVisibilityState = 'visible';
  
  constructor() {
    this.attachListeners();
  }
  
  private attachListeners() {
    if (typeof document === 'undefined') return;
    
    // Visibility change (tab switch, sleep/wake)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Window focus
    window.addEventListener('focus', this.forceRepaint);
    
    // Resume from sleep (Electron IPC)
    const ipc = (window as any).electron?.ipcRenderer;
    if (ipc) {
      ipc.on?.('dex:resume', this.forceRepaint);
      ipc.on?.('dex:wake', this.forceRepaint);
    }
    
    // Periodic health check (every 30s when visible)
    this.startHealthCheck();
  }
  
  private handleVisibilityChange = () => {
    const wasHidden = this.lastVisibilityState === 'hidden';
    this.lastVisibilityState = document.visibilityState;
    
    if (wasHidden && document.visibilityState === 'visible') {
      this.forceRepaint();
    }
  };
  
  forceRepaint = () => {
    if (this.repaintScheduled) return;
    this.repaintScheduled = true;
    
    requestAnimationFrame(() => {
      // Technique 1: Opacity flicker
      document.body.style.opacity = '0.9999';
      
      requestAnimationFrame(() => {
        document.body.style.opacity = '1';
        
        // Technique 2: Force reflow
        void document.body.offsetHeight;
        
        // Technique 3: Re-trigger CSS containment
        const root = document.getElementById('root');
        if (root) {
          root.style.contain = 'none';
          requestAnimationFrame(() => {
            root.style.contain = 'layout style';
          });
        }
        
        this.repaintScheduled = false;
      });
    });
  };
  
  private startHealthCheck() {
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        // Check if app appears blank (no visible children)
        const root = document.getElementById('root');
        if (root && root.children.length === 0) {
          console.warn('[ScreenGuard] Detected blank root, forcing repaint');
          this.forceRepaint();
        }
      }
    }, 30000);
  }
}

export const screenGuard = new ScreenGuard();

// ---------------------------------------------------------------------------
// DROPDOWN/MENU ANIMATION PRESETS
// Smooth, snappy animations for menus
// ---------------------------------------------------------------------------

export const menuAnimations = {
  enter: {
    opacity: [0, 1],
    transform: ['translateY(-8px) scale(0.96)', 'translateY(0) scale(1)'],
    duration: 150,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  exit: {
    opacity: [1, 0],
    transform: ['translateY(0) scale(1)', 'translateY(-4px) scale(0.98)'],
    duration: 100,
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
  },
};

// CSS transition strings for inline use
export const menuTransitionCSS = {
  enter: 'opacity 150ms cubic-bezier(0.2,0,0,1), transform 150ms cubic-bezier(0.2,0,0,1)',
  exit: 'opacity 100ms cubic-bezier(0.4,0,1,1), transform 100ms cubic-bezier(0.4,0,1,1)',
};

// ---------------------------------------------------------------------------
// CATEGORIZED TOOL GROUPS
// For cleaner UI organization in creative apps
// ---------------------------------------------------------------------------

export interface ToolCategory {
  id: string;
  label: string;
  icon?: string;
  tools: string[];
  collapsed?: boolean;
}

export const createToolCategories = (
  tools: { id: string; label: string; category?: string }[]
): Map<string, ToolCategory> => {
  const categories = new Map<string, ToolCategory>();
  
  for (const tool of tools) {
    const catId = tool.category || 'general';
    if (!categories.has(catId)) {
      categories.set(catId, {
        id: catId,
        label: catId.charAt(0).toUpperCase() + catId.slice(1),
        tools: [],
      });
    }
    categories.get(catId)!.tools.push(tool.id);
  }
  
  return categories;
};

// ---------------------------------------------------------------------------
// RESIZE FLUID SYSTEM
// Smooth resize with content adaptation
// ---------------------------------------------------------------------------

export interface FluidResizeOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  onResize?: (width: number, height: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

export class FluidResizer {
  private element: HTMLElement;
  private options: FluidResizeOptions;
  private rafId: number = 0;
  private isResizing = false;
  
  constructor(element: HTMLElement, options: FluidResizeOptions = {}) {
    this.element = element;
    this.options = options;
  }
  
  startResize(startX: number, startY: number, handle: string) {
    this.isResizing = true;
    this.options.onResizeStart?.();
    
    const rect = this.element.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startLeft = rect.left;
    const startTop = rect.top;
    
    const onMove = (e: PointerEvent) => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      
      this.rafId = requestAnimationFrame(() => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;
        
        // Handle resize direction
        if (handle.includes('e')) newWidth = Math.max(this.options.minWidth || 100, startWidth + dx);
        if (handle.includes('w')) {
          newWidth = Math.max(this.options.minWidth || 100, startWidth - dx);
          newLeft = startLeft + (startWidth - newWidth);
        }
        if (handle.includes('s')) newHeight = Math.max(this.options.minHeight || 100, startHeight + dy);
        if (handle.includes('n')) {
          newHeight = Math.max(this.options.minHeight || 100, startHeight - dy);
          newTop = startTop + (startHeight - newHeight);
        }
        
        // Apply max constraints
        if (this.options.maxWidth) newWidth = Math.min(newWidth, this.options.maxWidth);
        if (this.options.maxHeight) newHeight = Math.min(newHeight, this.options.maxHeight);
        
        // Maintain aspect ratio if specified
        if (this.options.aspectRatio) {
          if (handle.includes('e') || handle.includes('w')) {
            newHeight = newWidth / this.options.aspectRatio;
          } else {
            newWidth = newHeight * this.options.aspectRatio;
          }
        }
        
        // Apply GPU-accelerated styles
        this.element.style.width = `${newWidth}px`;
        this.element.style.height = `${newHeight}px`;
        this.element.style.left = `${newLeft}px`;
        this.element.style.top = `${newTop}px`;
        
        this.options.onResize?.(newWidth, newHeight);
      });
    };
    
    const onUp = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.isResizing = false;
      this.options.onResizeEnd?.();
      
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  }
}

// ---------------------------------------------------------------------------
// INIT FUNCTION
// Call once at app startup
// ---------------------------------------------------------------------------

let initialized = false;

export function initUIPolishSystem() {
  if (initialized) return;
  initialized = true;
  
  // Screen guard is auto-initialized
  console.log('[UIPolish] System initialized');
  
  // Apply global CSS for instant button feedback
  const style = document.createElement('style');
  style.textContent = `
    /* Instant button feedback */
    button, [role="button"], .dex-btn {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
    }
    
    button:active:not(:disabled), [role="button"]:active, .dex-btn:active {
      transform: scale(0.97);
    }
    
    /* Smooth dropdown animations */
    .dex-dropdown-menu {
      animation: dex-dropdown-enter 150ms cubic-bezier(0.2, 0, 0, 1) forwards;
    }
    
    @keyframes dex-dropdown-enter {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    /* Prevent text selection during drag */
    .dex-dragging * {
      user-select: none !important;
      pointer-events: none !important;
    }
    
    /* GPU acceleration hints */
    .dex-gpu-layer {
      will-change: transform;
      transform: translateZ(0);
      backface-visibility: hidden;
    }
  `;
  document.head.appendChild(style);
}
